import { Extensions } from '@tiptap/core';
import { FontFamily } from '@tiptap/extension-font-family';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { LineHeight, TextStyle } from '@tiptap/extension-text-style';
import { Placeholder } from '@tiptap/extensions';
import { StarterKit } from '@tiptap/starter-kit';
import { TEXTS_EN } from '../texts';
import { EditableField } from './editable-field';
import { FontSize } from './font-size';
import { Indent } from './indent';
import { isExplicitLink } from './is-explicit-link';
import { ReadOnlyBlock } from './read-only-block';

/**
 * Extensions preset: what `fullToolbar()` needs (text, font family, font size, alignment, tables, indent,
 * links) plus editable fields and read-only blocks.
 * `placeholder` can be a function to follow an `input()`.
 * `undoRedo: false` drops the local undo history: required with collaboration, which brings its own.
 */
export function baseExtensions(
  placeholder: string | (() => string) = TEXTS_EN.placeholder,
  { undoRedo = true }: { undoRedo?: boolean } = {},
): Extensions {
  return [
    StarterKit.configure({
      ...(undoRedo ? {} : { undoRedo: false }),
      heading: { levels: [1, 2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        shouldAutoLink: isExplicitLink,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      },
    }),
    TextStyle,
    FontFamily.configure({ types: ['textStyle'] }),
    FontSize.configure({ types: ['textStyle'] }),
    LineHeight.configure({ types: ['textStyle'] }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    ReadOnlyBlock,
    EditableField,
    Indent,
    Placeholder.configure({ placeholder: typeof placeholder === 'function' ? () => placeholder() : placeholder }),
  ];
}
