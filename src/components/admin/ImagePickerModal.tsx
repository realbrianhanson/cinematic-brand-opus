import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, Loader2, Image as ImageIconLucide, FolderOpen, Trash2 } from "lucide-react";

interface ImagePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

interface MediaItem {
  id: string;
  name: string;
  file_path: string;
  url: string;
  type: string;
}

const ImagePickerModal = ({ open, onClose, onSelect }: ImagePickerModalProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"upload" | "library">("library");
  const [images, setImages] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("media")
        .select("*")
        .eq("type", "photo")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setImages((data as MediaItem[]) || []);
    } catch (err: any) {
      console.error("Failed to load library:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchImages();
  }, [open, fetchImages]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10 MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
      const filePath = `photos/${fileName}`;

      const { error: uploadError } = await supabase.storage.from("blog-images").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("blog-images").getPublicUrl(filePath);

      // Save to media table
      const { error: dbError } = await supabase.from("media").insert({
        name: file.name,
        file_path: filePath,
        url: publicUrl,
        type: "photo",
        size: file.size,
        mime_type: file.type,
      });
      if (dbError) throw dbError;

      toast({ title: "Image uploaded" });
      onSelect(publicUrl);
      onClose();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (item: MediaItem) => {
    setDeleting(item.id);
    try {
      const { error: storageErr } = await supabase.storage.from("blog-images").remove([item.file_path]);
      if (storageErr) throw storageErr;

      const { error: dbErr } = await supabase.from("media").delete().eq("id", item.id);
      if (dbErr) throw dbErr;

      setImages((prev) => prev.filter((img) => img.id !== item.id));
      toast({ title: "Image deleted" });
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
            Insert Image
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
          {([
            { key: "library" as const, label: "Media Library", icon: FolderOpen },
            { key: "upload" as const, label: "Upload New", icon: Upload },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1,
                padding: "10px 16px",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                backgroundColor: tab === t.key ? "hsl(var(--admin-surface-2))" : "transparent",
                color: tab === t.key ? "hsl(var(--admin-accent))" : "hsl(var(--admin-text-soft))",
                borderBottom: tab === t.key ? "2px solid hsl(var(--admin-accent))" : "2px solid transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
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
                {uploading ? "Uploading..." : "Click to select an image"}
              </p>
              <p style={{ color: "hsl(var(--admin-text-soft))", fontSize: 12, margin: 0, opacity: 0.6 }}>
                Max 10 MB · JPG, PNG, GIF, WebP
              </p>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            </div>
          )}

          {tab === "library" && (
            <>
              {loading ? (
                <div className="flex items-center justify-center" style={{ padding: 48 }}>
                  <Loader2 size={24} className="animate-spin" style={{ color: "hsl(var(--admin-accent))" }} />
                </div>
              ) : images.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2" style={{ padding: 48 }}>
                  <ImageIconLucide size={32} style={{ color: "hsl(var(--admin-text-soft))", opacity: 0.4 }} />
                  <p style={{ color: "hsl(var(--admin-text-soft))", fontSize: 14 }}>No images yet. Upload one first.</p>
                </div>
              ) : (
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="group relative"
                      style={{ aspectRatio: "1", borderRadius: 4, overflow: "hidden", cursor: "pointer", border: "1px solid hsl(var(--admin-border))" }}
                      onClick={() => { onSelect(img.url); onClose(); }}
                    >
                      <img src={img.url} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between"
                        style={{ background: "linear-gradient(transparent 40%, rgba(0,0,0,0.7))", padding: 6 }}
                      >
                        <span style={{ color: "#fff", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                          {img.name}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(img); }}
                          disabled={deleting === img.id}
                          style={{ background: "rgba(220,38,38,0.8)", border: "none", borderRadius: 2, padding: 3, cursor: "pointer", color: "#fff" }}
                          title="Delete image"
                        >
                          {deleting === img.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
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

export default ImagePickerModal;
