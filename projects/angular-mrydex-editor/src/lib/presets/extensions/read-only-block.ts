import { Node, mergeAttributes } from '@tiptap/core';
import type { Fragment, Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReplaceStep, type Step } from '@tiptap/pm/transform';

import { replacesDocument } from './replaces-document';

/**
 * Read-only block inside the editor: `<div contenteditable="false">…</div>`.
 * Without this extension Tiptap drops the attribute while parsing and the block becomes editable.
 * The guard rejects any change that alters a block (Backspace from outside, select all and delete,
 * pasting over it) and, if the document starts with a block, typing before it: text can only be
 * added below.
 */
export const ReadOnlyBlock = Node.create({
  name: 'readOnlyBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[contenteditable="false"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { contenteditable: 'false', class: 'read-only-block' }), 0];
  },

  addProseMirrorPlugins() {
    const type = this.name;

    // Each block with where it sits: wrapping it (in a quote, a list) or lifting it out also changes it.
    const blocks = (doc: PMNode): { node: PMNode; parent: PMNode | null; depth: number }[] => {
      const found: { node: PMNode; parent: PMNode | null; depth: number }[] = [];
      doc.descendants((node, pos, parent) => {
        if (node.type.name !== type) return true;
        found.push({ node, parent, depth: doc.resolve(pos).depth });
        return false;
      });
      return found;
    };

    const startsWithBlock = (doc: PMNode): boolean => doc.firstChild?.type.name === type;

    const containsBlock = (fragment: Fragment): boolean => {
      let found = false;
      fragment.descendants(node => {
        if (!found) found = node.type.name === type;
        return !found;
      });
      return found;
    };

    // A step reaches a block if it replaces part of one, inserts inside one, or inserts a new one. Moving a block
    // (drag and drop) is a deletion plus an insertion of the same node, so it is caught here too.
    const reachesBlock = (doc: PMNode, step: Step): boolean => {
      if (step instanceof ReplaceStep && containsBlock(step.slice.content)) return true;
      let reached = false;
      step.getMap().forEach((from, to) => {
        if (reached) return;
        if (from === to) {
          const $pos = doc.resolve(from);
          for (let depth = $pos.depth; depth > 0 && !reached; depth--) reached = $pos.node(depth).type.name === type;
          return;
        }
        doc.nodesBetween(from, to, node => {
          if (!reached) reached = node.type.name === type;
          return !reached;
        });
      });
      return reached;
    };

    return [
      new Plugin({
        key: new PluginKey('readOnlyBlock'),
        filterTransaction: tr => {
          if (!tr.docChanged || replacesDocument(tr)) return true;
          if (startsWithBlock(tr.before) && !startsWithBlock(tr.doc)) return false;
          if (tr.steps.some((step, i) => reachesBlock(tr.docs[i], step))) return false;
          // Plain replacements away from every block (typing, pasting) cannot change one: no need to walk the
          // whole document on each keystroke.
          if (tr.steps.every(step => step instanceof ReplaceStep)) return true;

          // Mark, attribute and wrapping steps change content without replacing it: compare every block.
          const before = blocks(tr.before);
          if (before.length === 0) return true;

          // Unchanged blocks keep their node: `eq` compares by reference first, then by structure.
          const after = blocks(tr.doc);
          const unchanged =
            after.length === before.length &&
            before.every(
              (block, i) =>
                block.node.eq(after[i].node) &&
                block.depth === after[i].depth &&
                block.parent?.type === after[i].parent?.type,
            );
          return unchanged;
        },
      }),
    ];
  },
});
