import { Extension, type Extensions } from '@tiptap/core';
import { Collaboration } from '@tiptap/extension-collaboration';
import { CollaborationCaret } from '@tiptap/extension-collaboration-caret';

import { CollaborationSession } from './collaboration-session';

/** What the other users see on this user's cursor. */
export interface CollaborationUser {
  name: string;
  /** `#RRGGBB`. Any other format is drawn transparent (the caret extension sanitizes remote colors). */
  color: string;
}

/**
 * Extensions that bind the editor to a `CollaborationSession`: shared content, collaborative undo and remote
 * cursors. Add them to the editor `extensions` with `baseExtensions(placeholder, { undoRedo: false })`: the local
 * undo history cannot coexist with the collaborative one.
 */
export function collaborationExtensions(session: CollaborationSession, user: CollaborationUser): Extensions {
  return [
    Collaboration.configure({ document: session.doc }),
    CollaborationCaret.configure({ provider: session, user }),
    Extension.create({
      name: 'collaborationSession',
      onCreate() {
        session.attach(this.editor);
      },
      onDestroy() {
        session.detach(this.editor);
      },
    }),
  ];
}
