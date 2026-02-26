import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { Trash2 } from "lucide-react";

const IframeNodeView = ({ node, deleteNode, selected }: NodeViewProps) => {
  return (
    <NodeViewWrapper className="tiptap-media-wrapper" data-selected={selected || undefined}>
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16/9",
          margin: "16px 0",
          borderRadius: 4,
          overflow: "hidden",
          outline: selected ? "2px solid hsl(16, 30%, 63%)" : "none",
          outlineOffset: 2,
        }}
      >
        <iframe
          src={node.attrs.src}
          frameBorder="0"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          style={{ width: "100%", height: "100%", border: 0 }}
        />
      </div>
      <button
        className="tiptap-media-delete"
        onClick={deleteNode}
        contentEditable={false}
        title="Remove embed"
        style={{
          position: "absolute",
          top: 24,
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

export default IframeNodeView;
