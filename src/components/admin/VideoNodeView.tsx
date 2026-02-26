import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { Trash2 } from "lucide-react";

const VideoNodeView = ({ node, deleteNode, selected }: NodeViewProps) => {
  return (
    <NodeViewWrapper className="tiptap-media-wrapper" data-selected={selected || undefined}>
      <video
        src={node.attrs.src}
        controls
        style={{
          width: "100%",
          borderRadius: 4,
          margin: "12px 0",
          display: "block",
          outline: selected ? "2px solid hsl(16, 30%, 63%)" : "none",
          outlineOffset: 2,
        }}
      >
        <source src={node.attrs.src} type="video/mp4" />
      </video>
      <button
        className="tiptap-media-delete"
        onClick={deleteNode}
        contentEditable={false}
        title="Remove video"
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

export default VideoNodeView;
