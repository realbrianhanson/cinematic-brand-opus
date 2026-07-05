import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { safeMutation } from "@/lib/withTimeout";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, Loader2, RefreshCw, AlertTriangle, CheckCircle, Wand2, Sparkles } from "lucide-react";

const GeneratedPageEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [contentStr, setContentStr] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [generatingOg, setGeneratingOg] = useState(false);
  const [status, setStatus] = useState("draft");
  const [qualityScore, setQualityScore] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [metaKeywords, setMetaKeywords] = useState("");
  const [seoOpen, setSeoOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [qualityWarning, setQualityWarning] = useState<{ score: number; issues: string[] } | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  const { data: page, isLoading } = useQuery({
    queryKey: ["admin-generated-page", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_pages")
        .select("*, niches!generated_pages_niche_id_fkey(name, slug), content_schemas(name, slug)")
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
      setOgImage(seo.og_image || "");
      if (seo.title || seo.description || (Array.isArray(seo.keywords) && seo.keywords.length > 0)) {
        setHasGenerated(true);
      }
    }
  }, [page]);

  // Compute SEO score
  const seoData = useMemo(() => {
    const criteria: { label: string; done: boolean; points: string }[] = [];
    let score = 0;

    const hasMeta = metaTitle.length > 0 && metaTitle.length <= 60;
    criteria.push({ label: "Meta title (under 60 chars)", done: hasMeta, points: "+20" });
    if (hasMeta) score += 20;

    const hasDesc = metaDesc.length > 0 && metaDesc.length <= 160;
    criteria.push({ label: "Meta description (under 160 chars)", done: hasDesc, points: "+20" });
    if (hasDesc) score += 20;

    const kwCount = metaKeywords.split(",").map(k => k.trim()).filter(Boolean).length;
    const hasKw = kwCount >= 3;
    criteria.push({ label: "At least 3 keywords", done: hasKw, points: "+15" });
    if (hasKw) score += 15;

    let wordCount = 0;
    try {
      const parsed = JSON.parse(contentStr);
      wordCount = JSON.stringify(parsed).replace(/[{}[\]":,]/g, " ").split(/\s+/).filter(Boolean).length;
    } catch { /* ignore */ }
    const hasWords = wordCount >= 300;
    criteria.push({ label: "Content has 300+ words", done: hasWords, points: "+15" });
    if (hasWords) score += 15;

    const titleStr = page?.title || "";
    const hasYear = /20\d{2}/.test(titleStr);
    criteria.push({ label: "Title contains a year", done: hasYear, points: "+10" });
    if (hasYear) score += 10;

    let hasFaq = false;
    try {
      const parsed = JSON.parse(contentStr);
      hasFaq = !!(parsed.faq_items?.length || parsed.faqs?.length);
    } catch { /* ignore */ }
    criteria.push({ label: "Content has FAQ items", done: hasFaq, points: "+10" });
    if (hasFaq) score += 10;

    let hasIntro = false;
    try {
      const parsed = JSON.parse(contentStr);
      hasIntro = !!(parsed.intro || parsed.introduction || parsed.description);
    } catch { /* ignore */ }
    criteria.push({ label: "Content has intro section", done: hasIntro, points: "+10" });
    if (hasIntro) score += 10;

    return { score, criteria };
  }, [metaTitle, metaDesc, metaKeywords, contentStr, page?.title]);

  const handleGenerateSeo = async () => {
    setAiGenerating(true);
    try {
      let excerpt = "";
      try { excerpt = JSON.parse(contentStr)?.intro || JSON.parse(contentStr)?.description || ""; } catch {}
      const { data, error } = await supabase.functions.invoke("generate-seo-aeo", {
        body: {
          title: page?.title || "",
          content: contentStr.slice(0, 4000),
          excerpt,
        },
      });
      if (error) throw error;
      if (data?.meta_title) setMetaTitle(data.meta_title);
      if (data?.meta_description) setMetaDesc(data.meta_description);
      if (data?.keywords) setMetaKeywords(data.keywords);
      setHasGenerated(true);
      setSeoOpen(true);
      toast({ title: "SEO fields generated!" });
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleEnhanceSeo = async () => {
    setEnhancing(true);
    try {
      const missing = seoData.criteria.filter(c => !c.done).map(c => c.label);
      let excerpt = "";
      try { excerpt = JSON.parse(contentStr)?.intro || JSON.parse(contentStr)?.description || ""; } catch {}
      const { data, error } = await supabase.functions.invoke("generate-seo-aeo", {
        body: {
          title: page?.title || "",
          content: contentStr.slice(0, 4000),
          excerpt,
          enhance: true,
          missing_criteria: missing,
        },
      });
      if (error) throw error;
      if (data?.meta_title) setMetaTitle(data.meta_title);
      if (data?.meta_description) setMetaDesc(data.meta_description);
      if (data?.keywords) setMetaKeywords(data.keywords);
      setSeoOpen(true);
      toast({ title: "SEO enhanced!" });
    } catch (e: any) {
      toast({ title: "Enhancement failed", description: e.message, variant: "destructive" });
    } finally {
      setEnhancing(false);
    }
  };



  const doSave = (overrideReason?: string) => safeMutation(async () => {
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
      og_image: ogImage || null,
    };

    const updateData: Record<string, any> = {
      content_json: parsed,
      status,
      seo_meta: seoMeta,
      quality_score: qualityScore ? Number(qualityScore) : null,
      human_edited: true,
    };
    const wasPublishing = status === "published" && page?.status !== "published";
    if (wasPublishing) {
      updateData.published_at = new Date().toISOString();
    }
    if (overrideReason) {
      const { data: authData } = await supabase.auth.getUser();
      updateData.publish_override = true;
      updateData.publish_override_reason = overrideReason;
      updateData.publish_override_at = new Date().toISOString();
      updateData.publish_override_by = authData?.user?.id ?? null;
    }

    const { error } = await supabase.from("generated_pages").update(updateData).eq("id", id!);
    if (error) throw error;

    // On publish transition: build silo links + submit IndexNow (fire-and-forget)
    if (wasPublishing && id) {
      supabase.functions.invoke("build-silo-links", { body: { page_id: id } }).catch(() => {});
      supabase.functions.invoke("generate-og-image", { body: { page_id: id } }).catch(() => {});
      const schemaSlug = (page as any)?.content_schemas?.slug;
      if (schemaSlug && page?.slug) {
        supabase.functions
          .invoke("submit-indexnow", { body: { urls: [`/resources/${schemaSlug}/${page.slug}`] } })
          .catch(() => {});
      }
    }
  });

  const saveMutation = useMutation({
    mutationFn: (overrideReason?: string) => doSave(overrideReason),
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
    const isPublishing = status === "published" && page?.status !== "published";
    if (isPublishing && !qualityWarning) {
      setScoring(true);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const { data, error } = await supabase.functions.invoke("score-content-quality", {
          body: { page_id: id },
        });
        clearTimeout(timeout);
        if (error) throw error;
        if (data?.score != null) {
          setQualityScore(String(data.score));
        }
        if (data?.score < 75) {
          setQualityWarning({ score: data.score, issues: data.issues || [] });
          setScoring(false);
          return;
        }
      } catch (e: any) {
        console.warn("Quality scoring failed:", e.message);
        toast({ title: "Scoring failed", description: "Publish blocked until content can be scored.", variant: "destructive" });
        setScoring(false);
        return;
      }
      setScoring(false);
    }
    setQualityWarning(null);
    saveMutation.mutate(undefined);
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

  const { score: seoScore, criteria: seoCriteria } = seoData;
  const done = seoCriteria.filter(c => c.done).length;
  const total = seoCriteria.length;
  const scoreColor = seoScore >= 75 ? "admin-sage" : seoScore >= 40 ? "admin-accent" : "admin-danger";

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
          <div className="admin-card" style={{ maxWidth: 480, width: "90%", padding: 28 }}>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={22} style={{ color: "hsl(var(--admin-warning, 40 90% 50%))" }} />
              <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
                Low Quality Score: {qualityWarning.score}/100
              </h3>
            </div>
            <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))", marginBottom: 16 }}>
              This content scored below the publish threshold of 75. The database will reject the publish unless you override.
            </p>
            <ul style={{ marginBottom: 20, paddingLeft: 16 }}>
              {qualityWarning.issues.map((issue, i) => (
                <li key={i} className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))", marginBottom: 4, listStyle: "disc" }}>
                  {issue}
                </li>
              ))}
            </ul>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setQualityWarning(null); setStatus("draft"); }} className="admin-btn-ghost">
                Go Back to Draft
              </button>
              <button
                onClick={() => {
                  const reason = window.prompt(
                    `This page scored ${qualityWarning.score}/100 (threshold: 75). Type a reason to publish anyway — this is logged to publish_override_reason.`,
                  );
                  if (!reason || !reason.trim()) return;
                  setQualityWarning(null);
                  saveMutation.mutate(reason.trim());
                }}
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
            <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 500, color: "hsl(var(--admin-text))", marginBottom: 8 }}>
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
                fontFamily: "monospace", fontSize: 13, lineHeight: 1.6, minHeight: 500, padding: 20,
                borderRadius: 6, border: "1px solid hsl(var(--admin-border))",
                backgroundColor: "hsl(var(--admin-surface-2))", color: "hsl(var(--admin-text))",
                resize: "vertical", outline: "none",
              }}
            />
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          {/* Status */}
          <div className="admin-card" style={{ padding: 20 }}>
            <label className="admin-label">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="admin-input font-body w-full">
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* A.I. SEO Helper */}
          <div className="admin-card" style={{ padding: 20 }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
              <Wand2 size={14} style={{ color: "hsl(var(--admin-accent))" }} />
              <span className="admin-label" style={{ marginBottom: 0 }}>A.I. SEO Helper</span>
            </div>
            <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginBottom: 14, lineHeight: 1.5 }}>
              Generate &amp; optimize SEO fields using A.I. based on your page content.
            </p>

            {/* Score Ring */}
            <div style={{ marginBottom: 16, textAlign: "center" }}>
              <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto 10px" }}>
                <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--admin-surface-2))" strokeWidth="2.8" />
                  <circle cx="18" cy="18" r="15.9" fill="none"
                    stroke={`hsl(var(--${scoreColor}))`}
                    strokeWidth="2.8"
                    strokeDasharray={`${seoScore} ${100 - seoScore}`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 0.5s ease" }}
                  />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <span className="font-heading" style={{ fontSize: 24, color: `hsl(var(--${scoreColor}))`, lineHeight: 1 }}>{seoScore}</span>
                  <span className="font-body" style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))" }}>/ 100</span>
                </div>
              </div>
              <p className="font-body" style={{ fontSize: 10, color: "hsl(var(--admin-text-ghost))", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                SEO Score
              </p>
            </div>

            {/* Checklist */}
            <div style={{ marginBottom: 14 }}>
              <p className="admin-label" style={{ marginBottom: 10, fontSize: 10 }}>📈 Increase Your Score</p>
              <div style={{ backgroundColor: "hsl(var(--admin-surface-2))", borderRadius: 6, padding: "4px", marginBottom: 10 }}>
                <div style={{
                  height: 6, borderRadius: 3,
                  background: done === total
                    ? "hsl(var(--admin-sage))"
                    : "linear-gradient(90deg, hsl(var(--admin-accent)), hsl(var(--admin-sage)))",
                  width: `${(done / total) * 100}%`,
                  transition: "width 0.4s ease",
                }} />
              </div>
              <p className="font-body" style={{ fontSize: 10, color: "hsl(var(--admin-text-ghost))", marginBottom: 10, textAlign: "right" }}>
                {done}/{total} completed
              </p>
              {seoCriteria.map((c, i) => (
                <div key={i} className="flex items-start gap-2" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 13, lineHeight: "18px", flexShrink: 0, color: c.done ? "hsl(var(--admin-sage))" : "hsl(var(--admin-text-ghost))" }}>
                    {c.done ? "✓" : "○"}
                  </span>
                  <span className="font-body" style={{ fontSize: 11, lineHeight: "18px", flex: 1, color: c.done ? "hsl(var(--admin-text-ghost))" : "hsl(var(--admin-text-soft))", textDecoration: c.done ? "line-through" : "none" }}>
                    {c.label}
                  </span>
                  <span className="font-body" style={{ fontSize: 9, lineHeight: "18px", color: c.done ? "hsl(var(--admin-sage))" : "hsl(var(--admin-accent))", fontWeight: 600 }}>
                    {c.done ? "✓" : c.points}
                  </span>
                </div>
              ))}
            </div>

            {/* Buttons */}
            <button
              onClick={handleGenerateSeo}
              disabled={aiGenerating}
              className="admin-btn-primary w-full flex items-center justify-center gap-2"
              style={{ fontSize: 13 }}
            >
              {aiGenerating ? (
                <><Loader2 size={14} className="animate-spin" />Generating...</>
              ) : (
                <><Sparkles size={14} />Generate SEO</>
              )}
            </button>

            {hasGenerated && (
              <button
                onClick={handleEnhanceSeo}
                disabled={enhancing}
                className="w-full flex items-center justify-center gap-2 font-body"
                style={{
                  marginTop: 8,
                  background: enhancing
                    ? "hsl(var(--admin-surface-2))"
                    : "linear-gradient(135deg, hsl(var(--admin-accent)), hsl(var(--admin-sage)))",
                  color: enhancing ? "hsl(var(--admin-text-ghost))" : "#fff",
                  border: "none", borderRadius: 6, padding: "10px 16px", fontSize: 13, fontWeight: 600,
                  cursor: enhancing ? "not-allowed" : "pointer",
                }}
              >
                {enhancing ? (
                  <><Loader2 size={14} className="animate-spin" />Enhancing...</>
                ) : (
                  <>📈 Increase Score <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 12, padding: "2px 8px", fontSize: 11 }}>{seoScore}%</span></>
                )}
              </button>
            )}
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
                type="number" step="0.1" value={qualityScore}
                onChange={(e) => setQualityScore(e.target.value)}
                placeholder="—" className="admin-input font-body w-full"
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
                  <input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} className="admin-input font-body w-full" />
                  <span className="font-body" style={{ fontSize: 10, color: metaTitle.length > 60 ? "hsl(var(--admin-danger))" : "hsl(var(--admin-text-ghost))" }}>
                    {metaTitle.length}/60
                  </span>
                </div>
                <div>
                  <label className="admin-label" style={{ fontSize: 10 }}>Meta Description</label>
                  <textarea value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} className="admin-input font-body w-full" rows={3} style={{ resize: "vertical" }} />
                  <span className="font-body" style={{ fontSize: 10, color: metaDesc.length > 160 ? "hsl(var(--admin-danger))" : "hsl(var(--admin-text-ghost))" }}>
                    {metaDesc.length}/160
                  </span>
                </div>
                <div>
                  <label className="admin-label" style={{ fontSize: 10 }}>Keywords</label>
                  <input value={metaKeywords} onChange={(e) => setMetaKeywords(e.target.value)} placeholder="comma, separated, keywords" className="admin-input font-body w-full" />
                </div>
                <div>
                  <label className="admin-label" style={{ fontSize: 10 }}>OG Image URL</label>
                  <div className="flex gap-2">
                    <input value={ogImage} onChange={(e) => setOgImage(e.target.value)} placeholder="https://..." className="admin-input font-body w-full" />
                    <button
                      onClick={async () => {
                        setGeneratingOg(true);
                        try {
                          const { data, error } = await supabase.functions.invoke("generate-og-image", { body: { page_id: id } });
                          if (error || data?.error) throw new Error(error?.message || data?.error);
                          // Refetch page to get updated og_image
                          const { data: updated } = await supabase.from("generated_pages").select("seo_meta").eq("id", id!).single();
                          const newOg = (updated?.seo_meta as any)?.og_image || "";
                          setOgImage(newOg);
                          toast({ title: "OG image generated!" });
                        } catch (e: any) {
                          toast({ title: "Failed", description: e.message, variant: "destructive" });
                        } finally {
                          setGeneratingOg(false);
                        }
                      }}
                      disabled={generatingOg}
                      className="admin-btn-ghost flex items-center gap-1 whitespace-nowrap"
                      style={{ fontSize: 11 }}
                    >
                      {generatingOg ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                      {generatingOg ? "Generating..." : "Generate"}
                    </button>
                  </div>
                  {ogImage && (
                    <img src={ogImage} alt="OG preview" style={{ marginTop: 8, width: "100%", borderRadius: 4, border: "1px solid hsl(var(--admin-border))" }} />
                  )}
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
