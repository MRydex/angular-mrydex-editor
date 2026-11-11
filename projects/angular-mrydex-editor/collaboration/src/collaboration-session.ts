import { signal } from '@angular/core';
import { HubConnection, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type { Editor } from '@tiptap/core';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { fromBase64, hasContent, toBase64 } from './encoding';
import { CollaborationHubMethods as Hub, JoinResult } from './hub-contract';
import { createHubConnection } from './hub-connection';
import { seedEditor } from './seed';

export interface CollaborationOptions {
  /** Full URL of the collaboration hub, for example `${environment.API_URL}hubs/editor`. */
  hubUrl: string;
  /** Id of the shared document, with the prefix the app defines (for example `doc_123`). */
  documentId: string;
  /** Access token of the logged user. Called on every connection and reconnection. */
  accessToken: () => string | Promise<string>;
  /** Wait after the last local change before sending the HTML. Default 3000 ms. */
  saveHtmlDelayMs?: number;
  /** SignalR log level in the console. Default `Warning`. */
  logLevel?: LogLevel;
}

export type CollaborationStatus = 'connecting' | 'connected' | 'disconnected';

/** Local changes are merged for this long before being sent: one message per burst of typing, not per key. */
const FLUSH_DELAY_MS = 50;

/**
 * Real-time collaboration over a SignalR hub, for one document. The shared document is a Yjs CRDT: the server only
 * stores and relays opaque updates, it never merges them. Create one per document and `destroy()` it when leaving.
 * Browser only.
 */
export class CollaborationSession {
  /** Shared document. `Collaboration` binds the editor to it. */
  readonly doc = new Y.Doc();
  /** Cursors and users of the room. `CollaborationCaret` reads it (as `provider.awareness`). */
  readonly awareness = new Awareness(this.doc);

  private readonly _status = signal<CollaborationStatus>('disconnected');
  private readonly _synced = signal(false);
  private readonly _canEdit = signal(false);
  /** Connection state. A dropped connection retries forever (backoff up to 30 s) and resyncs on its own. */
  readonly status = this._status.asReadonly();
  /** The document holds the server content: until then the editor should stay read-only. */
  readonly synced = this._synced.asReadonly();
  /** The server lets this user edit. Bind it, with `synced`, to the editor `readOnly`. */
  readonly canEdit = this._canEdit.asReadonly();

  private readonly _hub: HubConnection;
  private readonly _listeners = new AbortController();
  private _editor: Editor | null = null;
  /** HTML to seed with, waiting for the editor (it needs its schema). */
  private _seedHtml: string | null = null;
  private _outbox: Uint8Array[] = [];
  private _flushTimer: ReturnType<typeof setTimeout> | undefined;
  private _saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** `Join` succeeded on the current connection: before that the server rejects every other call. */
  private _joined = false;
  private _destroyed = false;

  constructor(private readonly _options: CollaborationOptions) {
    this._hub = createHubConnection(_options.hubUrl, _options.accessToken, _options.logLevel ?? LogLevel.Warning);

    this._hub.on(Hub.RECEIVE_UPDATE, (update: string) => {
      Y.applyUpdate(this.doc, fromBase64(update), this);
      this._synced.set(true);
    });
    this._hub.on(Hub.RECEIVE_AWARENESS, (update: string) =>
      applyAwarenessUpdate(this.awareness, fromBase64(update), this),
    );
    this._hub.on(Hub.PEER_JOINED, () => this._sendAwareness());
    this._hub.on(Hub.PEER_LEFT, (clientId: number) => removeAwarenessStates(this.awareness, [clientId], this));
    this._hub.on(Hub.SEED_REQUESTED, (html: string) => this._seed(html));

    // The server forgot this connection: join again, which also sends what it missed meanwhile.
    this._hub.onreconnecting(() => this._setOffline('connecting'));
    this._hub.onreconnected(() => this._background(this._join()));
    this._hub.onclose(() => this._setOffline('disconnected'));

    this.doc.on('update', this._onDocUpdate);
    this.awareness.on('update', this._onAwarenessUpdate);
    // Closing the tab: send what is still waiting in the timers. There is no time for an answer.
    window.addEventListener('pagehide', () => this._flushNow(), { signal: this._listeners.signal });
  }

  /** Connects and joins the document. Rejects if the first connection fails (the app may retry). */
  async connect(): Promise<void> {
    if (this._destroyed || this._hub.state !== HubConnectionState.Disconnected) return;
    this._status.set('connecting');
    try {
      await this._hub.start();
      await this._join();
    } catch (error) {
      this._status.set('disconnected');
      throw error;
    }
  }

  /** Sends what is pending, leaves the room and frees the document. The session cannot be reused. */
  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    this._listeners.abort();
    await this._flushNow();
    // Still listening: the removal reaches the others as an awareness update.
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'local');
    this.doc.off('update', this._onDocUpdate);
    this.awareness.off('update', this._onAwarenessUpdate);
    await this._hub.stop().catch(() => undefined);
    this.awareness.destroy();
    this.doc.destroy();
  }

  /** @internal Called by `collaborationExtensions` when the editor is created. */
  attach(editor: Editor): void {
    this._editor = editor;
    this._applySeed();
  }

  /** @internal Called by `collaborationExtensions` when the editor is destroyed. */
  detach(editor: Editor): void {
    if (this._editor === editor) this._editor = null;
  }

  private async _join(): Promise<void> {
    let result: JoinResult;
    try {
      result = await this._hub.invoke<JoinResult>(Hub.JOIN, this._options.documentId, this.doc.clientID);
    } catch (error) {
      // Rejected (no access, document gone): nothing may be edited until a join succeeds.
      this._canEdit.set(false);
      this._synced.set(false);
      throw error;
    }
    this._canEdit.set(result.canEdit);
    // Joined from here: what is typed while the sends below are in flight goes out normally (repeats are harmless).
    this._joined = true;

    const server = result.updates.length > 0 ? Y.mergeUpdates(result.updates.map(fromBase64)) : null;
    if (server) Y.applyUpdate(this.doc, server, this);
    this._status.set('connected');

    if (result.canEdit) {
      // Local changes the server does not have: made before joining, or lost when the connection dropped.
      const missing = Y.encodeStateAsUpdate(this.doc, server ? Y.encodeStateVectorFromUpdate(server) : undefined);
      if (hasContent(missing)) await this._send(missing);
      if (result.compact) await this._hub.invoke(Hub.COMPACT, toBase64(Y.encodeStateAsUpdate(this.doc)));
    }

    // While someone else seeds, the document stays empty: its first update ends the wait.
    this._synced.set(!result.seeding || this.doc.store.clients.size > 0);
    if (result.seedHtml) this._seed(result.seedHtml);
    this._sendAwareness();
  }

  private readonly _onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this || !this._canEdit()) return;
    this._outbox.push(update);
    this._flushTimer ??= setTimeout(() => this._flush(), FLUSH_DELAY_MS);
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._saveHtml(), this._options.saveHtmlDelayMs ?? 3_000);
  };

  private readonly _onAwarenessUpdate = (_changes: unknown, origin: unknown): void => {
    // Only this client's own state: remote states and their timeouts are not relayed.
    if (origin === 'local') this._sendAwareness();
  };

  private _setOffline(status: CollaborationStatus): void {
    this._joined = false;
    this._status.set(status);
  }

  /** Never rejects: a failed send is logged and recovered by a resync. */
  private _flush(): Promise<void> {
    clearTimeout(this._flushTimer);
    this._flushTimer = undefined;
    const updates = this._outbox;
    this._outbox = [];
    // Offline: dropping them is safe, `_join` sends whatever the server is missing after reconnecting.
    if (updates.length === 0 || !this._joined) return Promise.resolve();
    // Not stored on the server (an error there): resync now instead of waiting for the next reconnection.
    return this._send(Y.mergeUpdates(updates)).catch(error => {
      console.error('Collaboration: update rejected, resyncing.', error);
      if (!this._destroyed) this._background(this._join());
    });
  }

  private _flushNow(): Promise<void> {
    const flushed = this._flush();
    if (this._saveTimer !== undefined) this._saveHtml();
    return flushed;
  }

  private _saveHtml(): void {
    clearTimeout(this._saveTimer);
    this._saveTimer = undefined;
    const editor = this._editor;
    if (!editor || !this._canEdit() || !this._joined) return;
    this._background(this._hub.send(Hub.SAVE_HTML, editor.isEmpty ? '' : editor.getHTML()));
  }

  private _send(update: Uint8Array): Promise<void> {
    return this._hub.invoke(Hub.SEND_UPDATE, toBase64(update));
  }

  private _sendAwareness(): void {
    // A `null` local state is sent too: it is how the others learn this client left.
    if (!this._joined) return;
    const update = encodeAwarenessUpdate(this.awareness, [this.doc.clientID]);
    this._background(this._hub.send(Hub.SEND_AWARENESS, toBase64(update)));
  }

  private _seed(html: string): void {
    // Content already here (the server lost its copy): resend it instead of duplicating it with the HTML.
    if (this.doc.store.clients.size > 0) {
      this._background(this._send(Y.encodeStateAsUpdate(this.doc)));
      return;
    }
    this._seedHtml = html;
    this._applySeed();
  }

  private _applySeed(): void {
    if (!this._editor || this._seedHtml === null) return;
    seedEditor(this._editor, this._seedHtml);
    this._seedHtml = null;
    this._synced.set(true);
  }

  /** Nobody waits for it: log the error instead of an "Uncaught (in promise)". */
  private _background(task: Promise<unknown>): void {
    task.catch(error => {
      if (!this._destroyed) console.error('Collaboration:', error);
    });
  }
}
