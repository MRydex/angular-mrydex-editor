import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Editor } from '@tiptap/core';
import { EditorIcon } from '../../icon/editor-icon';
import { SelectOption, ToolbarButton, ToolbarControl, ToolbarSelect } from '../models/toolbar';

type ControlView =
  | { readonly type: 'button'; readonly button: ToolbarButton; readonly active: boolean; readonly enabled: boolean }
  | {
      readonly type: 'select';
      readonly select: ToolbarSelect;
      readonly value: string;
      /** The select options, plus the current value when it is not one of them (a pasted `Calibri`, `13px`…). */
      readonly options: readonly SelectOption[];
      readonly id: string;
    };

/** Group of toolbar controls (buttons and selects). */
@Component({
  selector: 'mrydex-editor-toolbar-group',
  templateUrl: './toolbar-group.html',
  styleUrl: './toolbar-group.scss',
  imports: [EditorIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'editor-toolbar-group',
    '[class.editor-toolbar-group--end]': 'alignEnd()',
  },
})
export class EditorToolbarGroup {
  readonly editor = input.required<Editor | null>();
  readonly version = input.required<number>();
  readonly controls = input.required<readonly ToolbarControl[]>();
  readonly alignEnd = input(false);
  readonly idPrefix = input.required<string>();

  protected readonly view = computed<ControlView[]>(() => {
    this.version();
    const editor = this.editor();
    if (!editor) return [];

    return this.controls()
      .filter(control => !control.visible || control.visible(editor))
      .map((control, i): ControlView => {
        if (control.type !== 'select') {
          return {
            type: 'button',
            button: control,
            active: !!control.active?.(editor),
            enabled: !control.enabled || control.enabled(editor),
          };
        }
        const value = control.value(editor);
        const known = control.options.some(option => option.value === value);
        return {
          type: 'select',
          select: control,
          value,
          options: known ? control.options : [{ value, text: value }, ...control.options],
          id: `${this.idPrefix()}-${i}`,
        };
      });
  });

  protected onButtonClick(button: ToolbarButton): void {
    const editor = this.editor();
    if (editor) button.action(editor);
  }

  protected onSelectChange(select: ToolbarSelect, value: string): void {
    const editor = this.editor();
    if (editor) select.action(editor, value);
  }
}
