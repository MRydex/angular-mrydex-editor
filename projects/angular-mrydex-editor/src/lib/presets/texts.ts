/** A visible text of a control: accessible name and, when needed, a different tooltip. */
export interface ControlText {
  readonly label: string;
  readonly tooltip?: string;
}

/**
 * Texts of the presets. For another language, build an object with this shape (or override a few with
 * `{ ...TEXTS_EN, bold: { label: '…' } }`) and pass it to the presets.
 */
export interface EditorTexts {
  /** BCP 47 language tag, used by the print document (`lang`). */
  readonly language: string;
  readonly toolbar: string;
  /** Accessible name of the editable area (`contentLabel` input). */
  readonly content: string;
  readonly placeholder: string;
  readonly undo: ControlText;
  readonly redo: ControlText;
  readonly fontFamily: string;
  readonly fontSize: string;
  readonly bold: ControlText;
  readonly italic: ControlText;
  readonly underline: ControlText;
  readonly strikethrough: ControlText;
  readonly clearFormatting: ControlText;
  readonly alignLeft: ControlText;
  readonly alignCenter: ControlText;
  readonly alignRight: ControlText;
  readonly alignJustify: ControlText;
  readonly bulletList: ControlText;
  readonly orderedList: ControlText;
  readonly outdent: ControlText;
  readonly indent: ControlText;
  readonly blockquote: ControlText;
  readonly link: ControlText;
  readonly linkPrompt: string;
  readonly insertTable: ControlText;
  readonly addRowBefore: ControlText;
  readonly addRowAfter: ControlText;
  readonly addColumnBefore: ControlText;
  readonly addColumnAfter: ControlText;
  readonly deleteRow: ControlText;
  readonly deleteColumn: ControlText;
  readonly deleteTable: ControlText;
  readonly copy: ControlText;
  readonly pasteFromWord: ControlText;
  readonly print: ControlText;
  readonly printTitle: string;
}

export const TEXTS_EN: EditorTexts = {
  language: 'en',
  toolbar: 'Editing toolbar',
  content: 'Text editor',
  placeholder: 'Type here...',
  undo: { label: 'Undo', tooltip: 'Undo (Ctrl+Z)' },
  redo: { label: 'Redo', tooltip: 'Redo (Ctrl+Y)' },
  fontFamily: 'Font family',
  fontSize: 'Font size',
  bold: { label: 'Bold', tooltip: 'Bold (Ctrl+B)' },
  italic: { label: 'Italic', tooltip: 'Italic (Ctrl+I)' },
  underline: { label: 'Underline', tooltip: 'Underline (Ctrl+U)' },
  strikethrough: { label: 'Strikethrough' },
  clearFormatting: { label: 'Clear formatting' },
  alignLeft: { label: 'Align left' },
  alignCenter: { label: 'Center' },
  alignRight: { label: 'Align right' },
  alignJustify: { label: 'Justify' },
  bulletList: { label: 'Bulleted list' },
  orderedList: { label: 'Numbered list' },
  outdent: { label: 'Decrease indent' },
  indent: { label: 'Increase indent' },
  blockquote: { label: 'Block quote' },
  link: { label: 'Link', tooltip: 'Insert/remove link' },
  linkPrompt: 'Enter the link URL:',
  insertTable: { label: 'Insert table', tooltip: 'Insert table (3x3)' },
  addRowBefore: { label: 'Add row above' },
  addRowAfter: { label: 'Add row below' },
  addColumnBefore: { label: 'Add column before' },
  addColumnAfter: { label: 'Add column after' },
  deleteRow: { label: 'Delete row' },
  deleteColumn: { label: 'Delete column' },
  deleteTable: { label: 'Delete table' },
  copy: { label: 'Copy text' },
  pasteFromWord: { label: 'Paste from Word', tooltip: 'Paste from Word (removes Word formatting)' },
  print: { label: 'Print' },
  printTitle: 'Print document',
};

export const TEXTS_ES: EditorTexts = {
  language: 'es',
  toolbar: 'Barra de herramientas de edición',
  content: 'Editor de texto',
  placeholder: 'Escriba el texto aquí...',
  undo: { label: 'Deshacer', tooltip: 'Deshacer (Ctrl+Z)' },
  redo: { label: 'Rehacer', tooltip: 'Rehacer (Ctrl+Y)' },
  fontFamily: 'Tipo de fuente',
  fontSize: 'Tamaño de fuente',
  bold: { label: 'Negrita', tooltip: 'Negrita (Ctrl+B)' },
  italic: { label: 'Cursiva', tooltip: 'Cursiva (Ctrl+I)' },
  underline: { label: 'Subrayado', tooltip: 'Subrayado (Ctrl+U)' },
  strikethrough: { label: 'Tachado' },
  clearFormatting: { label: 'Limpiar formato' },
  alignLeft: { label: 'Alinear a la izquierda' },
  alignCenter: { label: 'Centrar' },
  alignRight: { label: 'Alinear a la derecha' },
  alignJustify: { label: 'Justificar' },
  bulletList: { label: 'Lista con viñetas' },
  orderedList: { label: 'Lista numerada' },
  outdent: { label: 'Disminuir sangría' },
  indent: { label: 'Aumentar sangría' },
  blockquote: { label: 'Cita en bloque' },
  link: { label: 'Enlace', tooltip: 'Insertar/quitar enlace' },
  linkPrompt: 'Ingrese la URL del enlace:',
  insertTable: { label: 'Insertar tabla', tooltip: 'Insertar tabla (3x3)' },
  addRowBefore: { label: 'Agregar fila arriba' },
  addRowAfter: { label: 'Agregar fila abajo' },
  addColumnBefore: { label: 'Agregar columna antes' },
  addColumnAfter: { label: 'Agregar columna después' },
  deleteRow: { label: 'Borrar fila' },
  deleteColumn: { label: 'Borrar columna' },
  deleteTable: { label: 'Borrar tabla' },
  copy: { label: 'Copiar texto' },
  pasteFromWord: { label: 'Pegar desde Word', tooltip: 'Pegar desde Word (limpia el formato propio de Word)' },
  print: { label: 'Imprimir' },
  printTitle: 'Imprimir documento',
};
