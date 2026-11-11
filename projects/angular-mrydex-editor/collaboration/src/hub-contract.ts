/**
 * Method and event names of the collaboration hub. They must match the server 1:1: the contract lives in
 * `docs/collaboration-backend.md`. Every binary payload (Yjs update, awareness update) travels as base64.
 */
export const CollaborationHubMethods = {
  /** Client → server, `invoke`. Args: (documentId, yjsClientId). Returns `JoinResult`. Once per connection. */
  JOIN: 'Join',
  /** Client → server, `invoke`. Args: (update). Persists a Yjs update and relays it to the room. */
  SEND_UPDATE: 'SendUpdate',
  /** Client → server, `send`. Args: (update). Relays an awareness update (cursor, user) to the room. */
  SEND_AWARENESS: 'SendAwareness',
  /** Client → server, `invoke`. Args: (state). Replaces the stored updates this connection got in `Join` with `state`. */
  COMPACT: 'Compact',
  /** Client → server, `send`. Args: (html). Current HTML of the document, for the rest of the system. */
  SAVE_HTML: 'SaveHtml',
  /** Server → client. Payload: (update). A Yjs update from another client. */
  RECEIVE_UPDATE: 'ReceiveUpdate',
  /** Server → client. Payload: (update). An awareness update from another client. */
  RECEIVE_AWARENESS: 'ReceiveAwareness',
  /** Server → client. Payload: (yjsClientId). Someone joined: send them your awareness. */
  PEER_JOINED: 'PeerJoined',
  /** Server → client. Payload: (yjsClientId). Someone left: drop their cursor now, without waiting for its timeout. */
  PEER_LEFT: 'PeerLeft',
  /** Server → client. Payload: (html). The client that was seeding left: this client seeds the document. */
  SEED_REQUESTED: 'SeedRequested',
} as const;

/** Answer of `Join`. Mirror of the `JoinResult` record of the backend. */
export interface JoinResult {
  /** Stored Yjs updates of the document (base64), in any order. Empty for a document never opened in collaboration. */
  updates: string[];
  /** The user may edit. Without it the server rejects `SendUpdate`, `Compact` and `SaveHtml`. */
  canEdit: boolean;
  /** HTML to seed the empty shared document with: only for the one client that won the seed lock. */
  seedHtml: string | null;
  /** Another client is seeding the document: wait for its first update before editing. */
  seeding: boolean;
  /** Too many stored updates: after syncing, this client should send `Compact`. */
  compact: boolean;
}
