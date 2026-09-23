import { errorMessage } from "@/lib/errorMessage";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  Loader2,
  Image as ImageIconLucide,
  Trash2,
  Film,
  FolderOpen,
  Copy,
  Play,
  X,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import MediaDeleteDialog from "./MediaDeleteDialog";
import type { DeleteMediaResult } from "@/lib/mediaDelete";

interface MediaItem {
  id: string;
  name: string;
  file_path: string;
  url: string;
  type: string;
  size: number | null;
  mime_type: string | null;
  created_at: string;
}

type FolderTab = "photo" | "video";

/** Abort a library load that hangs longer than this. */
const LOAD_TIMEOUT_MS = 12000;

/** Buttons hidden until the tile is hovered or focused; always shown on touch screens. */
const TILE_ACTION_REVEAL =
  "pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto [@media(hover:none)]:pointer-events-auto";

const MediaLibrary = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState<FolderTab>("photo");
  // Holds photos and videos together; the folder tab filters on render, so a
  // failed refresh keeps the last good list for both tabs.
  const [allFiles, setAllFiles] = useState<MediaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MediaItem | null>(null);
  const [previewVideo, setPreviewVideo] = useState<MediaItem | null>(null);
  const requestRef = useRef(0);

  const fetchFiles = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      LOAD_TIMEOUT_MS,
    );

    try {
      const { data, error } = await supabase
        .from("media")
        .select("*")
        .in("type", ["photo", "video"])
        .order("created_at", { ascending: false })
        .abortSignal(controller.signal);

      if (error) throw error;
      if (requestId !== requestRef.current) return;
      setAllFiles((data as MediaItem[] | null) ?? []);
      setLoaded(true);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      console.error("Failed to load files:", err);
      setLoadError(
        controller.signal.aborted
          ? "Loading media timed out"
          : errorMessage(err),
      );
    } finally {
      window.clearTimeout(timeoutId);
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
    return () => {
      // Ignore responses that land after unmount.
      requestRef.current += 1;
    };
  }, [fetchFiles]);

  const files = allFiles.filter((item) => item.type === folder);
  const folderLabel = folder === "photo" ? "photos" : "videos";

  const acceptTypes = folder === "photo" ? "image/*" : "video/*";
  const maxSize = folder === "photo" ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  const maxLabel = folder === "photo" ? "10 MB" : "50 MB";
  const folderPath = folder === "photo" ? "photos" : "videos";

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPhoto = folder === "photo";
    if (isPhoto && !file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Select an image file.",
        variant: "destructive",
      });
      return;
    }
    if (!isPhoto && !file.type.startsWith("video/")) {
      toast({
        title: "Invalid file",
        description: "Select a video file.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: `Max ${maxLabel}.`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
      const filePath = `${folderPath}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("blog-images")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("blog-images").getPublicUrl(filePath);

      const { error: dbError } = await supabase.from("media").insert({
        name: file.name,
        file_path: filePath,
        url: publicUrl,
        type: folder,
        size: file.size,
        mime_type: file.type,
      });
      if (dbError) throw dbError;

      toast({ title: `${isPhoto ? "Image" : "Video"} uploaded` });
      fetchFiles();
    } catch (err) {
      toast({
        title: "Upload failed",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleted = (
    item: { id: string },
    { storageError }: DeleteMediaResult,
  ) => {
    setAllFiles((prev) => prev.filter((f) => f.id !== item.id));
    setPendingDelete(null);
    toast(
      storageError
        ? {
            title: "Removed from library",
            description: `The stored file couldn't be removed: ${storageError}`,
          }
        : { title: "File deleted" },
    );
  };

  const handleDeleteFailed = (message: string) => {
    toast({
      title: "Delete failed",
      description: message,
      variant: "destructive",
    });
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "URL copied to clipboard" });
    } catch (err) {
      toast({
        title: "Couldn't copy URL",
        description: errorMessage(err),
        variant: "destructive",
      });
    }
  };

  return (
    <div>
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 24 }}
      >
        <h1
          className="font-heading"
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "hsl(var(--admin-text))",
            margin: 0,
          }}
        >
          Media Library
        </h1>
        <button
          className="admin-btn-primary font-body flex items-center gap-2"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{ fontSize: 13 }}
        >
          {uploading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Upload size={14} />
          )}
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptTypes}
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {/* Folder tabs */}
      <div className="flex gap-2" style={{ marginBottom: 24 }}>
        {[
          { key: "photo" as FolderTab, label: "Photos", icon: ImageIconLucide },
          { key: "video" as FolderTab, label: "Videos", icon: Film },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFolder(f.key)}
            className="font-body flex items-center gap-2"
            style={{
              padding: "10px 20px",
              borderRadius: 6,
              border: "1px solid",
              borderColor:
                folder === f.key
                  ? "hsl(var(--admin-accent))"
                  : "hsl(var(--admin-border))",
              backgroundColor:
                folder === f.key
                  ? "hsl(var(--admin-accent-soft))"
                  : "transparent",
              color:
                folder === f.key
                  ? "hsl(var(--admin-accent))"
                  : "hsl(var(--admin-text-soft))",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              transition: "all 0.2s",
            }}
          >
            <f.icon size={16} />
            {f.label}
          </button>
        ))}
      </div>

      {loadError && files.length > 0 && (
        <div
          role="alert"
          className="font-body flex items-center justify-between gap-3"
          style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 6,
            border: "1px solid hsl(var(--admin-border))",
            color: "hsl(var(--admin-text))",
            fontSize: 13,
          }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} aria-hidden />
            Couldn't refresh media. Showing the last loaded list. {loadError}
          </span>
          <button
            type="button"
            className="admin-btn-ghost flex items-center gap-1"
            onClick={fetchFiles}
            disabled={loading}
          >
            <RefreshCw size={13} aria-hidden /> Retry
          </button>
        </div>
      )}

      {/* Grid */}
      {loadError && files.length === 0 ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 font-body"
          style={{ padding: 64, textAlign: "center" }}
        >
          <AlertTriangle
            size={32}
            style={{ color: "hsl(var(--admin-text-soft))" }}
            aria-hidden
          />
          <p
            style={{
              color: "hsl(var(--admin-text))",
              fontSize: 14,
              margin: 0,
            }}
          >
            Couldn't load your {folderLabel}. {loadError}
          </p>
          <button
            type="button"
            className="admin-btn-primary flex items-center gap-2"
            onClick={fetchFiles}
            disabled={loading}
            style={{ fontSize: 13 }}
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw size={14} aria-hidden />
            )}
            Retry
          </button>
        </div>
      ) : (loading || !loaded) && files.length === 0 ? (
        <div
          className="flex items-center justify-center"
          style={{ padding: 64 }}
        >
          <Loader2
            size={24}
            className="animate-spin"
            style={{ color: "hsl(var(--admin-accent))" }}
          />
        </div>
      ) : files.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3"
          style={{ padding: 64 }}
        >
          <FolderOpen
            size={40}
            style={{ color: "hsl(var(--admin-text-soft))", opacity: 0.3 }}
          />
          <p
            className="font-body"
            style={{
              color: "hsl(var(--admin-text-soft))",
              fontSize: 14,
              margin: 0,
            }}
          >
            No {folderLabel} yet. Upload one to get started.
          </p>
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          }}
        >
          {files.map((file) => (
            <div
              key={file.id}
              className="group admin-card"
              style={{ overflow: "hidden", padding: 0 }}
            >
              <div
                style={{
                  aspectRatio: "1",
                  position: "relative",
                  overflow: "hidden",
                  cursor: file.type === "video" ? "pointer" : "default",
                }}
                onClick={
                  file.type === "video"
                    ? () => setPreviewVideo(file)
                    : undefined
                }
              >
                {file.type === "photo" ? (
                  <img
                    src={file.url}
                    alt={file.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="relative cursor-pointer"
                    style={{ width: "100%", height: "100%" }}
                    onClick={() => setPreviewVideo(file)}
                  >
                    <video
                      src={file.url}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                      muted
                      preload="metadata"
                    />
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,0.3)" }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          backgroundColor: "rgba(255,255,255,0.9)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Play
                          size={18}
                          style={{ color: "#000", marginLeft: 2 }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div
                  className="absolute inset-x-0 bottom-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity flex items-end justify-between"
                  style={{
                    background:
                      "linear-gradient(transparent 0%, rgba(0,0,0,0.75))",
                    padding: 8,
                    height: "50%",
                    pointerEvents: "none",
                  }}
                >
                  <button
                    type="button"
                    className={TILE_ACTION_REVEAL}
                    onClick={(e) => {
                      e.stopPropagation();
                      void copyUrl(file.url);
                    }}
                    style={{
                      background: "rgba(255,255,255,0.15)",
                      border: "none",
                      borderRadius: 3,
                      padding: 5,
                      cursor: "pointer",
                      color: "#fff",
                    }}
                    title="Copy URL"
                    aria-label={`Copy URL for ${file.name}`}
                  >
                    <Copy size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={TILE_ACTION_REVEAL}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(file);
                    }}
                    style={{
                      background: "rgba(220,38,38,0.8)",
                      border: "none",
                      borderRadius: 3,
                      padding: 5,
                      cursor: "pointer",
                      color: "#fff",
                    }}
                    title="Delete"
                    aria-label={`Delete ${file.name}`}
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </div>
              </div>

              <div
                className="font-body"
                style={{
                  padding: "8px 10px",
                  fontSize: 11,
                  color: "hsl(var(--admin-text-soft))",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </div>
            </div>
          ))}
        </div>
      )}

      <MediaDeleteDialog
        item={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onDeleted={handleDeleted}
        onFailed={handleDeleteFailed}
      />

      {/* Video preview modal */}
      {previewVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
          onClick={() => setPreviewVideo(null)}
        >
          <div
            className="relative"
            style={{ maxWidth: "80vw", maxHeight: "80vh", width: 800 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewVideo(null)}
              style={{
                position: "absolute",
                top: -40,
                right: 0,
                background: "none",
                border: "none",
                color: "#fff",
                cursor: "pointer",
              }}
              title="Close"
            >
              <X size={24} />
            </button>
            <video
              src={previewVideo.url}
              controls
              autoPlay
              style={{
                width: "100%",
                maxHeight: "80vh",
                borderRadius: 8,
                backgroundColor: "#000",
              }}
            />
            <p
              className="font-body"
              style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: 12,
                marginTop: 8,
                textAlign: "center",
              }}
            >
              {previewVideo.name}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaLibrary;
