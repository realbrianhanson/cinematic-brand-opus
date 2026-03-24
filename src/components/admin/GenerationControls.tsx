import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, ChevronDown, ChevronUp, Zap, ImageIcon, Link2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";

interface BatchGroup {
  batch_id: string;
  date: string;
  success: number;
  failed: number;
  total: number;
  logs: any[];
}

interface GenerationJob {
  id: string;
  batch_id: string;
  status: string;
  total_combinations: number;
  completed_count: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  result_summary: any;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

const GenerationControls = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Form state
  const [selectedContentTypes, setSelectedContentTypes] = useState<Set<string>>(new Set(["all_active"]));
  const [selectedNiches, setSelectedNiches] = useState<Set<string>>(new Set());
  const [nicheSearch, setNicheSearch] = useState("");
  const [pagesPerCombo, setPagesPerCombo] = useState(1);
  const [dryRun, setDryRun] = useState(false);

  // Progress state
  const [generating, setGenerating] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [generatingOg, setGeneratingOg] = useState(false);
  const [buildingLinks, setBuildingLinks] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  // Active jobs (realtime)
  const [activeJobs, setActiveJobs] = useState<GenerationJob[]>([]);
  const [completedJobs, setCompletedJobs] = useState<GenerationJob[]>([]);
  const hasRunningJob = activeJobs.some((j) => j.status === "pending" || j.status === "running");

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

  // Fetch active/recent jobs on mount
  useEffect(() => {
    const fetchJobs = async () => {
      const { data } = await supabase
        .from("generation_jobs")
        .select("*")
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false });
      if (data) setActiveJobs(data as GenerationJob[]);
    };
    fetchJobs();
  }, []);

  // Subscribe to realtime updates on generation_jobs
  useEffect(() => {
    const channel = supabase
      .channel("generation-jobs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generation_jobs" },
        (payload) => {
          const newRow = payload.new as GenerationJob;
          if (!newRow?.id) return;

          setActiveJobs((prev) => {
            const existing = prev.findIndex((j) => j.id === newRow.id);
            if (newRow.status === "completed" || newRow.status === "failed") {
              // Move to completed jobs list (visible for 8 seconds)
              setCompletedJobs((cj) => [...cj, newRow]);
              setTimeout(() => {
                setCompletedJobs((cj) => cj.filter((j) => j.id !== newRow.id));
              }, 8000);

              if (newRow.status === "completed") {
                toast({
                  title: "Generation complete",
                  description: `${newRow.success_count} pages created, ${newRow.failed_count} failed, ${newRow.skipped_count} skipped.`,
                });
                qc.invalidateQueries({ queryKey: ["admin-generated-pages"] });
                refetchBatches();
              } else {
                toast({
                  title: "Generation failed",
                  description: newRow.error_message || "An error occurred during generation.",
                  variant: "destructive",
                });
              }
              setGenerating(false);
              return prev.filter((j) => j.id !== newRow.id);
            }

            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = newRow;
              return updated;
            }
            return [newRow, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast, qc, refetchBatches]);

  const filteredNiches = useMemo(() => {
    if (!niches) return [];
    if (!nicheSearch.trim()) return niches;
    const q = nicheSearch.toLowerCase();
    return niches.filter((n) => n.name.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q));
  }, [niches, nicheSearch]);

  const activeSchemas = schemas?.filter((s) => s.is_active) ?? [];
  const isAllSelected = selectedContentTypes.has("all_active");
  const activeSchemaCount = isAllSelected ? activeSchemas.length : selectedContentTypes.size;
  const estimatedPages = selectedNiches.size * Math.max(activeSchemaCount, 1) * pagesPerCombo;
  const hasSchemas = (schemas?.length ?? 0) > 0;

  const toggleAllContentTypes = () => {
    if (isAllSelected) {
      setSelectedContentTypes(new Set());
    } else {
      setSelectedContentTypes(new Set(["all_active"]));
    }
  };

  const toggleContentType = (slug: string) => {
    setSelectedContentTypes((prev) => {
      const next = new Set(prev);
      next.delete("all_active"); // Remove "all" when manually picking
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      // If all active schemas are now selected, switch to "all_active"
      if (activeSchemas.length > 0 && activeSchemas.every((s) => next.has(s.slug))) {
        return new Set(["all_active"]);
      }
      return next;
    });
  };

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
    if (!hasSchemas) {
      toast({ title: "No content types", description: "Create at least one content type first.", variant: "destructive" });
      return;
    }

    if (isDry) {
      // Dry run is synchronous
      setGenerating(true);
      setDryRunResult(null);
      try {
        const { data, error } = await supabase.functions.invoke("generate-content", {
          body: {
            niche_slugs: Array.from(selectedNiches),
            content_type_slugs: isAllSelected ? ["all_active"] : Array.from(selectedContentTypes),
            count_per_combination: pagesPerCombo,
            dry_run: true,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setDryRunResult(data);
        toast({ title: "Dry run complete", description: "Preview the generated content below." });
      } catch (err: any) {
        toast({ title: "Dry run failed", description: err.message, variant: "destructive" });
      } finally {
        setGenerating(false);
      }
      return;
    }

    // Real generation — returns job_id immediately
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          niche_slugs: Array.from(selectedNiches),
          content_type_slugs: isAllSelected ? ["all_active"] : Array.from(selectedContentTypes),
          count_per_combination: pagesPerCombo,
          dry_run: false,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Generation started", description: `Job queued — ${data.total_combinations} pages. You can navigate away.` });

      // Add to active jobs optimistically
      setActiveJobs((prev) => [
        {
          id: data.job_id,
          batch_id: data.batch_id,
          status: "pending",
          total_combinations: data.total_combinations,
          completed_count: 0,
          success_count: 0,
          failed_count: 0,
          skipped_count: 0,
          result_summary: null,
          error_message: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      // Keep generating=true until realtime reports completion
    } catch (err: any) {
      setGenerating(false);
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1 className="font-body" style={{ fontSize: 22, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 8 }}>
        Generate Content
      </h1>
      <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))", marginBottom: 24, lineHeight: 1.5 }}>
        Create SEO-optimized pages automatically. Pick which industries you want to target and what type of content to create — the AI does the rest.
      </p>

      {/* Active Jobs & Completed Jobs */}
      {(activeJobs.length > 0 || completedJobs.length > 0) && (
        <div className="admin-card" style={{ padding: 24, marginBottom: 20 }}>
          <h2 className="font-body" style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 16 }}>
            {activeJobs.length > 0 ? "Active Jobs" : "Just Completed"}
          </h2>
          {activeJobs.map((job) => {
            const pct = job.total_combinations > 0 ? Math.round((job.completed_count / job.total_combinations) * 100) : 0;
            return (
              <div key={job.id} style={{ marginBottom: 16 }}>
                <div className="flex items-center justify-between font-body" style={{ marginBottom: 8 }}>
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" style={{ color: "hsl(var(--admin-accent))" }} />
                    <span style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>
                      {job.status === "pending" ? "Starting..." : `${job.completed_count} of ${job.total_combinations} pages`}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))", fontFamily: "monospace" }}>
                    {job.batch_id.slice(0, 8)}…
                  </span>
                </div>
                <Progress value={pct} className="h-2" />
                <div className="flex gap-4 font-body" style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "hsl(var(--admin-sage))" }}>✓ {job.success_count}</span>
                  {job.failed_count > 0 && <span style={{ fontSize: 11, color: "hsl(var(--admin-danger))" }}>✗ {job.failed_count}</span>}
                  {job.skipped_count > 0 && <span style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>⊘ {job.skipped_count}</span>}
                </div>
              </div>
            );
          })}
          {completedJobs.map((job) => (
            <div key={job.id} style={{ marginBottom: 12, padding: 12, borderRadius: 6, backgroundColor: job.status === "completed" ? "hsl(var(--admin-sage) / 0.08)" : "hsl(var(--admin-danger) / 0.08)", border: `1px solid ${job.status === "completed" ? "hsl(var(--admin-sage) / 0.2)" : "hsl(var(--admin-danger) / 0.2)"}` }}>
              <div className="flex items-center gap-2 font-body">
                {job.status === "completed" ? (
                  <CheckCircle2 size={16} style={{ color: "hsl(var(--admin-sage))" }} />
                ) : (
                  <XCircle size={16} style={{ color: "hsl(var(--admin-danger))" }} />
                )}
                <span style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--admin-text))" }}>
                  {job.status === "completed"
                    ? `Done — ${job.success_count} pages created${job.failed_count > 0 ? `, ${job.failed_count} failed` : ""}${job.skipped_count > 0 ? `, ${job.skipped_count} skipped` : ""}`
                    : `Failed — ${job.error_message || "An error occurred"}`}
                </span>
              </div>
              {job.status === "completed" && (
                <a
                  href="/admin/generated-pages"
                  className="font-body"
                  style={{ fontSize: 12, color: "hsl(var(--admin-accent))", textDecoration: "underline", marginTop: 6, display: "inline-block" }}
                >
                  View generated pages →
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No content types guard */}
      {!hasSchemas && schemas !== undefined && (
        <div className="admin-card" style={{ padding: 24, marginBottom: 20, borderColor: "hsl(var(--admin-warning) / 0.3)" }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={18} style={{ color: "hsl(var(--admin-warning, 45 93% 47%))" }} />
            <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>
              No content types found. Create at least one content type before generating content.
            </p>
          </div>
        </div>
      )}

      {/* Section 1: Form */}
      <div className="admin-card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Content Types multi-select */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <span className="admin-label" style={{ margin: 0 }}>Content Types</span>
              <div className="flex items-center gap-3">
                <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>
                  {isAllSelected ? activeSchemas.length : selectedContentTypes.size} of {activeSchemas.length} selected
                </span>
                <button
                  onClick={toggleAllContentTypes}
                  className="font-body"
                  style={{ fontSize: 11, color: "hsl(var(--admin-accent))", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >
                  {isAllSelected ? "Deselect All" : "Select All"}
                </button>
              </div>
            </div>
            <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", margin: "0 0 8px" }}>
              Pick the page types you want. Each selected type will be generated for each selected industry.
              {selectedNiches.size > 0 && activeSchemaCount > 0 && (
                <> For example: {selectedNiches.size} {selectedNiches.size === 1 ? "industry" : "industries"} × {activeSchemaCount} {activeSchemaCount === 1 ? "type" : "types"} × {pagesPerCombo} = {estimatedPages} pages total.</>
              )}
            </p>
            <div
              style={{
                maxHeight: 200, overflowY: "auto", border: "1px solid hsl(var(--admin-border))",
                borderRadius: 6, backgroundColor: "hsl(var(--admin-surface-2))",
              }}
            >
              {(schemas ?? []).filter((s) => s.is_active).map((s) => (
                <label
                  key={s.slug}
                  className="flex items-center gap-3 font-body"
                  style={{
                    padding: "8px 12px", fontSize: 13, cursor: "pointer",
                    color: "hsl(var(--admin-text-soft))",
                    borderBottom: "1px solid hsl(var(--admin-border))",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isAllSelected || selectedContentTypes.has(s.slug)}
                    onChange={() => toggleContentType(s.slug)}
                    style={{ accentColor: "hsl(var(--admin-accent))" }}
                  />
                  {s.name}
                </label>
              ))}
              {activeSchemas.length === 0 && (
                <div className="font-body" style={{ padding: 16, textAlign: "center", fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>
                  No active content types found
                </div>
              )}
            </div>
          </div>

          {/* Niches multi-select */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <span className="admin-label" style={{ margin: 0 }}>Industries / Niches</span>
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
            <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", margin: "0 0 8px" }}>
              Each niche is an industry or audience you want to target. Select one or more — content will be tailored for each.
            </p>
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
            <span className="admin-label">Pages Per Industry</span>
            <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", margin: "2px 0 6px" }}>
              How many pages to create for each industry + content type pair. For example, if you pick 3 industries and 2 content types with "2" here, you'll get 12 pages total.
            </p>
            <input
              className="admin-input font-body"
              type="number" min={1} max={5} value={pagesPerCombo}
              onChange={(e) => setPagesPerCombo(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
              style={{ width: 100 }}
            />
          </div>

          {/* Dry run */}
          <div className="flex items-center gap-3">
            <Switch checked={dryRun} onCheckedChange={setDryRun} />
            <div>
              <span className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>
                Preview First (Dry Run)
              </span>
              <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", margin: "2px 0 0" }}>
                Generate a sample without saving anything — so you can review the quality before committing.
              </p>
            </div>
          </div>

          {/* Estimate */}
          <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-accent))", fontWeight: 500 }}>
            This will generate approximately {dryRun ? 1 : estimatedPages} page{(dryRun ? 1 : estimatedPages) !== 1 ? "s" : ""}
          </p>

          {/* Generate button */}
          <button
            className="admin-btn-primary font-body"
            onClick={() => runGeneration()}
            disabled={generating || selectedNiches.size === 0 || !hasSchemas || (!isAllSelected && selectedContentTypes.size === 0)}
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

      {/* Dry Run Preview */}
      {dryRunResult && !generating && (
        <div className="admin-card" style={{ padding: 24, marginBottom: 20 }}>
          <h2 className="font-body" style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 8 }}>
            Dry Run Preview ({dryRunResult.results?.length ?? 0} sample{(dryRunResult.results?.length ?? 0) !== 1 ? "s" : ""})
          </h2>
          {(dryRunResult.results ?? []).map((sample: any, idx: number) => (
            <div key={idx} style={{ marginBottom: idx < (dryRunResult.results?.length ?? 1) - 1 ? 20 : 0 }}>
              <p className="font-body" style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--admin-accent))", marginBottom: 8 }}>
                {sample.title} <span style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>({sample.content_type} → {sample.niche})</span>
              </p>
              <pre
                className="font-body"
                style={{
                  fontSize: 11, lineHeight: 1.5,
                  backgroundColor: "hsl(var(--admin-surface-2))",
                  border: "1px solid hsl(var(--admin-border))",
                  borderRadius: 6, padding: 16, overflowX: "auto",
                  maxHeight: 300, overflowY: "auto",
                  color: "hsl(var(--admin-text-soft))",
                  fontFamily: "monospace", whiteSpace: "pre-wrap",
                }}
              >
                {JSON.stringify(sample.content_json, null, 2)}
              </pre>
            </div>
          ))}
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

      {/* Recent Batches */}
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

      {/* OG Image Generation */}
      <div className="admin-card" style={{ padding: 24, marginTop: 20 }}>
        <h2 className="font-body" style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 8 }}>
          OG Images
        </h2>
        <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))", marginBottom: 16 }}>
          Generate branded Open Graph images for all published pages that don't have one yet.
        </p>
        <button
          className="admin-btn-primary font-body"
          disabled={generatingOg}
          onClick={async () => {
            setGeneratingOg(true);
            try {
              const { data, error } = await supabase.functions.invoke("generate-og-image", { body: { batch: true } });
              if (error) throw error;
              if (data?.error) throw new Error(data.error);
              toast({ title: "OG images generated", description: `${data.processed} images created.` });
            } catch (err: any) {
              toast({ title: "Failed", description: err.message, variant: "destructive" });
            } finally {
              setGeneratingOg(false);
            }
          }}
        >
          {generatingOg ? (
            <><Loader2 size={16} className="animate-spin" style={{ marginRight: 8 }} /> Generating...</>
          ) : (
            <><ImageIcon size={16} style={{ marginRight: 8 }} /> Generate All Missing OG Images</>
          )}
        </button>
      </div>

      {/* Silo Link Building */}
      <div className="admin-card" style={{ padding: 24, marginTop: 20 }}>
        <h2 className="font-body" style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 8 }}>
          Silo Links
        </h2>
        <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))", marginBottom: 16 }}>
          Rebuild internal silo links for all published pages. Links flow UP to pillar pages and ACROSS to siblings within the same niche. No cross-silo links.
        </p>
        <button
          className="admin-btn-primary font-body"
          disabled={buildingLinks}
          onClick={async () => {
            setBuildingLinks(true);
            try {
              const { data, error } = await supabase.functions.invoke("build-silo-links", { body: { rebuild_all: true } });
              if (error) throw error;
              if (data?.error) throw new Error(data.error);
              toast({ title: "Silo links rebuilt", description: `${data.links_created} links created.` });
            } catch (err: any) {
              toast({ title: "Failed", description: err.message, variant: "destructive" });
            } finally {
              setBuildingLinks(false);
            }
          }}
        >
          {buildingLinks ? (
            <><Loader2 size={16} className="animate-spin" style={{ marginRight: 8 }} /> Building...</>
          ) : (
            <><Link2 size={16} style={{ marginRight: 8 }} /> Rebuild All Silo Links</>
          )}
        </button>
      </div>
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
