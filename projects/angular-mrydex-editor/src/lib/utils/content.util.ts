import { Editor } from '@tiptap/core';

/**
 * `true` if the document is only paragraphs or headings with blank text (Tiptap keeps `<p></p>` even when empty).
 * Anything else (a table, a list, a rule, an image, a read-only block) counts as content.
 */
export function isEditorEmpty(editor: Editor | null): boolean {
  // Not `editor.isEmpty`: it also takes a table with empty cells as empty.
  if (!editor) return true;
  const { doc } = editor.state;
  for (let i = 0; i < doc.childCount; i++) {
    const block = doc.child(i);
    if (!block.isTextblock || block.textContent.trim()) return false;
    for (let j = 0; j < block.childCount; j++) {
      const child = block.child(j);
      if (!child.isText && child.type.name !== 'hardBreak') return false;
    }
  }
  return true;
}

/**
 * Opens the clicked link in a new tab instead of moving the cursor.
 * `transform` lets the app rewrite the `href` (for example, to point to the current environment).
 * Returns `true` if it handled the click (ProseMirror `handleDOMEvents` contract).
 */
export function openLinkInNewTab(event: MouseEvent, transform: (href: string) => string): boolean {
  const link = (event.target as HTMLElement | null)?.closest('a');
  if (!link?.href) return false;
  event.preventDefault();
  event.stopPropagation();
  window.open(transform(link.href), '_blank', 'noopener,noreferrer');
  return true;
}

/** Editor HTML, or `''` when empty. */
export function getEditorHtml(editor: Editor | null): string {
  return !editor || isEditorEmpty(editor) ? '' : editor.getHTML();
}
