import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, ChevronDown, ChevronUp, Zap, ImageIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface BatchGroup {
  batch_id: string;
  date: string;
  success: number;
  failed: number;
  total: number;
  logs: any[];
}

const GenerationControls = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Form state
  const [contentTypeSlug, setContentTypeSlug] = useState("all_active");
  const [selectedNiches, setSelectedNiches] = useState<Set<string>>(new Set());
  const [nicheSearch, setNicheSearch] = useState("");
  const [pagesPerCombo, setPagesPerCombo] = useState(1);
  const [dryRun, setDryRun] = useState(false);

  // Progress state
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [dryRunResult, setDryRunResult] = useState<any>(null);

  // Batch expansion
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  const { data: schemas } = useQuery({
    queryKey: ["gen-schemas"],
    queryFn: async () => {
      const { data } = await supabase.from("content_schemas").select("slug, name, is_active").order("name");
      return data ?? [];
    },
  });

  const { data: niches } = useQuery({
    queryKey: ["gen-niches"],
    queryFn: async () => {
      const { data } = await supabase.from("niches").select("id, slug, name, is_active").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const { data: recentBatches, refetch: refetchBatches } = useQuery({
    queryKey: ["gen-recent-batches"],
    queryFn: async () => {
      const { data } = await supabase
        .from("generation_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!data?.length) return [];
      const groups: Record<string, BatchGroup> = {};
      for (const log of data) {
        const bid = log.batch_id || "unknown";
        if (!groups[bid]) groups[bid] = { batch_id: bid, date: log.created_at, success: 0, failed: 0, total: 0, logs: [] };
        groups[bid].total++;
        if (log.status === "success") groups[bid].success++;
        else if (log.status === "failed") groups[bid].failed++;
        groups[bid].logs.push(log);
      }
      return Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
    },
  });

  const filteredNiches = useMemo(() => {
    if (!niches) return [];
    if (!nicheSearch.trim()) return niches;
    const q = nicheSearch.toLowerCase();
    return niches.filter((n) => n.name.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q));
  }, [niches, nicheSearch]);

  const activeSchemaCount = contentTypeSlug === "all_active" ? (schemas?.filter((s) => s.is_active).length ?? 1) : 1;
  const estimatedPages = selectedNiches.size * activeSchemaCount * pagesPerCombo;

  const toggleAll = () => {
    if (!niches) return;
    if (selectedNiches.size === niches.length) {
      setSelectedNiches(new Set());
    } else {
      setSelectedNiches(new Set(niches.map((n) => n.slug)));
    }
  };

  const toggleNiche = (slug: string) => {
    setSelectedNiches((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });
  };

  const runGeneration = async (overrideDryRun?: boolean) => {
    const isDry = overrideDryRun ?? dryRun;
    if (selectedNiches.size === 0) {
      toast({ title: "Select niches", description: "Pick at least one niche.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    setResult(null);
    setDryRunResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          niche_slugs: Array.from(selectedNiches),
          content_type_slug: contentTypeSlug,
          count_per_combination: pagesPerCombo,
          dry_run: isDry,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (isDry) {
        setDryRunResult(data);
        toast({ title: "Dry run complete", description: "Preview the generated content below." });
      } else {
        setResult(data);
        toast({ title: "Generation complete", description: `${data.success} pages generated.` });
        qc.invalidateQueries({ queryKey: ["admin-generated-pages"] });
        refetchBatches();
      }
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 className="font-body" style={{ fontSize: 22, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 24 }}>
        Generate Content
      </h1>

      {/* Section 1: Form */}
      <div className="admin-card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Content Type */}
          <div>
            <span className="admin-label">Content Type</span>
            <select className="admin-input font-body" value={contentTypeSlug} onChange={(e) => setContentTypeSlug(e.target.value)} style={{ marginTop: 6, width: "100%" }}>
              <option value="all_active">All Active Types</option>
              {(schemas ?? []).map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}{!s.is_active ? " (inactive)" : ""}</option>
              ))}
            </select>
          </div>

          {/* Niches multi-select */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
              <span className="admin-label" style={{ margin: 0 }}>Niches</span>
              <div className="flex items-center gap-3">
                <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>
                  {selectedNiches.size} of {niches?.length ?? 0} selected
                </span>
                <button
                  onClick={toggleAll}
                  className="font-body"
                  style={{ fontSize: 11, color: "hsl(var(--admin-accent))", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >
                  {selectedNiches.size === (niches?.length ?? 0) ? "Deselect All" : "Select All"}
                </button>
              </div>
            </div>
            <div style={{ position: "relative", marginBottom: 8 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "hsl(var(--admin-text-ghost))" }} />
              <input
                className="admin-input font-body"
                style={{ paddingLeft: 30, width: "100%" }}
                placeholder="Filter niches..."
                value={nicheSearch}
                onChange={(e) => setNicheSearch(e.target.value)}
              />
            </div>
            <div
              style={{
                maxHeight: 300, overflowY: "auto", border: "1px solid hsl(var(--admin-border))",
                borderRadius: 6, backgroundColor: "hsl(var(--admin-surface-2))",
              }}
            >
              {filteredNiches.map((n) => (
                <label
                  key={n.slug}
                  className="flex items-center gap-3 font-body"
                  style={{
                    padding: "8px 12px", fontSize: 13, cursor: "pointer",
                    color: "hsl(var(--admin-text-soft))",
                    borderBottom: "1px solid hsl(var(--admin-border))",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedNiches.has(n.slug)}
                    onChange={() => toggleNiche(n.slug)}
                    style={{ accentColor: "hsl(var(--admin-accent))" }}
                  />
                  {n.name}
                </label>
              ))}
              {filteredNiches.length === 0 && (
                <div className="font-body" style={{ padding: 16, textAlign: "center", fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>
                  No niches found
                </div>
              )}
            </div>
          </div>

          {/* Pages per combo */}
          <div>
            <span className="admin-label">Pages Per Combination</span>
            <input
              className="admin-input font-body"
              type="number" min={1} max={5} value={pagesPerCombo}
              onChange={(e) => setPagesPerCombo(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
              style={{ marginTop: 6, width: 100 }}
            />
          </div>

          {/* Dry run */}
          <div className="flex items-center gap-3">
            <Switch checked={dryRun} onCheckedChange={setDryRun} />
            <span className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>
              Dry Run — generate 1 sample first for preview
            </span>
          </div>

          {/* Estimate */}
          <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-accent))", fontWeight: 500 }}>
            This will generate approximately {dryRun ? 1 : estimatedPages} page{(dryRun ? 1 : estimatedPages) !== 1 ? "s" : ""}
          </p>

          {/* Generate button */}
          <button
            className="admin-btn-primary font-body"
            onClick={() => runGeneration()}
            disabled={generating || selectedNiches.size === 0}
            style={{ width: "100%", justifyContent: "center", padding: "12px 20px", fontSize: 14 }}
          >
            {generating ? (
              <><Loader2 size={16} className="animate-spin" style={{ marginRight: 8 }} /> Generating...</>
            ) : (
              <><Zap size={16} style={{ marginRight: 8 }} /> Generate Content</>
            )}
          </button>
        </div>
      </div>

      {/* Section 2: Progress */}
      {generating && (
        <div className="admin-card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ height: 6, borderRadius: 3, backgroundColor: "hsl(var(--admin-surface-2))", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3, backgroundColor: "hsl(var(--admin-accent))",
                width: "40%", animation: "indeterminate 1.5s infinite ease-in-out",
              }} />
            </div>
            <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>
              Generating... this may take several minutes for large batches
            </p>
          </div>
        </div>
      )}

      {/* Section 2b: Results */}
      {result && !generating && (
        <div className="admin-card" style={{ padding: 24, marginBottom: 20 }}>
          <h2 className="font-body" style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 16 }}>
            Generation Complete
          </h2>
          <div className="flex gap-6 flex-wrap" style={{ marginBottom: 16 }}>
            <Stat label="Success" value={result.success} color="hsl(var(--admin-sage))" />
            <Stat label="Failed" value={result.failed} color="hsl(var(--admin-danger))" />
            <Stat label="Skipped" value={result.skipped_duplicates} color="hsl(var(--admin-text-ghost))" />
          </div>
          {result.pages?.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {result.pages.map((p: any) => (
                <div key={p.id} className="font-body flex items-center justify-between" style={{ padding: "6px 0", fontSize: 12, color: "hsl(var(--admin-text-soft))", borderBottom: "1px solid hsl(var(--admin-border))" }}>
                  <span>{p.title}</span>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, backgroundColor: "hsl(var(--admin-text-ghost) / 0.15)", color: "hsl(var(--admin-text-ghost))" }}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 3: Dry Run Preview */}
      {dryRunResult && !generating && (
        <div className="admin-card" style={{ padding: 24, marginBottom: 20 }}>
          <h2 className="font-body" style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 8 }}>
            Dry Run Preview
          </h2>
          <p className="font-body" style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--admin-accent))", marginBottom: 16 }}>
            {dryRunResult.title}
          </p>
          <pre
            className="font-body"
            style={{
              fontSize: 11, lineHeight: 1.5,
              backgroundColor: "hsl(var(--admin-surface-2))",
              border: "1px solid hsl(var(--admin-border))",
              borderRadius: 6, padding: 16, overflowX: "auto",
              maxHeight: 400, overflowY: "auto",
              color: "hsl(var(--admin-text-soft))",
              fontFamily: "monospace", whiteSpace: "pre-wrap",
            }}
          >
            {JSON.stringify(dryRunResult.content_json, null, 2)}
          </pre>
          <div className="flex gap-2" style={{ marginTop: 16 }}>
            <button
              className="admin-btn-primary font-body"
              onClick={() => { setDryRunResult(null); setDryRun(false); runGeneration(false); }}
              disabled={generating}
            >
              Looks Good — Generate Full Batch
            </button>
            <button
              onClick={() => { setDryRunResult(null); runGeneration(true); }}
              disabled={generating}
              className="font-body"
              style={{ padding: "8px 16px", fontSize: 13, borderRadius: 6, border: "1px solid hsl(var(--admin-border))", background: "none", color: "hsl(var(--admin-text-soft))", cursor: "pointer" }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Section 4: Recent Batches */}
      <div className="admin-card" style={{ padding: 24 }}>
        <h2 className="font-body" style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 16 }}>
          Recent Generation Runs
        </h2>
        {!recentBatches?.length ? (
          <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))" }}>No generation runs yet.</p>
        ) : (
          <div>
            {recentBatches.map((batch) => (
              <div key={batch.batch_id} style={{ borderBottom: "1px solid hsl(var(--admin-border))" }}>
                <button
                  className="flex items-center justify-between w-full font-body"
                  onClick={() => setExpandedBatch(expandedBatch === batch.batch_id ? null : batch.batch_id)}
                  style={{ padding: "10px 0", background: "none", border: "none", cursor: "pointer", color: "hsl(var(--admin-text))", width: "100%", textAlign: "left" }}
                >
                  <div className="flex items-center gap-4">
                    <span style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))", fontFamily: "monospace" }}>
                      {batch.batch_id.slice(0, 8)}…
                    </span>
                    <span style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>
                      {new Date(batch.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span style={{ fontSize: 12, color: "hsl(var(--admin-sage))" }}>{batch.success} ✓</span>
                    {batch.failed > 0 && <span style={{ fontSize: 12, color: "hsl(var(--admin-danger))" }}>{batch.failed} ✗</span>}
                    {expandedBatch === batch.batch_id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>
                {expandedBatch === batch.batch_id && (
                  <div style={{ paddingBottom: 12 }}>
                    {batch.logs.map((log: any) => (
                      <div key={log.id} className="font-body flex items-center justify-between" style={{ padding: "4px 12px", fontSize: 11, color: "hsl(var(--admin-text-soft))" }}>
                        <span>{log.error_message || log.generated_page_id?.slice(0, 8) || "—"}</span>
                        <span style={{
                          fontSize: 10, padding: "1px 6px", borderRadius: 999,
                          backgroundColor: log.status === "success" ? "hsl(var(--admin-sage) / 0.12)" : log.status === "failed" ? "hsl(var(--admin-danger) / 0.12)" : "hsl(var(--admin-text-ghost) / 0.15)",
                          color: log.status === "success" ? "hsl(var(--admin-sage))" : log.status === "failed" ? "hsl(var(--admin-danger))" : "hsl(var(--admin-text-ghost))",
                        }}>
                          {log.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Indeterminate animation */}
      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); width: 40%; }
          50% { transform: translateX(100%); width: 60%; }
          100% { transform: translateX(300%); width: 40%; }
        }
      `}</style>
    </div>
  );
};

const Stat = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="font-body" style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <span style={{ fontSize: 22, fontWeight: 700, color }}>{value}</span>
    <span style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>{label}</span>
  </div>
);

export default GenerationControls;
