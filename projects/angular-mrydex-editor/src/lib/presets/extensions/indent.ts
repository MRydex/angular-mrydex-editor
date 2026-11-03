import { Command, Extension } from '@tiptap/core';

export interface IndentOptions {
  types: string[];
  minLevel: number;
  maxLevel: number;
  /** Width of one level, in px (`margin-left`). */
  step: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
    };
  }
}

export const Indent = Extension.create<IndentOptions>({
  name: 'indent',

  addOptions() {
    return {
      types: ['paragraph', 'heading', 'blockquote'],
      minLevel: 0,
      maxLevel: 8,
      step: 30,
    };
  },

  addGlobalAttributes() {
    const { types, minLevel, maxLevel, step } = this.options;
    return [
      {
        types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: element => {
              const px = Number.parseInt(element.style.marginLeft, 10);
              return Number.isNaN(px) ? 0 : Math.min(maxLevel, Math.max(minLevel, Math.round(px / step)));
            },
            renderHTML: attributes => {
              const level = attributes['indent'] as number;
              return level > 0 ? { style: `margin-left: ${level * step}px` } : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const { types, minLevel, maxLevel } = this.options;

    const shift =
      (delta: 1 | -1): Command =>
      ({ tr, state, dispatch }) => {
        let changed = false;
        // Only the outermost indentable node: a paragraph inside an indented blockquote moves with it.
        tr.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
          if (!types.includes(node.type.name)) return true;
          const level = ((node.attrs['indent'] as number) || 0) + delta;
          if (level >= minLevel && level <= maxLevel) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: level });
            changed = true;
          }
          return false;
        });
        if (changed && dispatch) {
          dispatch(tr);
        }
        return changed;
      };

    return {
      indent: () => shift(1),
      outdent: () => shift(-1),
    };
  },
});
