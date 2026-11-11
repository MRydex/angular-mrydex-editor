import type { Transaction } from '@tiptap/pm/state';

/**
 * Transaction meta that marks a programmatic replacement of the whole document. The editor sets it when the
 * parent changes `data`; set it yourself (`tr.setMeta(REPLACE_DOCUMENT_META, true)`) for your own `setContent`.
 */
export const REPLACE_DOCUMENT_META = 'mrydex:replaceDocument';

/**
 * `true` if the transaction is a programmatic replacement of the document (see `REPLACE_DOCUMENT_META`).
 * Read-only guards let it through: it is not a user edit. A user selecting everything and deleting it is not
 * one of these, even though it also replaces the whole document.
 */
export function replacesDocument(tr: Transaction): boolean {
  return tr.getMeta(REPLACE_DOCUMENT_META) === true;
}

/**
 * Meta key of the Yjs sync plugin (`PluginKey('y-sync')` from `@tiptap/y-tiptap`). Read by name so the core
 * does not depend on Yjs.
 */
const Y_SYNC_META = 'y-sync$';

/**
 * `true` if the transaction applies a change that already happened in the shared Yjs document (an edit from
 * another user, the initial load, a collaborative undo). Guards must let it through: rejecting it would leave
 * the editor out of sync with the shared document. Always `false` without collaboration.
 */
export function isRemoteChange(tr: Transaction): boolean {
  return !!tr.getMeta(Y_SYNC_META);
}
