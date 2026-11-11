import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewEncapsulation,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Editor, Extensions } from '@tiptap/core';
import { ToolbarGroup } from './toolbar/models/toolbar';
import { EditorToolbar } from './toolbar/toolbar';
import { REPLACE_DOCUMENT_META } from './presets/extensions/replaces-document';
import { getEditorHtml, isEditorEmpty, openLinkInNewTab } from './utils/content.util';

/**
 * Rich text editor (Tiptap). Nothing is enabled by default: the app passes the extensions,
 * the toolbar and the paste handling. The library presets are optional.
 */
@Component({
  selector: 'mrydex-editor',
  templateUrl: './editor.html',
  styleUrls: ['./editor.scss', './editor-content.scss'],
  // No encapsulation on purpose: Tiptap renders the content DOM at runtime, outside the template, and
  // encapsulated styles would not reach it. Every selector lives under `.mrydex-editor*` so it does not leak.
  encapsulation: ViewEncapsulation.None,
  imports: [EditorToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MrydexEditor implements AfterViewInit, OnDestroy {
  readonly data = model<string>('');
  readonly readOnly = input<boolean>(false);
  /**
   * Tiptap extensions. They must include at least Document, Paragraph and Text (for example `StarterKit`
   * or the `baseExtensions()` preset). Read once, when the editor is created.
   */
  readonly extensions = input.required<Extensions>();
  /** Toolbar groups, in order. Without groups no toolbar is rendered. */
  readonly toolbar = input<readonly ToolbarGroup[]>([]);
  /** Accessible name of the toolbar (`aria-label`), in the app language. */
  readonly toolbarLabel = input<string>('Toolbar');
  /** Accessible name of the editable area (`aria-label`), in the app language. */
  readonly contentLabel = input<string>('Text editor');
  /** Rewrites the `href` of a clicked link before opening it in a new tab. */
  readonly transformLink = input<(href: string) => string>(href => href);
  /** Transforms pasted HTML before inserting it (for example, the `cleanWordHtml` preset). */
  readonly transformPaste = input<(html: string) => string>(html => html);
  readonly selectionChange = output<boolean>();
  readonly ready = output<void>();

  private readonly _container = viewChild<ElementRef<HTMLElement>>('editorContainer');

  /** Tiptap instance: exists between `ngAfterViewInit` and `ngOnDestroy`. */
  private readonly _tiptap = signal<Editor | null>(null);
  /** Increases on every transaction: the toolbar recomputes its conditions from it. */
  private readonly _version = signal(0);
  /** HTML the editor just wrote to `data`: the sync effect skips it without serializing again. */
  private _emitted: string | null = null;

  /** Tiptap instance, for app-specific commands (`instance()?.chain()…`). */
  readonly instance = this._tiptap.asReadonly();
  protected readonly version = this._version.asReadonly();
  /** With the Yjs `Collaboration` extension the shared document owns the content: `data` only goes out. */
  private readonly _collaborative = computed(() => this.extensions().some(e => e.name === 'collaboration'));

  // effect() on purpose: it syncs an imperative library (Tiptap) with the inputs, it does not derive state.
  private readonly _syncDataEffect = effect(() => {
    const content = this.data();
    const editor = this._tiptap();
    const emitted = this._emitted;
    this._emitted = null;
    if (!editor || this._collaborative() || content === emitted || content === getEditorHtml(editor)) return;
    if (!content?.trim() && isEditorEmpty(editor)) return;
    editor
      .chain()
      .command(({ tr }) => {
        // Not a user edit: the guards let it through and Ctrl+Z does not undo it.
        tr.setMeta(REPLACE_DOCUMENT_META, true).setMeta('addToHistory', false);
        return true;
      })
      .setContent(content || '', { emitUpdate: false })
      .run();
  });

  private readonly _syncReadOnlyEffect = effect(() => {
    const readOnly = this.readOnly();
    const editor = this._tiptap();
    if (editor?.isEditable === readOnly) {
      editor.setEditable(!readOnly);
    }
  });

  // `editorProps.attributes` is re-read only on a view update: a new `contentLabel` forces one.
  private readonly _syncLabelEffect = effect(() => {
    this.contentLabel();
    this._tiptap()?.view.setProps({});
  });

  ngAfterViewInit(): void {
    const container = this._container()?.nativeElement;
    if (!container) return;

    this._tiptap.set(
      new Editor({
        element: container,
        editorProps: {
          // A function: ProseMirror re-reads it on every view update, so label and read-only stay current.
          attributes: () => ({
            class: 'mrydex-editor-content',
            role: 'textbox',
            'aria-multiline': 'true',
            'aria-label': this.contentLabel(),
            'aria-readonly': String(this.readOnly()),
          }),
          handleDOMEvents: { click: (_view, event) => openLinkInNewTab(event, this.transformLink()) },
          transformPastedHTML: html => this.transformPaste()(html),
        },
        extensions: this.extensions(),
        content: this._collaborative() ? undefined : this.data() || '',
        editable: !this.readOnly(),
        onUpdate: ({ editor }) => {
          const html = getEditorHtml(editor);
          if (this.data() !== html) {
            this._emitted = html;
            this.data.set(html);
          }
        },
        onSelectionUpdate: ({ editor }) => this.selectionChange.emit(!editor.state.selection.empty),
        // Every change (content, selection, `setContent`) is a transaction: one refresh covers them all.
        onTransaction: () => this._refreshToolbar(),
      }),
    );

    this._refreshToolbar();
    this.ready.emit();
  }

  ngOnDestroy(): void {
    this._tiptap()?.destroy();
    this._tiptap.set(null);
  }

  getHTML(): string {
    return getEditorHtml(this._tiptap());
  }

  isEmpty(): boolean {
    return isEditorEmpty(this._tiptap());
  }

  getText(): string {
    return this._tiptap()?.getText() ?? '';
  }

  getSelectedText(): string {
    const editor = this._tiptap();
    if (!editor || editor.state.selection.empty) return '';
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, ' ');
  }

  hasSelection(): boolean {
    const editor = this._tiptap();
    return !!editor && !editor.state.selection.empty;
  }

  /** Inserts HTML at the cursor position. */
  insertContent(html: string): void {
    this._tiptap()?.chain().focus().insertContent(html).run();
  }

  focus(): void {
    this._tiptap()?.commands.focus();
  }

  scrollToElement(id: string): void {
    const container = this._container()?.nativeElement;
    const element = (container?.querySelector(`#${CSS.escape(id)}`) ?? document.getElementById(id)) as HTMLElement | null;
    if (!element) return;

    // Reduced motion: jump instead of scrolling. The color flash stays: it does not move anything.
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    const highlight = 'rgb(33, 184, 213)';
    element.animate([{ backgroundColor: highlight }, { backgroundColor: highlight, offset: 0.6 }, {}], {
      duration: 1600,
      easing: 'ease-out',
    });
  }

  private _refreshToolbar(): void {
    this._version.update(version => version + 1);
  }
}
