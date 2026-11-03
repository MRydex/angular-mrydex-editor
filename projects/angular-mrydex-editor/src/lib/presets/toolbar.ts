import { ChainedCommands, Editor } from '@tiptap/core';
import { SelectOption, ToolbarButton, ToolbarGroup, ToolbarSelect } from '../toolbar/models/toolbar';
import { ICONS } from './icons';
import { EditorTexts, TEXTS_EN } from './texts';
import { copyText, pasteFromWord } from './utils/clipboard.util';
import { printEditor } from './utils/print.util';

/** Action that runs a chain of Tiptap commands with focus on the editor. */
export const command =
  (chain: (c: ChainedCommands) => ChainedCommands) =>
  (editor: Editor): void => {
    chain(editor.chain().focus()).run();
  };

const toOptions = (values: readonly string[]): SelectOption[] => values.map(value => ({ value, text: value }));

const inTable = (editor: Editor): boolean => editor.isActive('table');

export const FONT_FAMILIES = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Tahoma', 'Verdana'] as const;
export const FONT_SIZES = ['8px', '10px', '12px', '14px', '16px', '18px', '20px', '24px', '28px'] as const;

/** Font family select. Requires `FontFamily`. */
export function fontFamilySelect(t: EditorTexts = TEXTS_EN, families: readonly string[] = FONT_FAMILIES, fallback = 'Arial'): ToolbarSelect {
  return {
    type: 'select',
    label: t.fontFamily,
    options: toOptions(families),
    value: editor => (editor.getAttributes('textStyle')['fontFamily'] as string) || fallback,
    action: (editor, family) => {
      const chain = editor.chain().focus();
      (family ? chain.setFontFamily(family) : chain.unsetFontFamily()).run();
    },
  };
}

/**
 * Font size select. Requires `FontSize`. A saved `12pt` is shown as `16px` (same size).
 * `fallback` is the size of text without its own size: the editor default (`--mrydex-editor-font-size`).
 */
export function fontSizeSelect(t: EditorTexts = TEXTS_EN, sizes: readonly string[] = FONT_SIZES, fallback = '16px'): ToolbarSelect {
  return {
    type: 'select',
    label: t.fontSize,
    options: toOptions(sizes),
    value: editor => {
      const size = (editor.getAttributes('textStyle')['fontSize'] as string) || fallback;
      return size === '12pt' ? '16px' : size;
    },
    action: (editor, size) => {
      const chain = editor.chain().focus();
      (size ? chain.setFontSize(size) : chain.unsetFontSize()).run();
    },
  };
}

export function historyButtons(t: EditorTexts = TEXTS_EN): ToolbarButton[] {
  return [
    { icon: ICONS.undo, ...t.undo, enabled: e => e.can().undo(), action: command(c => c.undo()) },
    { icon: ICONS.redo, ...t.redo, enabled: e => e.can().redo(), action: command(c => c.redo()) },
  ];
}

export function formattingButtons(t: EditorTexts = TEXTS_EN): ToolbarButton[] {
  return [
    { icon: ICONS.bold, ...t.bold, active: e => e.isActive('bold'), action: command(c => c.toggleBold()) },
    { icon: ICONS.italic, ...t.italic, active: e => e.isActive('italic'), action: command(c => c.toggleItalic()) },
    { icon: ICONS.underline, ...t.underline, active: e => e.isActive('underline'), action: command(c => c.toggleUnderline()) },
    { icon: ICONS.strikethrough, ...t.strikethrough, active: e => e.isActive('strike'), action: command(c => c.toggleStrike()) },
    { icon: ICONS.clearFormatting, ...t.clearFormatting, action: command(c => c.unsetAllMarks().clearNodes()) },
  ];
}

export function alignmentButtons(t: EditorTexts = TEXTS_EN): ToolbarButton[] {
  return [
    { icon: ICONS.alignLeft, ...t.alignLeft, active: e => e.isActive({ textAlign: 'left' }), action: command(c => c.setTextAlign('left')) },
    { icon: ICONS.alignCenter, ...t.alignCenter, active: e => e.isActive({ textAlign: 'center' }), action: command(c => c.setTextAlign('center')) },
    { icon: ICONS.alignRight, ...t.alignRight, active: e => e.isActive({ textAlign: 'right' }), action: command(c => c.setTextAlign('right')) },
    { icon: ICONS.alignJustify, ...t.alignJustify, active: e => e.isActive({ textAlign: 'justify' }), action: command(c => c.setTextAlign('justify')) },
  ];
}

export function listButtons(t: EditorTexts = TEXTS_EN): ToolbarButton[] {
  return [
    { icon: ICONS.bulletList, ...t.bulletList, active: e => e.isActive('bulletList'), action: command(c => c.toggleBulletList()) },
    { icon: ICONS.orderedList, ...t.orderedList, active: e => e.isActive('orderedList'), action: command(c => c.toggleOrderedList()) },
    { icon: ICONS.outdent, ...t.outdent, action: command(c => c.outdent()) },
    { icon: ICONS.indent, ...t.indent, action: command(c => c.indent()) },
    { icon: ICONS.blockquote, ...t.blockquote, active: e => e.isActive('blockquote'), action: command(c => c.toggleBlockquote()) },
  ];
}

/** Link and table; the table editing buttons show up only with the cursor inside a table. */
export function linkAndTableButtons(t: EditorTexts = TEXTS_EN): ToolbarButton[] {
  return [
    { icon: ICONS.link, ...t.link, active: e => e.isActive('link'), action: e => toggleLink(e, t.linkPrompt) },
    { icon: ICONS.table, ...t.insertTable, action: command(c => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })) },
    { icon: ICONS.arrowUp, ...t.addRowBefore, visible: inTable, action: command(c => c.addRowBefore()) },
    { icon: ICONS.arrowDown, ...t.addRowAfter, visible: inTable, action: command(c => c.addRowAfter()) },
    { icon: ICONS.arrowLeft, ...t.addColumnBefore, visible: inTable, action: command(c => c.addColumnBefore()) },
    { icon: ICONS.arrowRight, ...t.addColumnAfter, visible: inTable, action: command(c => c.addColumnAfter()) },
    { icon: ICONS.deleteRow, ...t.deleteRow, visible: inTable, action: command(c => c.deleteRow()) },
    { icon: ICONS.deleteColumn, ...t.deleteColumn, visible: inTable, action: command(c => c.deleteColumn()) },
    { icon: ICONS.trash, ...t.deleteTable, visible: inTable, action: command(c => c.deleteTable()) },
  ];
}

export function utilityButtons(t: EditorTexts = TEXTS_EN): ToolbarButton[] {
  return [
    // No clipboard permission: there is nothing to report, the user can still copy with Ctrl+C.
    { icon: ICONS.copy, ...t.copy, action: editor => void copyText(editor).catch(() => undefined) },
    { icon: ICONS.pasteFromWord, ...t.pasteFromWord, action: editor => void pasteFromWord(editor) },
    { icon: ICONS.print, ...t.print, action: editor => printEditor(editor, t.printTitle, t.language) },
  ];
}

/** Full toolbar, to use with `baseExtensions()`. Can be combined with your own groups. */
export function fullToolbar(t: EditorTexts = TEXTS_EN): ToolbarGroup[] {
  return [
    { controls: historyButtons(t) },
    { controls: [fontFamilySelect(t), fontSizeSelect(t)] },
    { controls: formattingButtons(t) },
    { controls: alignmentButtons(t) },
    { controls: listButtons(t) },
    { controls: linkAndTableButtons(t) },
    { controls: utilityButtons(t), alignEnd: true },
  ];
}

function toggleLink(editor: Editor, prompt: string): void {
  if (editor.isActive('link')) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  const previous = (editor.getAttributes('link')['href'] as string) || 'https://';
  const url = window.prompt(prompt, previous);
  if (url === null) return;
  if (url.trim() === '') {
    editor.chain().focus().unsetLink().run();
    return;
  }
  editor.chain().focus().setLink({ href: withScheme(url.trim()) }).run();
}

/**
 * `example.com` becomes `https://example.com` and `a@b.com` becomes `mailto:a@b.com`;
 * a scheme (`tel:`), a path (`/x`) or an anchor (`#x`) stays.
 */
function withScheme(url: string): string {
  // `host:8080` is a port, not a scheme.
  if (/^([a-z][a-z0-9+.-]*:(?!\d)|[/#?])/i.test(url)) return url;
  return /^[^\s@/]+@[^\s@/]+$/.test(url) ? `mailto:${url}` : `https://${url}`;
}
