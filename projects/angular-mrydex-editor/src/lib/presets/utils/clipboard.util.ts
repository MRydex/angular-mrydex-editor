import { Editor } from '@tiptap/core';
import { getEditorHtml } from '../../utils/content.util';

const WORD_MARKERS = /class="?Mso|urn:schemas-microsoft-com|<o:p/i;

/** Copies the content with formatting (HTML) and, if the browser does not allow it, as plain text. */
export async function copyText(editor: Editor): Promise<void> {
  const html = getEditorHtml(editor);
  const text = editor.getText();
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
  } catch {
    await navigator.clipboard.writeText(text);
  }
}

/**
 * Pastes the clipboard exactly like Ctrl+V: `view.pasteHTML`/`pasteText` go through the same path as a keyboard
 * paste (the `transformPaste` input and ProseMirror whitespace normalization).
 * `insertContent` does not work here: it keeps the line breaks of Word HTML and breaks the paragraphs.
 * If the browser denies access, it leaves the focus in the editor so the user can paste with Ctrl+V.
 */
export async function pasteFromWord(editor: Editor): Promise<void> {
  editor.commands.focus();
  try {
    const items = await navigator.clipboard.read();
    const withHtml = items.find(item => item.types.includes('text/html'));
    if (withHtml) {
      editor.view.pasteHTML(await (await withHtml.getType('text/html')).text());
      return;
    }
    editor.view.pasteText(await navigator.clipboard.readText());
  } catch {
    // No clipboard permission: the focus is already in the editor.
  }
}

/**
 * Removes from Word HTML what is not content: conditional comments, `<style>`/`<meta>`, namespaced tags
 * (`<o:p>`, `<w:*>`), `Mso*` classes and `mso-*` styles. HTML that does not come from Word is returned as is.
 * Parsing is inert (`DOMParser` does not run scripts) and Tiptap then filters everything against its schema.
 * It is not a sanitizer (event attributes survive): use it only as `transformPaste`, never before `innerHTML`.
 */
export function cleanWordHtml(html: string): string {
  if (!WORD_MARKERS.test(html)) return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, meta, link, script, title, xml').forEach(node => node.remove());

  const comments: ChildNode[] = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) comments.push(walker.currentNode as ChildNode);
  comments.forEach(comment => comment.remove());

  doc.body.querySelectorAll('*').forEach(element => {
    if (element.tagName.includes(':')) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    element.removeAttribute('class');
    element.removeAttribute('lang');
    cleanWordStyle(element);
  });

  return doc.body.innerHTML;
}

function cleanWordStyle(element: Element): void {
  const style = element.getAttribute('style');
  if (style === null) return;
  const clean = style
    .split(';')
    .map(rule => rule.trim())
    .filter(rule => rule && !rule.toLowerCase().startsWith('mso-'))
    .join('; ');
  if (clean) {
    element.setAttribute('style', clean);
  } else {
    element.removeAttribute('style');
  }
}
