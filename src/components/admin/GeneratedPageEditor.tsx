import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, Loader2, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react";

const GeneratedPageEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [contentStr, setContentStr] = useState("");
  const [status, setStatus] = useState("draft");
  const [qualityScore, setQualityScore] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [metaKeywords, setMetaKeywords] = useState("");
  const [seoOpen, setSeoOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [qualityWarning, setQualityWarning] = useState<{ score: number; issues: string[] } | null>(null);

  const { data: page, isLoading } = useQuery({
    queryKey: ["admin-generated-page", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_pages")
        .select("*, niches(name, slug), content_schemas(name, slug)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (page) {
      setContentStr(JSON.stringify(page.content_json, null, 2));
      setStatus(page.status);
      setQualityScore(page.quality_score != null ? String(page.quality_score) : "");
      const seo = (page.seo_meta as any) || {};
      setMetaTitle(seo.title || "");
      setMetaDesc(seo.description || "");
      setMetaKeywords(Array.isArray(seo.keywords) ? seo.keywords.join(", ") : "");
    }
  }, [page]);

  const doSave = async () => {
    let parsed: any;
    try {
      parsed = JSON.parse(contentStr);
    } catch {
      throw new Error("Invalid JSON in content editor");
    }

    const seoMeta = {
      title: metaTitle || null,
      description: metaDesc || null,
      keywords: metaKeywords ? metaKeywords.split(",").map((k) => k.trim()).filter(Boolean) : [],
      og_image: ((page?.seo_meta as any)?.og_image) || null,
    };

    const updateData: Record<string, any> = {
      content_json: parsed,
      status,
      seo_meta: seoMeta,
      quality_score: qualityScore ? Number(qualityScore) : null,
    };
    if (status === "published" && page?.status !== "published") {
      updateData.published_at = new Date().toISOString();
    }

    const { error } = await supabase.from("generated_pages").update(updateData).eq("id", id!);
    if (error) throw error;
  };

  const saveMutation = useMutation({
    mutationFn: doSave,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-generated-pages"] });
      qc.invalidateQueries({ queryKey: ["admin-generated-page", id] });
      toast({ title: "Saved!" });
      navigate("/admin/pages");
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  const handleSave = async () => {
    // If publishing for the first time, run quality check
    const isPublishing = status === "published" && page?.status !== "published";
    if (isPublishing && !qualityWarning) {
      setScoring(true);
      try {
        const { data, error } = await supabase.functions.invoke("score-content-quality", {
          body: { page_id: id },
        });
        if (error) throw error;
        if (data?.score != null) {
          setQualityScore(String(data.score));
        }
        if (data?.score < 60) {
          setQualityWarning({ score: data.score, issues: data.issues || [] });
          setScoring(false);
          return; // Show warning, don't save yet
        }
      } catch (e: any) {
        // If scoring fails, allow publish anyway
        console.warn("Quality scoring failed:", e.message);
      }
      setScoring(false);
    }
    setQualityWarning(null);
    saveMutation.mutate();
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(contentStr);
      setContentStr(JSON.stringify(parsed, null, 2));
    } catch {
      toast({ title: "Invalid JSON", description: "Fix JSON syntax before formatting.", variant: "destructive" });
    }
  };

  const handleRegenerate = async () => {
    if (!page) return;
    const niche = (page as any).niches;
    const schema = (page as any).content_schemas;
    if (!niche?.slug || !schema?.slug) {
      toast({ title: "Missing data", description: "Niche or content type not found.", variant: "destructive" });
      return;
    }
    setRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          niche_slugs: [niche.slug],
          content_type_slug: schema.slug,
          count_per_combination: 1,
          dry_run: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.content_json) {
        setContentStr(JSON.stringify(data.content_json, null, 2));
        toast({ title: "Content regenerated!", description: "Review and save when ready." });
      }
    } catch (e: any) {
      toast({ title: "Regeneration failed", description: e.message, variant: "destructive" });
    } finally {
      setRegenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: 64 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: "hsl(var(--admin-accent))" }} />
      </div>
    );
  }

  if (!page) {
    return (
      <div style={{ padding: 64, textAlign: "center" }}>
        <p className="font-body" style={{ color: "hsl(var(--admin-text-ghost))" }}>Page not found.</p>
      </div>
    );
  }

  const niche = (page as any).niches;
  const schema = (page as any).content_schemas;

  return (
    <div>
      {/* Quality Warning Dialog */}
      {qualityWarning && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          }}
        >
          <div
            className="admin-card"
            style={{ maxWidth: 480, width: "90%", padding: 28 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={22} style={{ color: "hsl(var(--admin-warning, 40 90% 50%))" }} />
              <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
                Low Quality Score: {qualityWarning.score}/100
              </h3>
            </div>
            <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))", marginBottom: 16 }}>
              This content scored below the recommended threshold of 60. Publishing may hurt SEO performance.
            </p>
            <ul style={{ marginBottom: 20, paddingLeft: 16 }}>
              {qualityWarning.issues.map((issue, i) => (
                <li key={i} className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))", marginBottom: 4, listStyle: "disc" }}>
                  {issue}
                </li>
              ))}
            </ul>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setQualityWarning(null); setStatus("draft"); }}
                className="admin-btn-ghost"
              >
                Go Back to Draft
              </button>
              <button
                onClick={() => { setQualityWarning(null); saveMutation.mutate(); }}
                className="admin-btn-primary"
                style={{ background: "hsl(var(--admin-warning, 40 90% 50%))" }}
              >
                Publish Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4" style={{ marginBottom: 24 }}>
        <h1 className="font-heading italic" style={{ fontSize: 28, fontWeight: 400 }}>Edit Page</h1>
        <div className="flex gap-3">
          <button onClick={() => navigate("/admin/pages")} className="admin-btn-ghost">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || scoring}
            className="admin-btn-primary"
          >
            {scoring ? (
              <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Scoring...</span>
            ) : saveMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Title */}
          <div className="admin-card" style={{ padding: 20 }}>
            <h2
              className="font-heading"
              style={{ fontSize: 22, fontWeight: 500, color: "hsl(var(--admin-text))", marginBottom: 8 }}
            >
              {page.title}
            </h2>
            <span className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>
              /{page.slug}
            </span>
          </div>

          {/* JSON editor */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <span className="admin-label" style={{ marginBottom: 0 }}>Content JSON</span>
              <button onClick={handleFormat} className="admin-btn-ghost" style={{ fontSize: 11, padding: "4px 12px" }}>
                Format JSON
              </button>
            </div>
            <textarea
              value={contentStr}
              onChange={(e) => setContentStr(e.target.value)}
              className="font-body w-full"
              spellCheck={false}
              style={{
                fontFamily: "monospace",
                fontSize: 13,
                lineHeight: 1.6,
                minHeight: 500,
                padding: 20,
                borderRadius: 6,
                border: "1px solid hsl(var(--admin-border))",
                backgroundColor: "hsl(var(--admin-surface-2))",
                color: "hsl(var(--admin-text))",
                resize: "vertical",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          {/* Status */}
          <div className="admin-card" style={{ padding: 20 }}>
            <label className="admin-label">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="admin-input font-body w-full"
            >
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Quality score */}
          <div className="admin-card" style={{ padding: 20 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <label className="admin-label" style={{ marginBottom: 0 }}>Quality Score</label>
              <button
                onClick={async () => {
                  setScoring(true);
                  try {
                    const { data, error } = await supabase.functions.invoke("score-content-quality", {
                      body: { page_id: id },
                    });
                    if (error) throw error;
                    if (data?.score != null) setQualityScore(String(data.score));
                    if (data?.issues?.length > 0) {
                      toast({
                        title: `Score: ${data.score}/100`,
                        description: data.issues.slice(0, 3).join("; "),
                        variant: data.score >= 60 ? "default" : "destructive",
                      });
                    } else {
                      toast({ title: `Score: ${data.score}/100` });
                    }
                  } catch (e: any) {
                    toast({ title: "Scoring failed", description: e.message, variant: "destructive" });
                  } finally {
                    setScoring(false);
                  }
                }}
                disabled={scoring}
                className="admin-btn-ghost"
                style={{ fontSize: 10, padding: "2px 8px" }}
              >
                {scoring ? <Loader2 size={12} className="animate-spin" /> : "Run Score"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                value={qualityScore}
                onChange={(e) => setQualityScore(e.target.value)}
                placeholder="—"
                className="admin-input font-body w-full"
              />
              {qualityScore && (
                <span style={{ flexShrink: 0 }}>
                  {Number(qualityScore) >= 60 ? (
                    <CheckCircle size={16} style={{ color: "hsl(var(--admin-success, 142 71% 45%))" }} />
                  ) : (
                    <AlertTriangle size={16} style={{ color: "hsl(var(--admin-warning, 40 90% 50%))" }} />
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="admin-card" style={{ padding: 20 }}>
            <label className="admin-label" style={{ marginBottom: 12 }}>Info</label>
            <div className="flex flex-col gap-2">
              {[
                ["Niche", niche?.name || "—"],
                ["Content Type", schema?.name || "—"],
                ["Model", page.generation_model || "—"],
                ["Cost", page.generation_cost != null ? `$${Number(page.generation_cost).toFixed(4)}` : "—"],
                ["Created", new Date(page.created_at).toLocaleDateString()],
                ["Last Refreshed", page.last_refreshed ? new Date(page.last_refreshed).toLocaleDateString() : "—"],
                ["Refresh Count", String(page.refresh_count ?? 0)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>{label}</span>
                  <span className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))", fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SEO */}
          <div className="admin-card" style={{ padding: 20 }}>
            <button
              onClick={() => setSeoOpen(!seoOpen)}
              className="flex items-center justify-between w-full"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <span className="admin-label" style={{ marginBottom: 0 }}>SEO Meta</span>
              {seoOpen ? (
                <ChevronUp size={14} style={{ color: "hsl(var(--admin-text-ghost))" }} />
              ) : (
                <ChevronDown size={14} style={{ color: "hsl(var(--admin-text-ghost))" }} />
              )}
            </button>
            {seoOpen && (
              <div className="flex flex-col gap-3" style={{ marginTop: 12 }}>
                <div>
                  <label className="admin-label" style={{ fontSize: 10 }}>Meta Title</label>
                  <input
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    className="admin-input font-body w-full"
                  />
                  <span className="font-body" style={{ fontSize: 10, color: metaTitle.length > 60 ? "hsl(var(--admin-danger))" : "hsl(var(--admin-text-ghost))" }}>
                    {metaTitle.length}/60
                  </span>
                </div>
                <div>
                  <label className="admin-label" style={{ fontSize: 10 }}>Meta Description</label>
                  <textarea
                    value={metaDesc}
                    onChange={(e) => setMetaDesc(e.target.value)}
                    className="admin-input font-body w-full"
                    rows={3}
                    style={{ resize: "vertical" }}
                  />
                  <span className="font-body" style={{ fontSize: 10, color: metaDesc.length > 160 ? "hsl(var(--admin-danger))" : "hsl(var(--admin-text-ghost))" }}>
                    {metaDesc.length}/160
                  </span>
                </div>
                <div>
                  <label className="admin-label" style={{ fontSize: 10 }}>Keywords</label>
                  <input
                    value={metaKeywords}
                    onChange={(e) => setMetaKeywords(e.target.value)}
                    placeholder="comma, separated, keywords"
                    className="admin-input font-body w-full"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Regenerate */}
          <div className="admin-card" style={{ padding: 20 }}>
            <label className="admin-label" style={{ marginBottom: 8 }}>Regenerate</label>
            <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginBottom: 12 }}>
              Re-generate content using AI. The slug and URL will stay the same.
            </p>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="admin-btn-ghost w-full flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} className={regenerating ? "animate-spin" : ""} />
              {regenerating ? "Regenerating..." : "Regenerate Content"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneratedPageEditor;
