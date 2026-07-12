import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { safeMutation } from "@/lib/withTimeout";
import { RichTextEditor } from "./RichTextEditor";
import { Loader2, X, Upload, ImageOff, ExternalLink } from "lucide-react";

type NewsItem = {
  id: string;
  title: string | null;
  ai_title: string | null;
  ai_summary: string | null;
  raw_excerpt: string | null;
  full_content: string | null;
  image_url: string | null;
  author: string | null;
  url: string;
  topic_lane: string | null;
  published_at: string | null;
  status: string;
  source_id: string | null;
};

interface Props {
  itemId: string;
  onClose: () => void;
  onSaved: () => void;
}

const STATUSES = ["draft", "pending", "published", "archived"];

const LANES = ["local_news", "ai", "marketing", "sales", "business", "tech", "general"];

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "hsl(var(--admin-surface-2))",
  border: "1px solid hsl(var(--admin-border))",
  borderRadius: 6,
  color: "hsl(var(--admin-text))",
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "hsl(var(--admin-text-ghost))",
  marginBottom: 6,
};

export default function NewsItemEditor({ itemId, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [item, setItem] = useState<NewsItem | null>(null);
  const [sourceName, setSourceName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("source_items")
        .select("*, content_sources(name)")
        .eq("id", itemId)
        .maybeSingle();
      if (error || !data) {
        toast({ title: "Failed to load news item", description: error?.message, variant: "destructive" });
        onClose();
        return;
      }
      setItem(data as any);
      setSourceName(((data as any).content_sources?.name as string) || "");
      setLoading(false);
    })();
  }, [itemId]);

  const patch = (p: Partial<NewsItem>) => setItem((prev) => (prev ? { ...prev, ...p } : prev));

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `news/${itemId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("blog-images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("blog-images").getPublicUrl(path);
      patch({ image_url: data.publicUrl });
      toast({ title: "Image uploaded" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!item) return;
    setSaving(true);
    try {
      await safeMutation(async () => {
        const { error } = await supabase
          .from("source_items")
          .update({
            title: item.title,
            ai_title: item.ai_title,
            ai_summary: item.ai_summary,
            raw_excerpt: item.raw_excerpt,
            full_content: item.full_content,
            image_url: item.image_url,
            author: item.author,
            url: item.url,
            topic_lane: item.topic_lane,
            published_at: item.published_at,
            status: item.status,
          })
          .eq("id", item.id);
        if (error) throw error;
      });
      toast({ title: "News updated successfully" });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
        display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 24, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 900, background: "hsl(var(--admin-surface))",
          border: "1px solid hsl(var(--admin-border))", borderRadius: 10, padding: 24, marginBottom: 40,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 className="font-heading italic" style={{ fontSize: 22, color: "hsl(var(--admin-text))" }}>
            Edit news article
          </h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "hsl(var(--admin-text-soft))" }}>
            <X size={18} />
          </button>
        </div>

        {loading || !item ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Loader2 className="animate-spin" size={22} style={{ color: "hsl(var(--admin-accent))" }} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>Title (displayed)</label>
              <input
                style={inputStyle}
                value={item.ai_title || ""}
                onChange={(e) => patch({ ai_title: e.target.value })}
                placeholder={item.title || "Article title"}
              />
              <div style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginTop: 4 }}>
                Original: {item.title || "—"}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Summary / excerpt</label>
              <textarea
                style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
                value={item.ai_summary || item.raw_excerpt || ""}
                onChange={(e) => patch({ ai_summary: e.target.value })}
              />
            </div>

            <div>
              <label style={labelStyle}>Full article content</label>
              <RichTextEditor
                content={item.full_content || ""}
                onChange={(html) => patch({ full_content: html })}
                placeholder="Write or paste the full article…"
              />
            </div>

            <div>
              <label style={labelStyle}>Featured image</label>
              {item.image_url ? (
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 8 }}>
                  <img src={item.image_url} alt="preview" style={{ width: 220, height: 130, objectFit: "cover", borderRadius: 6, border: "1px solid hsl(var(--admin-border))" }} />
                  <button
                    onClick={() => patch({ image_url: null })}
                    style={{ padding: "6px 10px", background: "transparent", border: "1px solid hsl(var(--admin-danger))", borderRadius: 6, color: "hsl(var(--admin-danger))", cursor: "pointer", fontSize: 12, display: "inline-flex", gap: 4, alignItems: "center" }}
                  >
                    <ImageOff size={12} /> Remove
                  </button>
                </div>
              ) : (
                <div style={{ padding: 20, border: "1px dashed hsl(var(--admin-border))", borderRadius: 6, textAlign: "center", color: "hsl(var(--admin-text-ghost))", fontSize: 12, marginBottom: 8 }}>
                  No image set.
                </div>
              )}
              <input
                style={{ ...inputStyle, marginBottom: 8 }}
                placeholder="https://…"
                value={item.image_url || ""}
                onChange={(e) => patch({ image_url: e.target.value })}
              />
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "transparent", border: "1px solid hsl(var(--admin-border))", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "hsl(var(--admin-text-soft))" }}>
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                Upload new image
                <input
                  type="file" accept="image/*" style={{ display: "none" }} disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
                />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>Source name</label>
                <input style={{ ...inputStyle, opacity: 0.7 }} value={sourceName} disabled />
                <div style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginTop: 4 }}>Managed via Sources.</div>
              </div>
              <div>
                <label style={labelStyle}>Author</label>
                <input style={inputStyle} value={item.author || ""} onChange={(e) => patch({ author: e.target.value })} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Source URL</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={inputStyle} value={item.url} onChange={(e) => patch({ url: e.target.value })} />
                  <a href={item.url} target="_blank" rel="noopener" style={{ padding: "8px 10px", background: "transparent", border: "1px solid hsl(var(--admin-border))", borderRadius: 6, color: "hsl(var(--admin-text-soft))", display: "inline-flex", alignItems: "center" }}>
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Category (topic lane)</label>
                <select
                  style={inputStyle}
                  value={item.topic_lane || ""}
                  onChange={(e) => patch({ topic_lane: e.target.value || null })}
                >
                  <option value="">— none —</option>
                  {LANES.map((l) => <option key={l} value={l}>{l}</option>)}
                  {item.topic_lane && !LANES.includes(item.topic_lane) && (
                    <option value={item.topic_lane}>{item.topic_lane}</option>
                  )}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select
                  style={inputStyle}
                  value={item.status}
                  onChange={(e) => patch({ status: e.target.value })}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  {!STATUSES.includes(item.status) && <option value={item.status}>{item.status}</option>}
                </select>
                <div style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginTop: 4 }}>
                  Only <strong>published</strong> items appear on the public News page.
                </div>
              </div>
              <div>
                <label style={labelStyle}>Publication date</label>
                <input
                  type="datetime-local"
                  style={inputStyle}
                  value={item.published_at ? new Date(item.published_at).toISOString().slice(0, 16) : ""}
                  onChange={(e) => patch({ published_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8, paddingTop: 16, borderTop: "1px solid hsl(var(--admin-border))" }}>
              <button
                onClick={onClose}
                style={{ padding: "10px 16px", background: "transparent", border: "1px solid hsl(var(--admin-border))", borderRadius: 6, color: "hsl(var(--admin-text-soft))", cursor: "pointer", fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{ padding: "10px 18px", background: "hsl(var(--admin-accent))", border: "none", borderRadius: 6, color: "#1a1208", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save changes
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
