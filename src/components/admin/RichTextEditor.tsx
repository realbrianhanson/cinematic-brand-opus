import { useState, useCallback } from "react";
import { useEditor, EditorContent, Editor, ReactNodeViewRenderer } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import ImageNodeView from "./ImageNodeView";
import UnderlineExtension from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";
import Iframe from "./extensions/IframeExtension";
import VideoNode from "./extensions/VideoExtension";
import { useToast } from "@/hooks/use-toast";
import ImagePickerModal from "./ImagePickerModal";
import VideoPickerModal from "./VideoPickerModal";

import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Code,
  Link2, ImageIcon, Undo, Redo, Pilcrow, Loader2, Video, X,
} from "lucide-react";

interface RichTextEditorProps {
  content: string;
  onChange?: (content: string) => void;
  onEditorReady?: (editor: Editor) => void;
  placeholder?: string;
}

/* ── Toolbar button ── */
const ToolbarBtn = ({
  active, onClick, icon, disabled, title,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; disabled?: boolean; title?: string;
}) => (
  <button
    type="button" onClick={onClick} disabled={disabled} title={title}
    style={{
      padding: "6px 8px", borderRadius: 3, border: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      backgroundColor: active ? "hsl(var(--admin-accent-soft))" : "transparent",
      color: active ? "hsl(var(--admin-accent))" : "hsl(var(--admin-text-soft))",
      opacity: disabled ? 0.35 : 1, transition: "background-color 0.2s",
    }}
  >
    {icon}
  </button>
);

const Divider = () => (
  <div style={{ width: 1, height: 16, backgroundColor: "hsl(var(--admin-border))", margin: "0 4px" }} />
);

/* ── Toolbar ── */
const MenuBar = ({
  editor, onImageUpload, isUploading, onVideoEmbed,
}: {
  editor: Editor; onImageUpload: () => void; isUploading: boolean; onVideoEmbed: () => void;
}) => {
  const [linkUrl, setLinkUrl] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const applyLink = () => {
    if (linkUrl) {
      const { from, to } = editor.state.selection;
      if (from === to) {
        editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkUrl}</a>`).run();
      } else {
        editor.chain().focus().setLink({ href: linkUrl }).run();
      }
    }
    setLinkUrl(""); setLinkOpen(false);
  };
  const removeLink = () => { editor.chain().focus().unsetLink().run(); setLinkUrl(""); setLinkOpen(false); };
  const openLinkPopover = () => { setLinkUrl(editor.getAttributes("link").href || ""); setLinkOpen(true); };

  const exitHeadingToNewParagraph = () => {
    const { state } = editor;
    const { $from } = state.selection;
    const afterPos = $from.after();
    editor.chain().focus().command(({ tr, dispatch }) => {
      if (dispatch) {
        const paragraph = state.schema.nodes.paragraph.create();
        tr.insert(afterPos, paragraph);
        tr.setSelection(TextSelection.create(tr.doc, afterPos + 1));
      }
      return true;
    }).scrollIntoView().run();
  };

  const handleHeadingClick = (level: 1 | 2 | 3) => {
    if (editor.isActive("heading", { level })) { exitHeadingToNewParagraph(); }
    else { editor.chain().focus().toggleHeading({ level }).run(); }
  };

  const handleParagraphClick = () => {
    if (editor.isActive("heading")) { exitHeadingToNewParagraph(); }
    else { editor.chain().focus().setParagraph().run(); }
  };

  const isParagraph = !editor.isActive("heading") && !editor.isActive("bulletList") && !editor.isActive("orderedList") && !editor.isActive("blockquote") && !editor.isActive("codeBlock");

  return (
    <div className="flex flex-wrap items-center gap-1 relative" style={{ padding: "8px 12px", borderBottom: "1px solid hsl(var(--admin-border))", backgroundColor: "hsl(var(--admin-surface-2))" }}>
      <ToolbarBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} icon={<Bold size={14} />} title="Bold" />
      <ToolbarBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} icon={<Italic size={14} />} title="Italic" />
      <ToolbarBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} icon={<UnderlineIcon size={14} />} title="Underline" />
      <ToolbarBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} icon={<Strikethrough size={14} />} title="Strikethrough" />
      <Divider />
      <ToolbarBtn active={isParagraph} onClick={handleParagraphClick} icon={<Pilcrow size={14} />} title="Normal text" />
      <ToolbarBtn active={editor.isActive("heading", { level: 1 })} onClick={() => handleHeadingClick(1)} icon={<Heading1 size={14} />} title="Heading 1" />
      <ToolbarBtn active={editor.isActive("heading", { level: 2 })} onClick={() => handleHeadingClick(2)} icon={<Heading2 size={14} />} title="Heading 2" />
      <ToolbarBtn active={editor.isActive("heading", { level: 3 })} onClick={() => handleHeadingClick(3)} icon={<Heading3 size={14} />} title="Heading 3" />
      <Divider />
      <ToolbarBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} icon={<List size={14} />} title="Bullet list" />
      <ToolbarBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} icon={<ListOrdered size={14} />} title="Numbered list" />
      <ToolbarBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} icon={<Quote size={14} />} title="Blockquote" />
      <ToolbarBtn active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} icon={<Code size={14} />} title="Code block" />
      <Divider />
      <ToolbarBtn active={editor.isActive("link")} onClick={() => setLinkOpen(!linkOpen)} icon={<Link2 size={14} />} title="Add link" />
      {linkOpen && (
        <div className="absolute left-0 right-0 flex items-center gap-2 z-50" style={{ top: "100%", padding: "8px 12px", backgroundColor: "hsl(var(--admin-surface-2))", borderBottom: "1px solid hsl(var(--admin-border))" }}>
          <input type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyLink(); if (e.key === "Escape") { setLinkOpen(false); setLinkUrl(""); } }} placeholder="https://example.com" autoFocus className="flex-1 h-7 rounded px-2 text-xs focus:outline-none" style={{ backgroundColor: "hsl(var(--admin-surface))", border: "1px solid hsl(var(--admin-border))", color: "hsl(var(--admin-text))" }} />
          <button type="button" onClick={applyLink} className="h-7 text-xs px-3 rounded" style={{ backgroundColor: "hsl(var(--admin-accent))", color: "#fff" }}>Apply</button>
          {editor.isActive("link") && <button type="button" onClick={removeLink} className="h-7 text-xs px-2 rounded" style={{ color: "#e57373", border: "1px solid #e5737333" }}>Remove</button>}
          <button type="button" onClick={() => { setLinkOpen(false); setLinkUrl(""); }} className="h-7 w-7 flex items-center justify-center rounded" style={{ color: "hsl(var(--admin-text-soft))" }}><X size={12} /></button>
        </div>
      )}
      <ToolbarBtn active={false} onClick={onImageUpload} icon={isUploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />} disabled={isUploading} title="Upload image" />
      <ToolbarBtn active={false} onClick={onVideoEmbed} icon={<Video size={14} />} title="Embed video" />
      <Divider />
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().undo().run()} icon={<Undo size={14} />} disabled={!editor.can().undo()} title="Undo" />
      <ToolbarBtn active={false} onClick={() => editor.chain().focus().redo().run()} icon={<Redo size={14} />} disabled={!editor.can().redo()} title="Redo" />
    </div>
  );
};

/* ── Main component ── */
const RichTextEditor = ({ content, onChange, onEditorReady, placeholder = "Start writing..." }: RichTextEditorProps) => {
  const { toast } = useToast();
  const [isUploading] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      LinkExtension.configure({ openOnClick: false }),
      ImageExtension.extend({
        addNodeView() { return ReactNodeViewRenderer(ImageNodeView); },
      }),
      UnderlineExtension,
      Iframe,
      VideoNode,
      Placeholder.configure({ placeholder }),
      Extension.create({
        name: "exitBlockOnEnter",
        addKeyboardShortcuts() {
          return {
            Enter: ({ editor: ed }) => {
              const { $from } = ed.state.selection;
              const node = $from.parent;
              if ($from.parentOffset !== node.content.size) return false;
              if (node.type.name === "heading") {
                ed.chain().command(({ tr, dispatch }) => {
                  if (dispatch) {
                    const pos = $from.after();
                    tr.insert(pos, ed.state.schema.nodes.paragraph.create());
                    tr.setSelection(TextSelection.create(tr.doc, pos + 1));
                  }
                  return true;
                }).run();
                return true;
              }
              return false;
            },
          };
        },
      }),
    ],
    content,
    onUpdate: ({ editor: e }) => { onChange?.(e.getHTML()); },
    onCreate: ({ editor: e }) => { onEditorReady?.(e); },
    editorProps: {
      attributes: {
        class: "prose max-w-none focus:outline-none min-h-[300px] font-body",
        style: "font-size: 15px; line-height: 1.85; padding: 20px; color: hsl(var(--admin-text));",
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain")?.trim();
        if (text && /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(text)) {
          event.preventDefault();
          const node = view.state.schema.nodes.image.create({ src: text });
          view.dispatch(view.state.tr.replaceSelectionWith(node));
          return true;
        }
        if (text && /^https?:\/\/.+\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(text)) {
          event.preventDefault();
          const node = view.state.schema.nodes.video.create({ src: text });
          view.dispatch(view.state.tr.replaceSelectionWith(node));
          return true;
        }
        return false;
      },
    },
  });

  const handleImageSelected = (url: string) => {
    if (editor) editor.chain().focus().setImage({ src: url }).run();
  };

  const handleVideoSelected = (html: string) => {
    if (!editor) return;
    if (html.startsWith("embed:")) {
      editor.chain().focus().insertContent({ type: "iframe", attrs: { src: html.slice(6) } }).run();
    } else if (html.startsWith("video:")) {
      editor.chain().focus().insertContent({ type: "video", attrs: { src: html.slice(6) } }).run();
    } else {
      editor.chain().focus().insertContent(html).run();
    }
  };

  return (
    <div className="admin-card" style={{ overflow: "hidden" }}>
      {editor && (
        <MenuBar editor={editor} onImageUpload={() => setShowImagePicker(true)} isUploading={isUploading} onVideoEmbed={() => setShowVideoPicker(true)} />
      )}
      <EditorContent editor={editor} />
      <ImagePickerModal open={showImagePicker} onClose={() => setShowImagePicker(false)} onSelect={handleImageSelected} />
      <VideoPickerModal open={showVideoPicker} onClose={() => setShowVideoPicker(false)} onSelect={handleVideoSelected} />
    </div>
  );
};

export { RichTextEditor };
export type { RichTextEditorProps };
export default RichTextEditor;
