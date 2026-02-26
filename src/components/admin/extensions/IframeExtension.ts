import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import IframeNodeView from "../IframeNodeView";

const Iframe = Node.create({
  name: "iframe",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      frameborder: { default: "0" },
      allowfullscreen: { default: "true" },
      allow: { default: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" },
    };
  },

  parseHTML() {
    return [{ tag: "iframe" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { style: "position:relative;width:100%;aspect-ratio:16/9;margin:16px 0;border-radius:4px;overflow:hidden;" },
      ["iframe", mergeAttributes(HTMLAttributes, { style: "width:100%;height:100%;border:0;" })],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(IframeNodeView);
  },
});

export default Iframe;
