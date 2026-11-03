# angular-mrydex-editor

Generic, plugin-driven rich text editor for Angular 21 (21.2+), built on [Tiptap](https://tiptap.dev).

The editor **enables nothing by default**: your app passes the extensions, the toolbar and the paste handling.
The library ships optional presets (extensions, buttons, selects, icons, texts and utilities) that you can use,
combine with your own or replace.

- Standalone component, signals, `OnPush`, zoneless-ready.
- No UI library dependency.
- Any language: every visible text comes from your app (English and Spanish presets included).
- Locked templates: read-only blocks and editable fields inside fixed text.

## Installation

```bash
npm i angular-mrydex-editor
```

Tiptap comes as a dependency: no need to install it. No stylesheet import needed: the component ships its own styles, all scoped under `.mrydex-editor*`.

The major version follows Angular: `21.x` of this library supports Angular 21.

## Minimal usage

```ts
import { baseExtensions, MrydexEditor } from 'angular-mrydex-editor';

@Component({
  imports: [MrydexEditor],
  template: `<mrydex-editor [(data)]="html" [extensions]="extensions" />`,
})
export class Example {
  protected readonly html = signal('');
  protected readonly extensions = baseExtensions();
}
```

## With the presets

```ts
import { baseExtensions, cleanWordHtml, fullToolbar, MrydexEditor, TEXTS_EN } from 'angular-mrydex-editor';

protected readonly texts = TEXTS_EN;
protected readonly extensions = baseExtensions(this.texts.placeholder);
protected readonly toolbar = fullToolbar(this.texts);
protected readonly cleanWordHtml = cleanWordHtml;
```

```html
<mrydex-editor
  [(data)]="html"
  [extensions]="extensions"
  [toolbar]="toolbar"
  [toolbarLabel]="texts.toolbar"
  [contentLabel]="texts.content"
  [transformPaste]="cleanWordHtml" />
```

## API

### Inputs and outputs

| Name | Type | Default | Description |
|---|---|---|---|
| `data` (model) | `string` | `''` | Content HTML. `''` when empty. |
| `extensions` (required) | `Extensions` | | Tiptap extensions. At least Document, Paragraph and Text. Read once, when the editor is created. |
| `toolbar` | `ToolbarGroup[]` | `[]` | Groups of controls, in order. No groups, no toolbar. |
| `toolbarLabel` | `string` | `'Toolbar'` | Accessible name of the toolbar, in your app language. |
| `contentLabel` | `string` | `'Text editor'` | Accessible name of the editable area, in your app language. |
| `readOnly` | `boolean` | `false` | Hides the toolbar and disables editing. |
| `transformLink` | `(href) => string` | identity | Rewrites the `href` of a clicked link before opening it in a new tab. |
| `transformPaste` | `(html) => string` | identity | Transforms pasted HTML (preset: `cleanWordHtml`). |
| `selectionChange` | `boolean` | | `true` when there is selected text. |
| `ready` | `void` | | The editor has been created. |

### Methods (through `viewChild(MrydexEditor)`)

`getHTML()`, `getText()`, `getSelectedText()`, `isEmpty()`, `hasSelection()`, `insertContent(html)`, `focus()`,
`scrollToElement(id)` and `instance()` (the Tiptap instance, for your own commands).

> The editor only produces HTML allowed by its extensions, but whatever you store can be changed outside the
> editor (another client, a direct API call). Sanitize it where you display it: Angular `[innerHTML]` does it for
> you; never use `bypassSecurityTrustHtml` on it. Sanitize it in the backend too.

## Toolbar

A toolbar is a list of groups; each group is a list of controls (buttons or selects).

```ts
import { command, formattingButtons, historyButtons, materialIcon, ToolbarGroup } from 'angular-mrydex-editor';

const toolbar: ToolbarGroup[] = [
  { controls: historyButtons() },
  {
    controls: [
      {
        label: 'Insert reference',
        text: 'Reference',                       // visible text: prominent button
        action: editor => openPicker().then(html => editor.chain().focus().insertContent(html).run()),
      },
      {
        icon: materialIcon('<svg ...>...</svg>'), // your own SVG (a code constant)
        label: 'Highlight',
        active: editor => editor.isActive('highlight'),
        action: command(c => c.toggleMark('highlight')),
      },
      {
        type: 'select',
        label: 'Style',
        options: [{ value: 'normal', text: 'Normal' }, { value: 'title', text: 'Title' }],
        value: editor => (editor.isActive('heading') ? 'title' : 'normal'),
        action: editor => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
    ],
  },
  { controls: formattingButtons(), alignEnd: true },
];
```

- **Keyboard:** Tab reaches every control; inside the toolbar, arrow keys, Home and End move between them.
- **Button:** `label` (`aria-label`), `icon` (SVG) and/or `text`, `action(editor)`, and optional `tooltip`,
  `active(editor)` (toggle with `aria-pressed`), `enabled(editor)` and `visible(editor)`.
- **Select:** `type: 'select'`, `label`, `options`, `value(editor)`, `action(editor, value)` and `visible(editor)`.
- Conditions are recomputed on every editor change.
- A select whose current value is not among its options (a pasted `Calibri`) shows that value as an extra option.

> `icon` is painted as a CSS mask in the button color: it never enters the DOM, so it cannot run scripts.
> It is shown at 18px and colors inside the SVG are ignored (single-color icons).

## Plugins

A plugin is a Tiptap extension (node, mark or extension, following the
[Tiptap docs](https://tiptap.dev/docs/editor/extensions/custom-extensions)), one or more toolbar controls, or
both. Build it in your app and pass it through the inputs:

```ts
const extensions = [...baseExtensions(), MyNode, MyMark];
const toolbar = [...fullToolbar(), { controls: [myButton] }];
```

Import everything Tiptap from `angular-mrydex-editor/tiptap` (all of `@tiptap/core`, plus `Plugin`, `PluginKey`
and the ProseMirror types), so your app uses the same Tiptap copy as the editor:

```ts
import { Mark, mergeAttributes } from 'angular-mrydex-editor/tiptap';

// Typing a new command: augment `@tiptap/core` (installed by this library).
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    highlight: { toggleHighlight: () => ReturnType };
  }
}

export const Highlight = Mark.create({
  name: 'highlight',
  parseHTML: () => [{ tag: 'mark' }],
  renderHTML: ({ HTMLAttributes }) => ['mark', mergeAttributes(HTMLAttributes), 0],
  addCommands() {
    return { toggleHighlight: () => ({ commands }) => commands.toggleMark(this.name) };
  },
});
```

Style the DOM your extensions render under `.mrydex-editor-content`.

## Theming

Override the CSS variables on `mrydex-editor` or any ancestor (`:root` for the whole app):

```css
mrydex-editor {
  --mrydex-editor-accent: #7c3aed;
  --mrydex-editor-font-size: 14px;
}
```

| Variable | Default | Used for |
|---|---|---|
| `--mrydex-editor-background` | `#ffffff` | Editor and select background. |
| `--mrydex-editor-text` | `#1e293b` | Text. |
| `--mrydex-editor-muted-text` | `#475569` | Buttons and blockquotes. |
| `--mrydex-editor-placeholder` | `#64748b` | Placeholder and blockquote border. |
| `--mrydex-editor-border` | `#cbd5e1` | Frame, select and table borders. |
| `--mrydex-editor-divider` | `#e2e8f0` | Group separators and button hover. |
| `--mrydex-editor-accent` | `#0369a1` | Links, focus ring and column resize handle. |
| `--mrydex-editor-surface` | `#f8fafc` | Toolbar and read-only editor background. |
| `--mrydex-editor-locked-background` | `#f1f5f9` | Read-only blocks and table headers. |
| `--mrydex-editor-field-background` | `#dbeafe` | Editable fields. |
| `--mrydex-editor-active-background`, `-active-border`, `-active-text` | `#e0f2fe`, `#7dd3fc`, `#0369a1` | Pressed toggle buttons. |
| `--mrydex-editor-prominent`, `-prominent-hover` | `#0369a1`, `#075985` | Buttons with text (white text: keep AA contrast). |
| `--mrydex-editor-font-family`, `--mrydex-editor-font-size` | `Arial, sans-serif`, `16px` | Content text. If you change the size, pass it as `fallback` to `fontSizeSelect`. |
| `--mrydex-editor-radius` | `4px` | Corners. |

## Languages

The core has no texts of its own besides the `toolbarLabel` and `contentLabel` defaults. The presets take an `EditorTexts` object;
without it they use `TEXTS_EN`. `TEXTS_EN` and `TEXTS_ES` are included; for another language build an object
with the same shape (TypeScript tells you if a text is missing):

```ts
import { EditorTexts, TEXTS_EN, baseExtensions, fullToolbar } from 'angular-mrydex-editor';

const TEXTS_PT: EditorTexts = {
  ...TEXTS_EN,
  language: 'pt',
  toolbar: 'Barra de ferramentas',
  placeholder: 'Digite aqui...',
  bold: { label: 'Negrito', tooltip: 'Negrito (Ctrl+B)' },
  // …the rest of the texts
};

const toolbar = fullToolbar(TEXTS_PT);
const extensions = baseExtensions(TEXTS_PT.placeholder);
```

```html
<mrydex-editor [extensions]="extensions" [toolbar]="toolbar" [toolbarLabel]="TEXTS_PT.toolbar" />
```

Your own controls carry their texts in `label`, `tooltip`, `text` and `options`: write them in your language.

## Locking parts of the text

With `ReadOnlyBlock` and `EditableField` (both in `baseExtensions()`) the lock travels inside the `data` HTML,
through the `contenteditable` attribute:

```ts
// Fixed text on top, free space below: users can only type under the block.
html.set(`<div contenteditable="false"><h2>Claim</h2><p>Text that cannot be changed.</p></div><p></p>`);

// Template with blanks: if there is at least one field, only the fields can be edited.
html.set(`<p>Dear <span contenteditable="true">name</span>, we hereby inform you…</p>`);
```

| Extension | What it locks |
|---|---|
| `ReadOnlyBlock` | Every `<div contenteditable="false">`: it cannot be deleted or overwritten, and nothing can be typed before it when the document starts with one. |
| `EditableField` | When there is any `contenteditable="true"`, everything outside those fields. |

Replacing the whole document when your app changes `data` always goes through: it is not a user edit.
A user selecting everything and deleting it is blocked like any other edit. To replace the content yourself
through `instance()`, mark the transaction so the guards let it through:

```ts
import { REPLACE_DOCUMENT_META } from 'angular-mrydex-editor';

editor.chain()
  .command(({ tr }) => { tr.setMeta(REPLACE_DOCUMENT_META, true); return true; })
  .setContent(html)
  .run();
```

For your own guards with the same rule, use `replacesDocument(tr)` in `filterTransaction`.

> Escape any data you put into those templates: the `data` HTML is parsed.

## Presets

| Export | What it is |
|---|---|
| `baseExtensions(placeholder?)` | StarterKit, font family, font size, line height, alignment, tables, indent, editable fields, read-only blocks and placeholder. |
| `FontSize`, `Indent`, `EditableField`, `ReadOnlyBlock`, `isExplicitLink`, `replacesDocument`, `REPLACE_DOCUMENT_META` | Individual extensions and helpers. |
| `fullToolbar(texts?)` | Toolbar with all the groups below. |
| `historyButtons`, `formattingButtons`, `alignmentButtons`, `listButtons`, `linkAndTableButtons`, `utilityButtons` `(texts?)` | Button groups. |
| `fontFamilySelect(texts?, families?, fallback?)`, `fontSizeSelect(texts?, sizes?, fallback?)`, `FONT_FAMILIES`, `FONT_SIZES` | Font family and size selects. |
| `TEXTS_EN`, `TEXTS_ES`, `EditorTexts`, `ControlText` | Preset texts per language. |
| `ICONS`, `materialIcon(svg)` | Material Symbols icons and a normalizer for SVGs copied from Google Fonts. |
| `command(chain)` | Builds an action that runs Tiptap commands with focus. |
| `copyText`, `pasteFromWord`, `cleanWordHtml`, `printEditor` | Utilities. |

## License

[MIT](./LICENSE) © Ezequiel Merino Spinedi
