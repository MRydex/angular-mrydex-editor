import { Editor } from '@tiptap/core';

/** Condition evaluated against the editor. Recomputed on every transaction. */
export type Condition = (editor: Editor) => boolean;

interface ToolbarButtonBase {
  readonly type?: 'button';
  /** Accessible name (`aria-label`). */
  readonly label: string;
  /** Tooltip; falls back to `label`. */
  readonly tooltip?: string;
  /** Makes the button a toggle: it is highlighted and exposes `aria-pressed`. */
  readonly active?: Condition;
  /** Disables the button while it returns `false`. */
  readonly enabled?: Condition;
  /** Shows the button only while it returns `true`. */
  readonly visible?: Condition;
  readonly action: (editor: Editor) => void;
}

/**
 * Toolbar button: it has an icon, a text, or both (never neither).
 * `icon` is an SVG string painted as a single-color mask (it takes the button color); it never enters the DOM.
 * `text` is visible and renders the button as a prominent one.
 */
export type ToolbarButton = ToolbarButtonBase &
  ({ readonly icon: string; readonly text?: string } | { readonly icon?: never; readonly text: string });

export interface SelectOption {
  readonly value: string;
  readonly text: string;
}

/** Toolbar select (font family, font size, paragraph style…). */
export interface ToolbarSelect {
  readonly type: 'select';
  /** Accessible name (hidden label) and tooltip. */
  readonly label: string;
  readonly options: readonly SelectOption[];
  /** Selected value for the current editor state. */
  readonly value: (editor: Editor) => string;
  readonly action: (editor: Editor, value: string) => void;
  readonly visible?: Condition;
}

export type ToolbarControl = ToolbarButton | ToolbarSelect;

export interface ToolbarGroup {
  readonly controls: readonly ToolbarControl[];
  /** Pushes the group to the right end of the toolbar. */
  readonly alignEnd?: boolean;
}
