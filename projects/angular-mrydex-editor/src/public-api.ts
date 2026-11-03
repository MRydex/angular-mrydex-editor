/*
 * Public API Surface of angular-mrydex-editor
 */

// Core: the editor enables nothing by default; everything comes in through inputs.
export { MrydexEditor } from './lib/editor';
export type { Condition, SelectOption, ToolbarButton, ToolbarControl, ToolbarGroup, ToolbarSelect } from './lib/toolbar/models/toolbar';

// Optional presets: use them, combine them or replace them.
export { baseExtensions } from './lib/presets/extensions/base-extensions';
export { EditableField } from './lib/presets/extensions/editable-field';
export { FontSize } from './lib/presets/extensions/font-size';
export { Indent } from './lib/presets/extensions/indent';
export { isExplicitLink } from './lib/presets/extensions/is-explicit-link';
export { ReadOnlyBlock } from './lib/presets/extensions/read-only-block';
export { REPLACE_DOCUMENT_META, replacesDocument } from './lib/presets/extensions/replaces-document';
export { ICONS, materialIcon } from './lib/presets/icons';
export { TEXTS_EN, TEXTS_ES } from './lib/presets/texts';
export type { ControlText, EditorTexts } from './lib/presets/texts';
export {
  alignmentButtons,
  command,
  FONT_FAMILIES,
  FONT_SIZES,
  fontFamilySelect,
  fontSizeSelect,
  formattingButtons,
  fullToolbar,
  historyButtons,
  linkAndTableButtons,
  listButtons,
  utilityButtons,
} from './lib/presets/toolbar';
export { cleanWordHtml, copyText, pasteFromWord } from './lib/presets/utils/clipboard.util';
export { printEditor } from './lib/presets/utils/print.util';
