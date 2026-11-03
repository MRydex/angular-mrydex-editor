/*
 * Tiptap re-exports, so apps can build plugins without installing or importing `@tiptap/*` themselves.
 * Everything comes from the same Tiptap copy the editor uses.
 */

export * from '@tiptap/core';
export { Plugin, PluginKey } from '@tiptap/pm/state';
export type { EditorState, Transaction } from '@tiptap/pm/state';
export type { Mark as PMMark, Node as PMNode, Schema } from '@tiptap/pm/model';

// Types of the bundled extensions: importing them also loads their command typings
// (`setTextAlign`, `setFontFamily`, `insertTable`…) for apps that chain those commands.
export type { StarterKitOptions } from '@tiptap/starter-kit';
export type { FontFamilyOptions } from '@tiptap/extension-font-family';
export type { TableOptions } from '@tiptap/extension-table';
export type { TextAlignOptions } from '@tiptap/extension-text-align';
export type { TextStyleOptions } from '@tiptap/extension-text-style';
export type { PlaceholderOptions } from '@tiptap/extensions';
