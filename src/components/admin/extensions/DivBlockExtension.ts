import { Node } from "@tiptap/core";

/**
 * Generic block <div class="…"> wrapper (callouts, boxes, grids). Only divs
 * with a class are kept: unclassed divs carry no meaning, and the iframe node
 * renders its own unclassed wrapper div that must not nest on every reload.
 */
const DivBlock = Node.create({
  name: "divBlock",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      class: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("class"),
      },
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("id"),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[class]",
        getAttrs: (el) => (el.getAttribute("class")?.trim() ? null : false),
      },
    ];
  },

  renderHTML({ node }) {
    const attrs: Record<string, string> = {};
    if (node.attrs.class) attrs.class = node.attrs.class;
    if (node.attrs.id) attrs.id = node.attrs.id;
    return ["div", attrs, 0];
  },
});

export default DivBlock;
