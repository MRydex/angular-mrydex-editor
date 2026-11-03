import { Editor } from '@tiptap/core';

const PRINT_STYLES = `
  body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; padding: 2cm; margin: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #333; padding: 6px 10px; }
  blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 1rem; }
  a { color: inherit; text-decoration: none; }
`;

/**
 * Prints the editor content from a hidden iframe. The content is copied as DOM nodes
 * (`importNode` of the ProseMirror DOM), without building HTML strings or using `document.write`.
 */
export function printEditor(editor: Editor, title = 'Print document', language = 'en'): void {
  const frame = document.createElement('iframe');
  frame.title = title;
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position: fixed; width: 0; height: 0; border: 0;';
  // Constant srcdoc: the document is ready on `load` (Firefox replaces the initial about:blank).
  frame.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"><title></title></head><body></body></html>';

  frame.addEventListener(
    'load',
    () => {
      const win = frame.contentWindow;
      const doc = frame.contentDocument;
      if (!win || !doc) {
        frame.remove();
        return;
      }

      doc.documentElement.lang = language;
      doc.title = title;

      const styles = doc.createElement('style');
      styles.textContent = PRINT_STYLES;
      doc.head.append(styles);

      const content = doc.importNode(editor.view.dom, true);
      content.removeAttribute('contenteditable');
      content.querySelectorAll('.column-resize-handle').forEach(node => node.remove());
      doc.body.append(content);

      win.addEventListener('afterprint', () => frame.remove(), { once: true });
      win.focus();
      win.print();
    },
    { once: true },
  );

  document.body.append(frame);
}
