import type { Editor } from '@tiptap/core';
import { REPLACE_DOCUMENT_META } from 'angular-mrydex-editor';

/**
 * Fills the empty shared document with the HTML stored before collaboration existed. Through the editor because the
 * HTML is parsed with its schema; `Collaboration` turns the result into the first Yjs update.
 */
export function seedEditor(editor: Editor, html: string): void {
  editor
    .chain()
    .command(({ tr }) => {
      // Not a user edit: the guards let it through and undo does not remove it.
      tr.setMeta(REPLACE_DOCUMENT_META, true).setMeta('addToHistory', false);
      return true;
    })
    .setContent(html)
    .run();
}
