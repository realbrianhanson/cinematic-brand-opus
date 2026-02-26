import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { Trash2 } from "lucide-react";

const ImageNodeView = ({ node, deleteNode, selected }: NodeViewProps) => {
  return (
    <NodeViewWrapper className="tiptap-image-wrapper" data-selected={selected || undefined}>
      <img
        src={node.attrs.src}
        alt={node.attrs.alt || ""}
        title={node.attrs.title || undefined}
        style={{
          maxWidth: "100%",
          borderRadius: 4,
          margin: "12px 0",
          display: "block",
          outline: selected ? "2px solid hsl(16, 30%, 63%)" : "none",
          outlineOffset: 2,
        }}
      />
      <button
        className="tiptap-image-delete"
        onClick={deleteNode}
        contentEditable={false}
        title="Remove image"
        style={{
          position: "absolute",
          top: 20,
          right: 8,
          background: "rgba(220, 38, 38, 0.85)",
          border: "none",
          borderRadius: 4,
          padding: "6px 8px",
          cursor: "pointer",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 12,
          fontWeight: 500,
          opacity: 0,
          transition: "opacity 0.15s",
          zIndex: 10,
        }}
      >
        <Trash2 size={13} />
        Delete
      </button>
    </NodeViewWrapper>
  );
};

export default ImageNodeView;
