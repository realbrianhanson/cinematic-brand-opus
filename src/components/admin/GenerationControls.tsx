import { z } from "zod";
import type { Tables } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/errorMessage";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { withTimeout } from "@/lib/withTimeout";
import {
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  Zap,
  ImageIcon,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  estimateGeneration,
  jobPhase,
  MAX_PAGES_PER_COMBINATION,
  MAX_PAGES_PER_JOB,
  STALL_AFTER_MINUTES,
} from "../../../supabase/functions/_shared/generationLimits";
import { invokeAdminFunction } from "./manualPublishClient";
import GenerationJobsPanel, { type GenerationJob } from "./GenerationJobsPanel";

interface BatchGroup {
  batch_id: string;
  date: string;
  success: number;
  failed: number;
  costUsd: number;
  dryRun: boolean;
  logs: Tables<"generation_logs">[];
}

const OPEN_STATUSES = ["pending", "running", "stalled"];
const FINISHED_STATUSES = ["completed", "failed", "cancelled"];
/** Re-evaluate stall state while the page stays open. */
const CLOCK_TICK_MS = 60_000;

// mark_stalled_generation_jobs is newer than the generated client types.
const markStalledJobs = () =>
  (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: unknown }>;
    }
  ).rpc("mark_stalled_generation_jobs", {
    p_stall_minutes: STALL_AFTER_MINUTES,
  });

const usd = (n: number) =>
  n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n >= 0.1 ? 2 : 3)}`;

const bodyError = (body: Record<string, unknown>, fallback: string) =>
  typeof body.error === "string" && body.error.trim() ? body.error : fallback;

const GenerationControls = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Form state
  const [selectedContentTypes, setSelectedContentTypes] = useState<Set<string>>(
    new Set(["all_active"]),
  );
  const [selectedNiches, setSelectedNiches] = useState<Set<string>>(new Set());
  const [nicheSearch, setNicheSearch] = useState("");
  const [pagesPerCombo, setPagesPerCombo] = useState(1);
  const [dryRun, setDryRun] = useState(false);

  // Progress state
  const [generating, setGenerating] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{
    results: {
      title: string;
      content_type: string;
      niche: string;
      content_json?: unknown;
    }[];
  } | null>(null);
  const [generatingOg, setGeneratingOg] = useState(false);
  const [buildingLinks, setBuildingLinks] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);

  // Jobs (realtime). Stalled jobs never block Generate.
  const [openJobs, setOpenJobs] = useState<GenerationJob[]>([]);
  const [finishedJobs, setFinishedJobs] = useState<GenerationJob[]>([]);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsChecked, setJobsChecked] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const jobsRequest = useRef(0);
  const jobsMounted = useRef(false);
  const jobsController = useRef<AbortController | null>(null);
  const jobRevision = useRef(0);
  const jobChanges = useRef(
    new Map<string, { revision: number; row: GenerationJob }>(),
  );
  const rememberJob = useCallback((row: GenerationJob) => {
    jobChanges.current.set(row.id, { revision: ++jobRevision.current, row });
  }, []);
  const hasRunningJob = openJobs.some((j) => jobPhase(j, nowMs) === "active");

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const { data: schemas } = useQuery({
    queryKey: ["gen-schemas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("content_schemas")
        .select("slug, name, is_active")
        .order("name");
      return data ?? [];
    },
  });

  const { data: niches } = useQuery({
    queryKey: ["gen-niches"],
    queryFn: async () => {
      const { data } = await supabase
        .from("niches")
        .select("id, slug, name, is_active")
        .eq("is_active", true)
        .order("name");
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
        const group = groups[bid] ?? {
          batch_id: bid,
          date: log.created_at ?? new Date().toISOString(),
          success: 0,
          failed: 0,
          costUsd: 0,
          dryRun: true,
          logs: [],
        };
        groups[bid] = {
          ...group,
          success: group.success + (log.status === "success" ? 1 : 0),
          failed: group.failed + (log.status === "failed" ? 1 : 0),
          costUsd: group.costUsd + Number(log.cost ?? 0),
          dryRun: group.dryRun && log.status === "dry_run",
          logs: [...group.logs, log],
        };
      }
      return Object.values(groups)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10);
    },
  });

  // A failed or late refresh must not erase known work or resurrect a job
  // that completed through realtime while the snapshot was in flight.
  const loadJobs = useCallback(async () => {
    const request = ++jobsRequest.current;
    const startedRevision = jobRevision.current;
    jobsController.current?.abort();
    const controller = new AbortController();
    jobsController.current = controller;
    setJobsLoading(true);
    try {
      const { data, error } = await withTimeout(
        (async () => {
          await markStalledJobs().catch(() => undefined);
          if (controller.signal.aborted)
            throw new Error("Job status check cancelled");
          return await supabase
            .from("generation_jobs")
            .select("*")
            .in("status", OPEN_STATUSES)
            .order("created_at", { ascending: false })
            .abortSignal(controller.signal);
        })(),
        12_000,
      );
      if (error) throw error;
      if (!Array.isArray(data))
        throw new Error("Missing generation job snapshot");
      if (!jobsMounted.current || request !== jobsRequest.current) return;
      const snapshot = new Map(
        (data ?? []).map((row) => [row.id, row as GenerationJob]),
      );
      for (const { revision, row } of jobChanges.current.values()) {
        if (revision <= startedRevision) continue;
        if (OPEN_STATUSES.includes(row.status)) snapshot.set(row.id, row);
        else snapshot.delete(row.id);
      }
      setOpenJobs([...snapshot.values()]);
      setJobsChecked(true);
      setJobsError(null);
      setNowMs(Date.now());
    } catch {
      if (!jobsMounted.current || request !== jobsRequest.current) return;
      setJobsError(
        "Could not check generation jobs. Known jobs are still shown. Check again before starting another job.",
      );
    } finally {
      controller.abort();
      if (jobsMounted.current && request === jobsRequest.current)
        setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    jobsMounted.current = true;
    const requestState = jobsRequest;
    void loadJobs();
    return () => {
      jobsMounted.current = false;
      requestState.current++;
      jobsController.current?.abort();
    };
  }, [loadJobs]);

  // Subscribe to realtime updates on generation_jobs
  useEffect(() => {
    const channel = supabase
      .channel("generation-jobs-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generation_jobs" },
        (payload) => {
          const row = payload.new as GenerationJob;
          if (!jobsMounted.current || !row?.id) return;
          rememberJob(row);
          setNowMs(Date.now());
          if (FINISHED_STATUSES.includes(row.status)) {
            setOpenJobs((prev) => prev.filter((j) => j.id !== row.id));
            setFinishedJobs((prev) => [
              row,
              ...prev.filter((j) => j.id !== row.id),
            ]);
            if (row.status === "completed") {
              toast({
                title: "Generation complete",
                description: `${row.success_count} pages created, ${row.failed_count} failed, ${row.skipped_count} skipped.`,
              });
              qc.invalidateQueries({ queryKey: ["admin-generated-pages"] });
              refetchBatches();
            } else if (row.status === "failed") {
              toast({
                title: "Generation failed",
                description:
                  row.error_message || "An error occurred during generation.",
                variant: "destructive",
              });
            }
            return;
          }
          setOpenJobs((prev) =>
            prev.some((j) => j.id === row.id)
              ? prev.map((j) => (j.id === row.id ? row : j))
              : [row, ...prev],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast, qc, refetchBatches, rememberJob]);

  const filteredNiches = useMemo(() => {
    if (!niches) return [];
    if (!nicheSearch.trim()) return niches;
    const q = nicheSearch.toLowerCase();
    return niches.filter(
      (n) =>
        n.name.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q),
    );
  }, [niches, nicheSearch]);

  const activeSchemas = schemas?.filter((s) => s.is_active) ?? [];
  const isAllSelected = selectedContentTypes.has("all_active");
  const activeSchemaCount = isAllSelected
    ? activeSchemas.length
    : selectedContentTypes.size;
  const estimatedPages =
    selectedNiches.size * Math.max(activeSchemaCount, 1) * pagesPerCombo;
  const estimate = estimateGeneration(estimatedPages);
  const overCap = estimatedPages > MAX_PAGES_PER_JOB;
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
      if (
        activeSchemas.length > 0 &&
        activeSchemas.every((s) => next.has(s.slug))
      ) {
        return new Set(["all_active"]);
      }
      return next;
    });
  };

  // "Select All" acts on the niches the filter shows.
  const nicheFilterActive = nicheSearch.trim().length > 0;
  const allShownSelected =
    filteredNiches.length > 0 &&
    filteredNiches.every((n) => selectedNiches.has(n.slug));
  const selectAllLabel = nicheFilterActive
    ? `${allShownSelected ? "Deselect" : "Select"} ${filteredNiches.length} shown`
    : allShownSelected
      ? "Deselect All"
      : "Select All";

  const toggleAll = () => {
    setSelectedNiches((prev) => {
      const next = new Set(prev);
      for (const n of filteredNiches) {
        if (allShownSelected) next.delete(n.slug);
        else next.add(n.slug);
      }
      return next;
    });
  };

  const toggleNiche = (slug: string) => {
    setSelectedNiches((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const requestBody = () => ({
    niche_slugs: Array.from(selectedNiches),
    content_type_slugs: isAllSelected
      ? ["all_active"]
      : Array.from(selectedContentTypes),
    count_per_combination: pagesPerCombo,
  });

  const runDryRun = async () => {
    setGenerating(true);
    setDryRunResult(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-content",
        { body: { ...requestBody(), dry_run: true } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDryRunResult(
        z
          .object({
            results: z.array(
              z.object({
                title: z.string(),
                content_type: z.string(),
                niche: z.string(),
                content_json: z.unknown(),
              }),
            ),
          })
          .parse(data),
      );
      toast({
        title: "Dry run complete",
        description: "Preview the generated content below.",
      });
    } catch (err) {
      toast({
        title: "Dry run failed",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
      refetchBatches();
    }
  };

  const runGeneration = (overrideDryRun?: boolean) => {
    if (jobsLoading || !jobsChecked || jobsError) return;
    const isDry = overrideDryRun ?? dryRun;
    if (selectedNiches.size === 0) {
      toast({
        title: "Select niches",
        description: "Pick at least one niche.",
        variant: "destructive",
      });
      return;
    }
    if (!hasSchemas) {
      toast({
        title: "No content types",
        description: "Create at least one content type first.",
        variant: "destructive",
      });
      return;
    }
    if (isDry) {
      void runDryRun();
      return;
    }
    if (overCap) return;
    // Real generation always goes through the confirm dialog.
    setConfirmOpen(true);
  };

  const startGeneration = async () => {
    if (jobsLoading || !jobsChecked || jobsError || hasRunningJob || generating)
      return;
    setConfirmOpen(false);
    setGenerating(true);
    const startedRevision = jobRevision.current;
    try {
      const { status, body } = await invokeAdminFunction("generate-content", {
        ...requestBody(),
        dry_run: false,
        confirmed_total: estimatedPages,
      });
      if (status !== 200) {
        if (body.code === "confirm_required")
          throw new Error(
            `The server counts ${String(body.total_combinations)} pages for this selection. Review it and confirm again.`,
          );
        if (body.code === "job_running") void loadJobs();
        throw new Error(bodyError(body, "Generation could not start."));
      }
      const now = new Date().toISOString();
      const job: GenerationJob = {
        id: String(body.job_id),
        batch_id: String(body.batch_id),
        status: "pending",
        total_combinations: Number(body.total_combinations) || estimatedPages,
        completed_count: 0,
        success_count: 0,
        failed_count: 0,
        skipped_count: 0,
        result_summary: null,
        error_message: null,
        work_queue: null,
        created_at: now,
        updated_at: now,
      };
      const observed = jobChanges.current.get(job.id);
      if (!observed || observed.revision <= startedRevision) {
        rememberJob(job);
        setOpenJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
      }
      setNowMs(Date.now());
      toast({
        title: "Generation started",
        description: `Job queued — ${job.total_combinations} pages. You can navigate away.`,
      });
    } catch (err) {
      toast({
        title: "Generation failed",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const cancelJob = async (job: GenerationJob) => {
    setBusyJobId(job.id);
    try {
      const { data, error } = await supabase
        .from("generation_jobs")
        .update({ status: "cancelled", error_message: "Cancelled by admin" })
        .eq("id", job.id)
        .in("status", OPEN_STATUSES)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        toast({ title: "This job had already finished" });
        void loadJobs();
        return;
      }
      const cancelled = { ...job, status: "cancelled" };
      rememberJob(cancelled);
      setOpenJobs((prev) => prev.filter((j) => j.id !== job.id));
      setFinishedJobs((prev) => [
        cancelled,
        ...prev.filter((j) => j.id !== job.id),
      ]);
      toast({
        title: "Job cancelled",
        description: `${job.completed_count} of ${job.total_combinations} pages were processed.`,
      });
    } catch (err) {
      toast({
        title: "Could not cancel the job",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusyJobId(null);
    }
  };

  const resumeJob = async (job: GenerationJob) => {
    setBusyJobId(job.id);
    const startedRevision = jobRevision.current;
    try {
      const { status, body } = await invokeAdminFunction("generate-content", {
        resume_job_id: job.id,
      });
      if (status !== 200)
        throw new Error(bodyError(body, "The job could not resume."));
      const now = new Date().toISOString();
      const observed = jobChanges.current.get(job.id);
      if (!observed || observed.revision <= startedRevision) {
        rememberJob({
          ...job,
          status: "running",
          error_message: null,
          updated_at: now,
        });
        setOpenJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? {
                  ...j,
                  status: "running",
                  error_message: null,
                  updated_at: now,
                }
              : j,
          ),
        );
      }
      setNowMs(Date.now());
      toast({
        title: "Job resumed",
        description: `Continuing from page ${Number(body.resumed_from ?? job.completed_count) + 1}.`,
      });
    } catch (err) {
      toast({
        title: "Could not resume the job",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setBusyJobId(null);
    }
  };

  const generateDisabled =
    jobsLoading ||
    !jobsChecked ||
    !!jobsError ||
    generating ||
    hasRunningJob ||
    selectedNiches.size === 0 ||
    !hasSchemas ||
    (!isAllSelected && selectedContentTypes.size === 0) ||
    (!dryRun && overCap);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1
        className="font-body"
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: "hsl(var(--admin-text))",
          marginBottom: 8,
        }}
      >
        Generate Content
      </h1>
      <p
        className="font-body"
        style={{
          fontSize: 13,
          color: "hsl(var(--admin-text-ghost))",
          marginBottom: 24,
          lineHeight: 1.5,
        }}
      >
        Create SEO-optimized pages automatically. Pick which industries you want
        to target and what type of content to create — the AI does the rest.
      </p>

      <div className="mb-4 space-y-2">
        {jobsError && (
          <p role="alert" className="admin-notice admin-notice-error">
            {jobsError}
          </p>
        )}
        {jobsLoading && (
          <p role="status" className="admin-help">
            Checking generation jobs…
          </p>
        )}
        <button
          type="button"
          className="admin-btn-ghost"
          onClick={() => void loadJobs()}
          disabled={jobsLoading}
        >
          {jobsError ? "Retry job status" : "Refresh job status"}
        </button>
      </div>

      <GenerationJobsPanel
        openJobs={openJobs}
        finishedJobs={finishedJobs}
        nowMs={nowMs}
        busyJobId={busyJobId}
        onCancel={cancelJob}
        onResume={resumeJob}
      />

      {confirmOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-generation-title"
            className="admin-card font-body"
            style={{ padding: 28, maxWidth: 460, width: "90%" }}
          >
            <h2
              id="confirm-generation-title"
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "hsl(var(--admin-text))",
                marginBottom: 12,
              }}
            >
              Generate {estimatedPages} pages?
            </h2>
            <ul
              style={{
                fontSize: 13,
                color: "hsl(var(--admin-text-soft))",
                marginBottom: 12,
                paddingLeft: 16,
              }}
            >
              <li style={{ listStyle: "disc" }}>
                {selectedNiches.size}{" "}
                {selectedNiches.size === 1 ? "industry" : "industries"} ×{" "}
                {activeSchemaCount} {activeSchemaCount === 1 ? "type" : "types"}{" "}
                × {pagesPerCombo} = {estimatedPages} draft pages
              </li>
              <li style={{ listStyle: "disc" }}>
                Estimated AI and research cost: about {usd(estimate.costUsd)}
              </li>
              <li style={{ listStyle: "disc" }}>
                Estimated time: about {estimate.minutes} minutes in the
                background
              </li>
            </ul>
            <p
              style={{
                fontSize: 12,
                color: "hsl(var(--admin-text-ghost))",
                marginBottom: 20,
              }}
            >
              Costs are estimates from past runs; the real cost of each page is
              recorded as it is generated. You can cancel the job while it runs.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="admin-btn-ghost"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="admin-btn-primary"
                onClick={startGeneration}
                disabled={generateDisabled}
              >
                Generate {estimatedPages} pages
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section 1: Form */}
      <div className="admin-card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Content Types multi-select */}
          <div>
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 4 }}
            >
              <span className="admin-label" style={{ margin: 0 }}>
                Content Types
              </span>
              <div className="flex items-center gap-3">
                <span
                  className="font-body"
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--admin-text-ghost))",
                  }}
                >
                  {isAllSelected
                    ? activeSchemas.length
                    : selectedContentTypes.size}{" "}
                  of {activeSchemas.length} selected
                </span>
                <button
                  onClick={toggleAllContentTypes}
                  className="font-body"
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--admin-accent))",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  {isAllSelected ? "Deselect All" : "Select All"}
                </button>
              </div>
            </div>
            <p
              className="font-body"
              style={{
                fontSize: 11,
                color: "hsl(var(--admin-text-ghost))",
                margin: "0 0 8px",
              }}
            >
              Pick the page types you want. Each selected type will be generated
              for each selected industry.
              {selectedNiches.size > 0 && activeSchemaCount > 0 && (
                <>
                  {" "}
                  For example: {selectedNiches.size}{" "}
                  {selectedNiches.size === 1 ? "industry" : "industries"} ×{" "}
                  {activeSchemaCount}{" "}
                  {activeSchemaCount === 1 ? "type" : "types"} × {pagesPerCombo}{" "}
                  = {estimatedPages} pages total.
                </>
              )}
            </p>
            <div
              style={{
                maxHeight: 200,
                overflowY: "auto",
                border: "1px solid hsl(var(--admin-border))",
                borderRadius: 6,
                backgroundColor: "hsl(var(--admin-surface-2))",
              }}
            >
              {(schemas ?? [])
                .filter((s) => s.is_active)
                .map((s) => (
                  <label
                    key={s.slug}
                    className="flex items-center gap-3 font-body"
                    style={{
                      padding: "8px 12px",
                      fontSize: 13,
                      cursor: "pointer",
                      color: "hsl(var(--admin-text-soft))",
                      borderBottom: "1px solid hsl(var(--admin-border))",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        isAllSelected || selectedContentTypes.has(s.slug)
                      }
                      onChange={() => toggleContentType(s.slug)}
                      style={{ accentColor: "hsl(var(--admin-accent))" }}
                    />
                    {s.name}
                  </label>
                ))}
              {activeSchemas.length === 0 && (
                <div
                  className="font-body"
                  style={{
                    padding: 16,
                    textAlign: "center",
                    fontSize: 12,
                    color: "hsl(var(--admin-text-ghost))",
                  }}
                >
                  No active content types found
                </div>
              )}
            </div>
          </div>

          {/* Niches multi-select */}
          <div>
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 4 }}
            >
              <span className="admin-label" style={{ margin: 0 }}>
                Industries / Niches
              </span>
              <div className="flex items-center gap-3">
                <span
                  className="font-body"
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--admin-text-ghost))",
                  }}
                >
                  {selectedNiches.size} of {niches?.length ?? 0} selected
                </span>
                <button
                  onClick={toggleAll}
                  className="font-body"
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--admin-accent))",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  {selectAllLabel}
                </button>
              </div>
            </div>
            <p
              className="font-body"
              style={{
                fontSize: 11,
                color: "hsl(var(--admin-text-ghost))",
                margin: "0 0 8px",
              }}
            >
              Each niche is an industry or audience you want to target. Select
              one or more — content will be tailored for each.
            </p>
            <div style={{ position: "relative", marginBottom: 8 }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "hsl(var(--admin-text-ghost))",
                }}
              />
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
                maxHeight: 300,
                overflowY: "auto",
                border: "1px solid hsl(var(--admin-border))",
                borderRadius: 6,
                backgroundColor: "hsl(var(--admin-surface-2))",
              }}
            >
              {filteredNiches.map((n) => (
                <label
                  key={n.slug}
                  className="flex items-center gap-3 font-body"
                  style={{
                    padding: "8px 12px",
                    fontSize: 13,
                    cursor: "pointer",
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
                <div
                  className="font-body"
                  style={{
                    padding: 16,
                    textAlign: "center",
                    fontSize: 12,
                    color: "hsl(var(--admin-text-ghost))",
                  }}
                >
                  No niches found
                </div>
              )}
            </div>
          </div>

          {/* Pages per combo */}
          <div>
            <span className="admin-label">Pages Per Industry</span>
            <p
              className="font-body"
              style={{
                fontSize: 11,
                color: "hsl(var(--admin-text-ghost))",
                margin: "2px 0 6px",
              }}
            >
              How many pages to create for each industry + content type pair.
              For example, if you pick 3 industries and 2 content types with "2"
              here, you'll get 12 pages total.
            </p>
            <input
              className="admin-input font-body"
              type="number"
              aria-label="Pages per industry"
              min={1}
              max={MAX_PAGES_PER_COMBINATION}
              value={pagesPerCombo}
              onChange={(e) =>
                setPagesPerCombo(
                  Math.max(
                    1,
                    Math.min(
                      MAX_PAGES_PER_COMBINATION,
                      parseInt(e.target.value) || 1,
                    ),
                  ),
                )
              }
              style={{ width: 100 }}
            />
          </div>

          {/* Job size cap */}
          {overCap && !dryRun && (
            <div
              role="alert"
              style={{
                padding: "10px 14px",
                borderRadius: 6,
                backgroundColor: "hsl(var(--admin-danger) / 0.08)",
                border: "1px solid hsl(var(--admin-danger) / 0.25)",
              }}
            >
              <p
                className="font-body"
                style={{
                  fontSize: 12,
                  color: "hsl(var(--admin-text-soft))",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                <strong>{estimatedPages} pages is too many for one job.</strong>{" "}
                The limit is {MAX_PAGES_PER_JOB} pages per job. Pick fewer
                industries, content types or pages per industry.
              </p>
            </div>
          )}

          {/* Dry run */}
          <div className="flex items-center gap-3">
            <Switch checked={dryRun} onCheckedChange={setDryRun} />
            <div>
              <span
                className="font-body"
                style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}
              >
                Preview First (Dry Run)
              </span>
              <p
                className="font-body"
                style={{
                  fontSize: 11,
                  color: "hsl(var(--admin-text-ghost))",
                  margin: "2px 0 0",
                }}
              >
                Generate a sample without saving anything — so you can review
                the quality before committing.
              </p>
            </div>
          </div>

          {/* Unique angles info */}
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              backgroundColor: "hsl(var(--admin-accent) / 0.06)",
              border: "1px solid hsl(var(--admin-accent) / 0.15)",
            }}
          >
            <p
              className="font-body"
              style={{
                fontSize: 12,
                color: "hsl(var(--admin-text-soft))",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              <strong>Smart unique generation:</strong> Each run automatically
              generates unique subtopic angles that don't overlap with existing
              content. You can run generation multiple times for the same niche
              — every batch produces fresh, non-duplicate pages.
            </p>
          </div>

          {/* Estimate */}
          <p
            className="font-body"
            style={{
              fontSize: 13,
              color: "hsl(var(--admin-accent))",
              fontWeight: 500,
            }}
          >
            {dryRun
              ? "A dry run generates 1 sample page (about 1 minute of AI and research credits)."
              : `This will generate ${estimatedPages} page${estimatedPages !== 1 ? "s" : ""}: about ${usd(estimate.costUsd)} and ${estimate.minutes} minutes. You confirm before it starts.`}
          </p>

          {/* Generate button */}
          <button
            className="admin-btn-primary font-body"
            onClick={() => runGeneration()}
            disabled={generateDisabled}
            style={{
              width: "100%",
              justifyContent: "center",
              padding: "12px 20px",
              fontSize: 14,
            }}
          >
            {generating || hasRunningJob ? (
              <>
                <Loader2
                  size={16}
                  className="animate-spin"
                  aria-hidden
                  style={{ marginRight: 8 }}
                />{" "}
                {hasRunningJob ? "Generation in progress..." : "Working..."}
              </>
            ) : (
              <>
                <Zap size={16} aria-hidden style={{ marginRight: 8 }} />{" "}
                Generate Content
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dry Run Preview */}
      {dryRunResult && !generating && (
        <div className="admin-card" style={{ padding: 24, marginBottom: 20 }}>
          <h2
            className="font-body"
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "hsl(var(--admin-text))",
              marginBottom: 8,
            }}
          >
            Dry Run Preview ({dryRunResult.results?.length ?? 0} sample
            {(dryRunResult.results?.length ?? 0) !== 1 ? "s" : ""})
          </h2>
          {(dryRunResult.results ?? []).map((sample, idx: number) => (
            <div
              key={idx}
              style={{
                marginBottom:
                  idx < (dryRunResult.results?.length ?? 1) - 1 ? 20 : 0,
              }}
            >
              <p
                className="font-body"
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "hsl(var(--admin-accent))",
                  marginBottom: 8,
                }}
              >
                {sample.title}{" "}
                <span
                  style={{
                    fontSize: 11,
                    color: "hsl(var(--admin-text-ghost))",
                  }}
                >
                  ({sample.content_type} → {sample.niche})
                </span>
              </p>
              <pre
                className="font-body"
                style={{
                  fontSize: 11,
                  lineHeight: 1.5,
                  backgroundColor: "hsl(var(--admin-surface-2))",
                  border: "1px solid hsl(var(--admin-border))",
                  borderRadius: 6,
                  padding: 16,
                  overflowX: "auto",
                  maxHeight: 300,
                  overflowY: "auto",
                  color: "hsl(var(--admin-text-soft))",
                  fontFamily: "monospace",
                  whiteSpace: "pre-wrap",
                }}
              >
                {JSON.stringify(sample.content_json, null, 2)}
              </pre>
            </div>
          ))}
          <div className="flex gap-2" style={{ marginTop: 16 }}>
            <button
              className="admin-btn-primary font-body"
              onClick={() => {
                setDryRunResult(null);
                setDryRun(false);
                runGeneration(false);
              }}
              disabled={generating || hasRunningJob || overCap}
            >
              Looks Good — Generate Full Batch
            </button>
            <button
              onClick={() => {
                setDryRunResult(null);
                runGeneration(true);
              }}
              disabled={generating}
              className="font-body"
              style={{
                padding: "8px 16px",
                fontSize: 13,
                borderRadius: 6,
                border: "1px solid hsl(var(--admin-border))",
                background: "none",
                color: "hsl(var(--admin-text-soft))",
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Recent Batches */}
      <div className="admin-card" style={{ padding: 24 }}>
        <h2
          className="font-body"
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "hsl(var(--admin-text))",
            marginBottom: 16,
          }}
        >
          Recent Generation Runs
        </h2>
        {!recentBatches?.length ? (
          <p
            className="font-body"
            style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))" }}
          >
            No generation runs yet.
          </p>
        ) : (
          <div>
            {recentBatches.map((batch) => (
              <div
                key={batch.batch_id}
                style={{ borderBottom: "1px solid hsl(var(--admin-border))" }}
              >
                <button
                  className="flex items-center justify-between w-full font-body"
                  onClick={() =>
                    setExpandedBatch(
                      expandedBatch === batch.batch_id ? null : batch.batch_id,
                    )
                  }
                  style={{
                    padding: "10px 0",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "hsl(var(--admin-text))",
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  <div className="flex items-center gap-4">
                    <span
                      style={{
                        fontSize: 12,
                        color: "hsl(var(--admin-text-ghost))",
                        fontFamily: "monospace",
                      }}
                    >
                      {batch.batch_id.slice(0, 8)}…
                    </span>
                    {batch.dryRun && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "hsl(var(--admin-text-ghost))",
                        }}
                      >
                        Dry run
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 12,
                        color: "hsl(var(--admin-text-ghost))",
                      }}
                    >
                      {new Date(batch.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      style={{
                        fontSize: 12,
                        color: "hsl(var(--admin-text-soft))",
                      }}
                    >
                      {usd(batch.costUsd)}
                    </span>
                    <span
                      style={{ fontSize: 12, color: "hsl(var(--admin-sage))" }}
                    >
                      {batch.success} ✓
                    </span>
                    {batch.failed > 0 && (
                      <span
                        style={{
                          fontSize: 12,
                          color: "hsl(var(--admin-danger))",
                        }}
                      >
                        {batch.failed} ✗
                      </span>
                    )}
                    {expandedBatch === batch.batch_id ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </div>
                </button>
                {expandedBatch === batch.batch_id && (
                  <div style={{ paddingBottom: 12 }}>
                    {batch.logs.map((log) => (
                      <div
                        key={log.id}
                        className="font-body flex items-center justify-between"
                        style={{
                          padding: "4px 12px",
                          fontSize: 11,
                          color: "hsl(var(--admin-text-soft))",
                        }}
                      >
                        <span>
                          {log.error_message ||
                            log.generated_page_id?.slice(0, 8) ||
                            "—"}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 999,
                            backgroundColor:
                              log.status === "success"
                                ? "hsl(var(--admin-sage) / 0.12)"
                                : log.status === "failed"
                                  ? "hsl(var(--admin-danger) / 0.12)"
                                  : "hsl(var(--admin-text-ghost) / 0.15)",
                            color:
                              log.status === "success"
                                ? "hsl(var(--admin-sage))"
                                : log.status === "failed"
                                  ? "hsl(var(--admin-danger))"
                                  : "hsl(var(--admin-text-ghost))",
                          }}
                        >
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
        <h2
          className="font-body"
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "hsl(var(--admin-text))",
            marginBottom: 8,
          }}
        >
          OG Images
        </h2>
        <p
          className="font-body"
          style={{
            fontSize: 13,
            color: "hsl(var(--admin-text-ghost))",
            marginBottom: 16,
          }}
        >
          Generate branded Open Graph images for all published pages that don't
          have one yet.
        </p>
        <button
          className="admin-btn-primary font-body"
          disabled={generatingOg}
          onClick={async () => {
            setGeneratingOg(true);
            try {
              const { data, error } = await supabase.functions.invoke(
                "generate-og-image",
                { body: { batch: true } },
              );
              if (error) throw error;
              if (data?.error) throw new Error(data.error);
              toast({
                title: "OG images generated",
                description: `${data.processed} images created.`,
              });
            } catch (err) {
              toast({
                title: "Failed",
                description: errorMessage(err),
                variant: "destructive",
              });
            } finally {
              setGeneratingOg(false);
            }
          }}
        >
          {generatingOg ? (
            <>
              <Loader2
                size={16}
                className="animate-spin"
                style={{ marginRight: 8 }}
              />{" "}
              Generating...
            </>
          ) : (
            <>
              <ImageIcon size={16} style={{ marginRight: 8 }} /> Generate All
              Missing OG Images
            </>
          )}
        </button>
      </div>

      {/* Silo Link Building */}
      <div className="admin-card" style={{ padding: 24, marginTop: 20 }}>
        <h2
          className="font-body"
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "hsl(var(--admin-text))",
            marginBottom: 8,
          }}
        >
          Silo Links
        </h2>
        <p
          className="font-body"
          style={{
            fontSize: 13,
            color: "hsl(var(--admin-text-ghost))",
            marginBottom: 16,
          }}
        >
          Rebuild internal silo links for all published pages. Links flow UP to
          pillar pages and ACROSS to siblings within the same niche. No
          cross-silo links.
        </p>
        <button
          className="admin-btn-primary font-body"
          disabled={buildingLinks}
          onClick={async () => {
            setBuildingLinks(true);
            try {
              const { data, error } = await supabase.functions.invoke(
                "build-silo-links",
                { body: { rebuild_all: true } },
              );
              if (error) throw error;
              if (data?.error) throw new Error(data.error);
              toast({
                title: "Silo links rebuilt",
                description: `${data.links_created} links created.`,
              });
            } catch (err) {
              toast({
                title: "Failed",
                description: errorMessage(err),
                variant: "destructive",
              });
            } finally {
              setBuildingLinks(false);
            }
          }}
        >
          {buildingLinks ? (
            <>
              <Loader2
                size={16}
                className="animate-spin"
                style={{ marginRight: 8 }}
              />{" "}
              Building...
            </>
          ) : (
            <>
              <Link2 size={16} style={{ marginRight: 8 }} /> Rebuild All Silo
              Links
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default GenerationControls;
