import { Node, mergeAttributes } from "@tiptap/core";

const classAttribute = {
  class: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute("class"),
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.class ? { class: attrs.class } : {},
  },
};

/** <figcaption>: inline content, only valid inside a figure. */
export const Figcaption = Node.create({
  name: "figcaption",
  content: "inline*",
  defining: true,

  addAttributes() {
    return classAttribute;
  },

  parseHTML() {
    return [{ tag: "figcaption" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figcaption", mergeAttributes(HTMLAttributes), 0];
  },
});

/**
 * <figure>: wraps any block (image, table, iframe, quote) plus optional
 * captions, so figures from imported articles survive a load/save.
 */
export const Figure = Node.create({
  name: "figure",
  group: "block",
  content: "(block | figcaption)+",
  defining: true,

  addAttributes() {
    return classAttribute;
  },

  parseHTML() {
    return [{ tag: "figure" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes), 0];
  },
});
