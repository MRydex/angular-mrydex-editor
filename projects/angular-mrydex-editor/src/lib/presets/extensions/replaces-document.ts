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
