import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Editor } from "@tiptap/react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import RichTextEditor from "./RichTextEditor";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const PillarPageEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isNew = !id;
  const editorRef = useRef<Editor | null>(null);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [status, setStatus] = useState("draft");
  const [nicheId, setNicheId] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [seoOpen, setSeoOpen] = useState(false);
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [keywords, setKeywords] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: pillar, isLoading } = useQuery({
    queryKey: ["admin-pillar", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pillar_pages").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: niches } = useQuery({
    queryKey: ["admin-niches-list"],
    queryFn: async () => {
      const { data } = await supabase.from("niches").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: connectedPages } = useQuery({
    queryKey: ["admin-pillar-connected", nicheId],
    queryFn: async () => {
      if (!nicheId) return [];
      const { data } = await supabase
        .from("generated_pages")
        .select("id, title, status")
        .eq("niche_id", nicheId)
        .order("title");
      return data ?? [];
    },
    enabled: !!nicheId,
  });

  useEffect(() => {
    if (pillar) {
      setTitle(pillar.title);
      setSlug(pillar.slug);
      setSlugManual(true);
      setStatus(pillar.status ?? "draft");
      setNicheId(pillar.niche_id ?? "");
      setEditorContent(pillar.content ?? "");
      const seo = (pillar.seo_meta ?? {}) as any;
      setMetaTitle(seo.title ?? "");
      setMetaDesc(seo.description ?? "");
      setKeywords((seo.keywords ?? []).join(", "));
      setOgImage(seo.og_image ?? "");
      if (editorRef.current && pillar.content) {
        editorRef.current.commands.setContent(pillar.content);
      }
    }
  }, [pillar]);

  useEffect(() => {
    if (!slugManual && title) setSlug(slugify(title));
  }, [title, slugManual]);

  const saveMutation = useMutation({
    mutationFn: async (publishNow: boolean) => {
      const content = editorRef.current?.getHTML() ?? editorContent;
      const finalStatus = publishNow ? "published" : status;
      const seoMeta = {
        title: metaTitle || title,
        description: metaDesc,
        keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
        og_image: ogImage || null,
      };
      const payload: any = {
        title,
        slug,
        content,
        status: finalStatus,
        niche_id: nicheId || null,
        seo_meta: seoMeta,
        updated_at: new Date().toISOString(),
      };
      if (publishNow) payload.published_at = new Date().toISOString();

      if (id) {
        const { error } = await supabase.from("pillar_pages").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pillar_pages").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pillars"] });
      toast({ title: "Pillar page saved" });
      navigate("/admin/pillars");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleOgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `pillar-og/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("blog-images").upload(path, file);
    if (error) { toast({ title: "Upload failed", variant: "destructive" }); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("blog-images").getPublicUrl(path);
    setOgImage(urlData.publicUrl);
    setUploading(false);
  };

  if (!isNew && isLoading) {
    return <div className="flex justify-center" style={{ padding: 60 }}><Loader2 size={24} className="animate-spin" style={{ color: "hsl(var(--admin-text-ghost))" }} /></div>;
  }

  const publishedCount = connectedPages?.filter((p) => p.status === "published").length ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginBottom: 24 }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/admin/pillars")} style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(var(--admin-text-ghost))", display: "flex" }}>
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-body" style={{ fontSize: 22, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
            {isNew ? "New Pillar Page" : "Edit Pillar Page"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="admin-btn-primary font-body" onClick={() => saveMutation.mutate(false)} disabled={saveMutation.isPending || !title.trim()}>
            {saveMutation.isPending && <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} />}
            Save
          </button>
          {status !== "published" && (
            <button
              className="font-body"
              onClick={() => saveMutation.mutate(true)}
              disabled={saveMutation.isPending || !title.trim()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", fontSize: 13, borderRadius: 6, fontWeight: 500,
                backgroundColor: "hsl(var(--admin-sage))", color: "#fff",
                border: "none", cursor: "pointer",
              }}
            >
              Publish
            </button>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
        {/* Left - Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <input
            className="admin-input font-body"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Pillar page title"
            style={{ fontSize: 20, fontWeight: 600, padding: "14px 16px" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="admin-label" style={{ margin: 0, whiteSpace: "nowrap" }}>Slug:</span>
            <input
              className="admin-input font-body"
              value={slug}
              onChange={(e) => { setSlugManual(true); setSlug(e.target.value); }}
              style={{ flex: 1, fontSize: 13 }}
            />
          </div>
          <div className="admin-card" style={{ padding: 0, overflow: "hidden" }}>
            <RichTextEditor
              content={editorContent}
              onChange={(html) => setEditorContent(html)}
              onEditorReady={(editor) => { editorRef.current = editor; }}
            />
          </div>
        </div>

        {/* Right - Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Status */}
          <div className="admin-card" style={{ padding: 16 }}>
            <span className="admin-label">Status</span>
            <select className="admin-input font-body" value={status} onChange={(e) => setStatus(e.target.value)} style={{ marginTop: 6, width: "100%" }}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>

          {/* Niche */}
          <div className="admin-card" style={{ padding: 16 }}>
            <span className="admin-label">Niche</span>
            <select className="admin-input font-body" value={nicheId} onChange={(e) => setNicheId(e.target.value)} style={{ marginTop: 6, width: "100%" }}>
              <option value="">Select niche…</option>
              {(niches ?? []).map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
            </select>
          </div>

          {/* SEO */}
          <div className="admin-card" style={{ padding: 16 }}>
            <button
              onClick={() => setSeoOpen(!seoOpen)}
              className="flex items-center justify-between w-full font-body"
              style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(var(--admin-text))", fontSize: 12, fontWeight: 600 }}
            >
              SEO Settings
              {seoOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {seoOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                <div>
                  <span className="admin-label">Meta Title</span>
                  <input className="admin-input font-body" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} style={{ marginTop: 4, width: "100%" }} />
                  <span className="font-body" style={{ fontSize: 10, color: metaTitle.length > 60 ? "hsl(var(--admin-danger))" : "hsl(var(--admin-text-ghost))" }}>{metaTitle.length}/60</span>
                </div>
                <div>
                  <span className="admin-label">Meta Description</span>
                  <textarea className="admin-input font-body" rows={3} value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} style={{ marginTop: 4, width: "100%", resize: "vertical" }} />
                  <span className="font-body" style={{ fontSize: 10, color: metaDesc.length > 160 ? "hsl(var(--admin-danger))" : "hsl(var(--admin-text-ghost))" }}>{metaDesc.length}/160</span>
                </div>
                <div>
                  <span className="admin-label">Keywords</span>
                  <input className="admin-input font-body" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="comma-separated" style={{ marginTop: 4, width: "100%" }} />
                </div>
                <div>
                  <span className="admin-label">OG Image</span>
                  {ogImage && <img src={ogImage} alt="" style={{ width: "100%", borderRadius: 4, marginTop: 4, marginBottom: 4 }} />}
                  <input type="file" accept="image/*" onChange={handleOgUpload} className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginTop: 4 }} />
                  {uploading && <Loader2 size={14} className="animate-spin" style={{ color: "hsl(var(--admin-text-ghost))", marginTop: 4 }} />}
                </div>
              </div>
            )}
          </div>

          {/* Connected Pages */}
          {nicheId && (
            <div className="admin-card" style={{ padding: 16 }}>
              <span className="admin-label">Connected Pages</span>
              <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-accent))", margin: "6px 0 10px" }}>
                This pillar connects to {publishedCount} published page{publishedCount !== 1 ? "s" : ""}
              </p>
              <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {(connectedPages ?? []).map((pg) => (
                  <div key={pg.id} className="flex items-center justify-between gap-2">
                    <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {pg.title}
                    </span>
                    <span className="font-body" style={{
                      fontSize: 9, padding: "1px 6px", borderRadius: 999, flexShrink: 0,
                      backgroundColor: pg.status === "published" ? "hsl(var(--admin-sage) / 0.12)" : "hsl(var(--admin-text-ghost) / 0.15)",
                      color: pg.status === "published" ? "hsl(var(--admin-sage))" : "hsl(var(--admin-text-ghost))",
                    }}>
                      {pg.status}
                    </span>
                  </div>
                ))}
                {!connectedPages?.length && (
                  <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>No pages for this niche yet.</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PillarPageEditor;
