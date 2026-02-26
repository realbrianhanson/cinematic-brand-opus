import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2, Film, FolderOpen, Trash2, Code } from "lucide-react";

interface VideoPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (html: string) => void;
}

interface MediaItem {
  id: string;
  name: string;
  file_path: string;
  url: string;
}

const TabButton = ({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) => (
  <button
    onClick={onClick}
    style={{
      flex: 1,
      padding: "10px 16px",
      border: "none",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 500,
      backgroundColor: active ? "hsl(var(--admin-surface-2))" : "transparent",
      color: active ? "hsl(var(--admin-accent))" : "hsl(var(--admin-text-soft))",
      borderBottom: active ? "2px solid hsl(var(--admin-accent))" : "2px solid transparent",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    }}
  >
    {icon} {label}
  </button>
);

const VideoPickerModal = ({ open, onClose, onSelect }: VideoPickerModalProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"embed" | "library" | "upload">("embed");
  const [embedUrl, setEmbedUrl] = useState("");
  const [videos, setVideos] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("media")
        .select("*")
        .eq("type", "video")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setVideos((data as MediaItem[]) || []);
    } catch (err: any) {
      console.error("Failed to load videos:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && tab === "library") fetchVideos();
  }, [open, tab, fetchVideos]);

  const buildEmbedHtml = (url: string): string | null => {
    const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/);
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);

    if (youtubeMatch) {
      return `embed:https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }
    if (vimeoMatch) {
      return `embed:https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }
    return null;
  };

  const handleEmbed = () => {
    const url = embedUrl.trim();
    if (!url) return;

    const html = buildEmbedHtml(url);
    if (html) {
      onSelect(html);
      setEmbedUrl("");
      onClose();
    } else {
      toast({ title: "Unsupported URL", description: "Please enter a YouTube or Vimeo URL.", variant: "destructive" });
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast({ title: "Invalid file", description: "Select a video file.", variant: "destructive" });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 50 MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
      const filePath = `videos/${fileName}`;

      const { error: uploadError } = await supabase.storage.from("blog-images").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("blog-images").getPublicUrl(filePath);

      const { error: dbError } = await supabase.from("media").insert({
        name: file.name,
        file_path: filePath,
        url: publicUrl,
        type: "video",
        size: file.size,
        mime_type: file.type,
      });
      if (dbError) throw dbError;

      toast({ title: "Video uploaded" });
      onSelect(`video:${publicUrl}`);
      onClose();
      onClose();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLibrarySelect = (video: MediaItem) => {
    onSelect(`video:${video.url}`);
    onClose();
  };

  const handleDelete = async (item: MediaItem) => {
    setDeleting(item.id);
    try {
      const { error: storageErr } = await supabase.storage.from("blog-images").remove([item.file_path]);
      if (storageErr) throw storageErr;
      const { error: dbErr } = await supabase.from("media").delete().eq("id", item.id);
      if (dbErr) throw dbErr;
      setVideos((prev) => prev.filter((v) => v.id !== item.id));
      toast({ title: "Video deleted" });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="admin-card flex flex-col"
        style={{ width: "90vw", maxWidth: 680, maxHeight: "80vh", overflow: "hidden" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "16px 20px", borderBottom: "1px solid hsl(var(--admin-border))" }}
        >
          <h3 style={{ color: "hsl(var(--admin-text))", fontSize: 16, fontWeight: 600, margin: 0 }}>
            Insert Video
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "hsl(var(--admin-text-soft))", cursor: "pointer", padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: "1px solid hsl(var(--admin-border))" }}>
          <TabButton active={tab === "embed"} onClick={() => setTab("embed")} icon={<Code size={14} />} label="Embed" />
          <TabButton active={tab === "library"} onClick={() => setTab("library")} icon={<FolderOpen size={14} />} label="Library" />
          <TabButton active={tab === "upload"} onClick={() => setTab("upload")} icon={<Upload size={14} />} label="Upload" />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {/* Embed tab */}
          {tab === "embed" && (
            <div className="flex flex-col gap-4">
              <p className="font-body" style={{ color: "hsl(var(--admin-text-soft))", fontSize: 13, margin: 0 }}>
                Paste a YouTube or Vimeo URL to embed the video.
              </p>
              <input
                type="text"
                value={embedUrl}
                onChange={(e) => setEmbedUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="admin-input font-body"
                style={{ width: "100%" }}
                onKeyDown={(e) => { if (e.key === "Enter") handleEmbed(); }}
              />
              <button
                className="admin-btn-primary font-body self-end"
                onClick={handleEmbed}
                disabled={!embedUrl.trim()}
                style={{ fontSize: 13, opacity: embedUrl.trim() ? 1 : 0.5 }}
              >
                Insert Video
              </button>
            </div>
          )}

          {/* Upload tab */}
          {tab === "upload" && (
            <div
              className="flex flex-col items-center justify-center gap-4"
              style={{ border: "2px dashed hsl(var(--admin-border))", borderRadius: 4, padding: "48px 24px", cursor: "pointer" }}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 size={32} className="animate-spin" style={{ color: "hsl(var(--admin-accent))" }} />
              ) : (
                <Upload size={32} style={{ color: "hsl(var(--admin-text-soft))" }} />
              )}
              <p style={{ color: "hsl(var(--admin-text-soft))", fontSize: 14, margin: 0 }}>
                {uploading ? "Uploading..." : "Click to select a video"}
              </p>
              <p style={{ color: "hsl(var(--admin-text-soft))", fontSize: 12, margin: 0, opacity: 0.6 }}>
                Max 50 MB · MP4, WebM, OGG
              </p>
              <input ref={fileInputRef} type="file" accept="video/*" onChange={handleUpload} className="hidden" />
            </div>
          )}

          {/* Library tab */}
          {tab === "library" && (
            <>
              {loading ? (
                <div className="flex items-center justify-center" style={{ padding: 48 }}>
                  <Loader2 size={24} className="animate-spin" style={{ color: "hsl(var(--admin-accent))" }} />
                </div>
              ) : videos.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 48 }}>
                  <Film size={32} style={{ color: "hsl(var(--admin-text-soft))", opacity: 0.4 }} />
                  <p style={{ color: "hsl(var(--admin-text-soft))", fontSize: 14 }}>No videos yet. Upload one first.</p>
                </div>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
                  {videos.map((vid) => (
                    <div
                      key={vid.id}
                      className="group relative"
                      style={{ aspectRatio: "16/9", borderRadius: 4, overflow: "hidden", cursor: "pointer", border: "1px solid hsl(var(--admin-border))" }}
                      onClick={() => handleLibrarySelect(vid)}
                    >
                      <video
                        src={vid.url}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        muted
                        preload="metadata"
                      />
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        style={{ background: "rgba(0,0,0,0.4)" }}
                      >
                        <Film size={24} style={{ color: "#fff" }} />
                      </div>
                      <div
                        className="absolute bottom-0 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between"
                        style={{ background: "rgba(0,0,0,0.7)", padding: "4px 8px" }}
                      >
                        <span style={{ color: "#fff", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                          {vid.name}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(vid); }}
                          disabled={deleting === vid.id}
                          style={{ background: "rgba(220,38,38,0.8)", border: "none", borderRadius: 2, padding: 3, cursor: "pointer", color: "#fff" }}
                          title="Delete"
                        >
                          {deleting === vid.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPickerModal;
