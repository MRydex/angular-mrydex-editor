import { Mark, mergeAttributes } from '@tiptap/core';
import type { Node as PMNode, ResolvedPos, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  Mapping,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  ReplaceStep,
  type Transform,
  type Step,
} from '@tiptap/pm/transform';

import { isRemoteChange, replacesDocument } from './replaces-document';

interface Range {
  readonly from: number;
  readonly to: number;
}

/**
 * Editable field inside a fixed text: `<tag contenteditable="true">…</tag>`.
 * Always saved as `<span contenteditable="true">` around the text.
 * If the document has at least one field, only changes inside fields are accepted;
 * the rest of the text is read-only (even with Backspace, Delete or select all).
 * Text typed or pasted into a field (also at its left edge) joins the field; clearing its formatting keeps it.
 */
export const EditableField = Mark.create({
  name: 'editableField',
  inclusive: true,

  parseHTML() {
    // Any tag (span, p, div, b, a, i, s…). `consuming: false` lets the tag keep being parsed by its
    // own rule (paragraph, bold, link) and also adds the mark.
    return [{ tag: '[contenteditable="true"]', consuming: false }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { contenteditable: 'true', class: 'editable-field' }), 0];
  },

  addProseMirrorPlugins() {
    const type = this.name;

    const inField = (node: PMNode | null | undefined): boolean => !!node?.marks.some(mark => mark.type.name === type);

    // A range is editable if it does not cross paragraphs and everything in it is marked (text, but also line
    // breaks or images: an unmarked node, or an empty paragraph, is fixed); an insertion (from === to) is
    // editable if it touches marked content.
    const isEditableRange = (doc: PMNode, from: number, to: number): boolean => {
      const $from = doc.resolve(from);
      if (from === to) return inField($from.nodeBefore) || inField($from.nodeAfter);
      const $to = doc.resolve(to);
      if (!$from.sameParent($to)) return joinsFieldParagraphs(doc, $from, $to);

      let editable = true;
      doc.nodesBetween(from, to, (node, pos) => {
        // The blocks around the range are not part of it: look inside them.
        if (!node.isText && pos < from) return true;
        if (!inField(node)) editable = false;
        return false;
      });
      return editable;
    };

    // A range across paragraphs is editable only if it rejoins paragraphs split inside a field (Backspace after
    // Enter in a field, undo of that Enter or of a multi-paragraph paste): sibling paragraphs, the field running
    // across every boundary, and everything in the range marked. Empty paragraphs in between (Enter twice) go too.
    const joinsFieldParagraphs = (doc: PMNode, $from: ResolvedPos, $to: ResolvedPos): boolean => {
      const depth = $from.depth;
      if (depth === 0 || depth !== $to.depth || !$from.parent.isTextblock || !$to.parent.isTextblock) return false;
      const container = $from.node(depth - 1);
      if (container !== $to.node(depth - 1)) return false;

      const first = $from.index(depth - 1);
      const last = $to.index(depth - 1);
      for (let i = first + 1; i < last; i++) {
        const block = container.child(i);
        let marked = block.isTextblock;
        block.forEach(child => {
          if (!inField(child)) marked = false;
        });
        if (!marked) return false;
      }
      return (
        inField($from.parent.lastChild) &&
        inField($to.parent.firstChild) &&
        isEditableRange(doc, $from.pos, $from.end()) &&
        isEditableRange(doc, $to.start(), $to.pos)
      );
    };

    const insertsBlocks = (slice: Slice): boolean => {
      let blocks = slice.openStart > 0 || slice.openEnd > 0;
      slice.content.forEach(node => {
        if (node.isBlock) blocks = true;
      });
      return blocks;
    };

    // Every range is checked against the document before the transaction (`back` maps the step's document to it):
    // an earlier step of the same transaction (undo removing a mark, then the text) cannot make a field look fixed.
    // Mark and attribute steps do not move content, so their step map is empty: check them by their own range.
    const isEditableStep = (before: PMNode, step: Step, back: Mapping): boolean => {
      if (step instanceof AttrStep || step instanceof AddNodeMarkStep || step instanceof RemoveNodeMarkStep) {
        // Node attributes and node marks (alignment, indent…) belong to the fixed text around the fields.
        return false;
      }
      const isEditable = (from: number, to: number): boolean => {
        const start = back.map(from, -1);
        const end = back.map(to, 1);
        return isEditableRange(before, Math.min(start, end), Math.max(start, end));
      };
      if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) return isEditable(step.from, step.to);
      if (step instanceof ReplaceStep && step.from === step.to && insertsBlocks(step.slice)) {
        // Enter or a multi-paragraph paste splits the paragraph: only inside a field, never at its edge,
        // where it would split the fixed text.
        const $pos = before.resolve(back.map(step.from, -1));
        const { nodeBefore, nodeAfter } = $pos;
        if (inField(nodeBefore) && inField(nodeAfter)) return true;
        // At the start or end of a paragraph that a field starts or ends, a paste splits no fixed text, as long as
        // the empty side of the split is filled with text that joins the field: the slice is open on that side
        // and its paragraph there has text. Otherwise (Enter, a closed slice) it would leave an empty paragraph
        // that belongs to no field, where nothing could be typed or deleted.
        const { slice } = step;
        if (!nodeBefore && inField(nodeAfter)) return slice.openStart > 0 && !!slice.content.firstChild?.textContent;
        if (inField(nodeBefore) && !nodeAfter) return slice.openEnd > 0 && !!slice.content.lastChild?.textContent;
        return false;
      }
      let editable = true;
      step.getMap().forEach((from, to) => {
        if (!isEditable(from, to)) editable = false;
      });
      return editable;
    };

    // Stops at the first field: on documents without fields, every transaction pays a single walk at most.
    const hasFields = (doc: PMNode): boolean => {
      let found = false;
      doc.descendants(node => {
        if (!found) found = inField(node);
        return !found;
      });
      return found;
    };

    const removes = (step: Step): boolean => {
      if (step instanceof RemoveMarkStep) return step.mark.type.name === type;
      let removed = false;
      step.getMap().forEach((from, to) => {
        if (to > from) removed = true;
      });
      return removed;
    };

    // Fields, one range each. A mark cannot live on empty text: emptying a field removes it for good.
    // A field split by Enter continues into the next sibling paragraph (also across empty ones) when it ends one
    // paragraph and starts the other: emptying a middle paragraph of it does not empty the field.
    const fieldRuns = (doc: PMNode): Range[] => {
      const runs: Range[] = [];
      let run: { from: number; to: number } | null = null;
      let previousEnd = -1;
      doc.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        if (pos !== previousEnd) run = null;
        previousEnd = pos + node.nodeSize;
        node.forEach((child, offset) => {
          const start = pos + 1 + offset;
          if (!inField(child)) {
            run = null;
          } else if (run) {
            run.to = start + child.nodeSize;
          } else {
            run = { from: start, to: start + child.nodeSize };
            runs.push(run);
          }
        });
        return false;
      });
      return runs;
    };

    // Ranges of `tr.doc` that belong to a field but may lack the mark: inserted content (typing at the left edge of
    // a field, pasting) and field text whose mark was removed (clear formatting).
    const rangesToMark = (tr: Transaction): Range[] => {
      const ranges: Range[] = [];
      tr.steps.forEach((step, i) => {
        const rest = tr.mapping.slice(i + 1);
        const add = (from: number, to: number): void => {
          const range = { from: rest.map(from, 1), to: rest.map(to, -1) };
          if (range.to > range.from) ranges.push(range);
        };
        if (step instanceof RemoveMarkStep) {
          if (step.mark.type.name === type) add(step.from, step.to);
          return;
        }
        step.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => add(newStart, newEnd));
      });
      return ranges;
    };

    const markRanges = <T extends Transform>(transform: T, ranges: readonly Range[]): T => {
      const mark = transform.doc.type.schema.marks[type].create();
      ranges.forEach(({ from, to }) => transform.addMark(from, to, mark));
      return transform;
    };

    // Maps positions of `tr.docs[i]` back to `tr.before` (`Mapping.slice().invert()` ignores the slice bounds).
    const backTo0 = (tr: Transaction, i: number): Mapping => {
      const back = new Mapping();
      for (let j = i - 1; j >= 0; j--) back.appendMap(tr.steps[j].getMap().invert());
      return back;
    };

    const key = new PluginKey('editableField');
    // Allowed transactions whose ranges still have to be marked by `appendTransaction`.
    const pending = new WeakMap<Transaction, Range[]>();

    return [
      new Plugin({
        key,
        filterTransaction: tr => {
          // A remote change is already marked in the shared document: marking it again here would repeat it on
          // every client.
          if (tr.getMeta(key) || !tr.docChanged || replacesDocument(tr) || isRemoteChange(tr) || !hasFields(tr.before)) {
            return true;
          }

          if (!tr.steps.every((step, i) => isEditableStep(tr.before, step, backTo0(tr, i)))) return false;
          // Deleting all the text of a field would leave nowhere to type: every field keeps some content (typing
          // over it or rejoining its paragraphs still works). Only a step that removes something can empty one.
          const emptiesField = (): boolean =>
            fieldRuns(tr.before).some(({ from, to }) => tr.mapping.map(to, 1) <= tr.mapping.map(from, -1));
          if (tr.steps.some(step => removes(step)) && emptiesField()) return false;

          const ranges = rangesToMark(tr);
          if (ranges.length > 0) pending.set(tr, ranges);
          return true;
        },
        appendTransaction: (transactions, _oldState, state) => {
          const tr = state.tr;
          transactions.forEach((transaction, i) => {
            const ranges = pending.get(transaction);
            if (!ranges) return;
            const later = new Mapping();
            transactions.slice(i + 1).forEach(next => later.appendMapping(next.mapping));
            markRanges(tr, ranges.map(({ from, to }) => ({ from: later.map(from, 1), to: later.map(to, -1) })));
          });
          return tr.docChanged ? tr.setMeta(key, true) : null;
        },
      }),
    ];
  },
});
