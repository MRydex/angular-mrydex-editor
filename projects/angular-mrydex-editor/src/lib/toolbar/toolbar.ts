import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { Editor } from '@tiptap/core';
import { ToolbarGroup } from './models/toolbar';
import { EditorToolbarGroup } from './toolbar-group/toolbar-group';

/** Keys that move the focus between controls (WAI-ARIA toolbar pattern). */
const NAVIGATION_KEYS: Readonly<Record<string, 'next' | 'previous' | 'first' | 'last'>> = {
  ArrowRight: 'next',
  ArrowLeft: 'previous',
  Home: 'first',
  End: 'last',
};

@Component({
  selector: 'mrydex-editor-toolbar',
  templateUrl: './toolbar.html',
  styleUrl: './toolbar.scss',
  imports: [EditorToolbarGroup],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorToolbar {
  private static _instances = 0;

  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly editor = input.required<Editor | null>();
  /** Changes on every editor transaction: triggers the recomputation of the controls. */
  readonly version = input.required<number>();
  readonly groups = input.required<readonly ToolbarGroup[]>();
  readonly label = input.required<string>();

  /** Unique prefix per instance for the select `id`s (label ↔ select). */
  protected readonly idPrefix = `mrydex-editor-toolbar-${++EditorToolbar._instances}`;

  /**
   * Arrow keys, Home and End move the focus between the enabled controls; Tab still reaches each one
   * (no roving tabindex, so a control that gets disabled never leaves the toolbar unreachable).
   */
  protected onKeydown(event: KeyboardEvent): void {
    const move = NAVIGATION_KEYS[event.key];
    if (!move) return;
    const controls = Array.from(this._host.nativeElement.querySelectorAll<HTMLElement>('button:not(:disabled), select'));
    const index = controls.indexOf(event.target as HTMLElement);
    if (index < 0) return;

    event.preventDefault();
    const last = controls.length - 1;
    const target = { next: index === last ? 0 : index + 1, previous: index === 0 ? last : index - 1, first: 0, last }[move];
    controls[target].focus();
  }
}
