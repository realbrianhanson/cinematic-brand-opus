import type { Json } from "@/integrations/supabase/types";
import { CheckCircle2, Loader2, PauseCircle, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  canResumeJob,
  jobPhase,
} from "../../../supabase/functions/_shared/generationLimits";

export interface GenerationJob {
  id: string;
  batch_id: string;
  status: string;
  total_combinations: number;
  completed_count: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  result_summary: Json;
  error_message: string | null;
  work_queue?: Json | null;
  created_at: string;
  updated_at: string;
}

const hasQueue = (job: GenerationJob) =>
  Array.isArray(job.work_queue) && job.work_queue.length > 0;

/** Resume is offered for stalled (or cancelled) jobs with queued work left. */
function jobCanResume(job: GenerationJob, nowMs: number): boolean {
  const phase = jobPhase(job, nowMs);
  return canResumeJob({
    ...job,
    status: phase === "stalled" ? "stalled" : job.status,
    has_work_queue: hasQueue(job),
  });
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function JobCounts({ job }: { job: GenerationJob }) {
  return (
    <div className="flex gap-4 font-body" style={{ marginTop: 6 }}>
      <span style={{ fontSize: 11, color: "hsl(var(--admin-sage))" }}>
        ✓ {job.success_count} created
      </span>
      {job.failed_count > 0 && (
        <span style={{ fontSize: 11, color: "hsl(var(--admin-danger))" }}>
          ✗ {job.failed_count} failed
        </span>
      )}
      {job.skipped_count > 0 && (
        <span style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>
          ⊘ {job.skipped_count} skipped
        </span>
      )}
    </div>
  );
}

function OpenJob({
  job,
  nowMs,
  busy,
  onCancel,
  onResume,
}: {
  job: GenerationJob;
  nowMs: number;
  busy: boolean;
  onCancel: (job: GenerationJob) => void;
  onResume: (job: GenerationJob) => void;
}) {
  const stalled = jobPhase(job, nowMs) === "stalled";
  const pct =
    job.total_combinations > 0
      ? Math.round((job.completed_count / job.total_combinations) * 100)
      : 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        className="flex items-center justify-between font-body flex-wrap gap-2"
        style={{ marginBottom: 8 }}
      >
        <div className="flex items-center gap-2">
          {stalled ? (
            <PauseCircle
              size={14}
              aria-hidden
              style={{ color: "hsl(var(--admin-danger))" }}
            />
          ) : (
            <Loader2
              size={14}
              aria-hidden
              className="animate-spin"
              style={{ color: "hsl(var(--admin-accent))" }}
            />
          )}
          <span style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>
            {stalled
              ? `Stalled — no progress since ${timeLabel(job.updated_at)} (${job.completed_count} of ${job.total_combinations} pages)`
              : job.status === "pending"
                ? "Starting..."
                : `${job.completed_count} of ${job.total_combinations} pages`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {stalled && jobCanResume(job, nowMs) && (
            <button
              className="admin-btn-ghost"
              style={{ fontSize: 12, padding: "4px 10px" }}
              disabled={busy}
              onClick={() => onResume(job)}
            >
              Resume
            </button>
          )}
          <button
            className="admin-btn-ghost"
            style={{
              fontSize: 12,
              padding: "4px 10px",
              color: "hsl(var(--admin-danger))",
            }}
            disabled={busy}
            onClick={() => onCancel(job)}
          >
            Cancel job
          </button>
        </div>
      </div>
      <Progress value={pct} className="h-2" aria-label="Generation progress" />
      <JobCounts job={job} />
      {stalled && job.error_message && (
        <p
          className="font-body"
          style={{
            fontSize: 11,
            marginTop: 4,
            color: "hsl(var(--admin-text-ghost))",
          }}
        >
          {job.error_message}
        </p>
      )}
    </div>
  );
}

function FinishedJob({ job }: { job: GenerationJob }) {
  const ok = job.status === "completed";
  const summary = ok
    ? `Done — ${job.success_count} pages created${job.failed_count > 0 ? `, ${job.failed_count} failed` : ""}${job.skipped_count > 0 ? `, ${job.skipped_count} skipped` : ""}`
    : job.status === "cancelled"
      ? `Cancelled after ${job.completed_count} of ${job.total_combinations} pages`
      : `Failed — ${job.error_message || "An error occurred"}`;
  return (
    <div
      style={{
        marginBottom: 12,
        padding: 12,
        borderRadius: 6,
        backgroundColor: ok
          ? "hsl(var(--admin-sage) / 0.08)"
          : "hsl(var(--admin-danger) / 0.08)",
        border: `1px solid ${ok ? "hsl(var(--admin-sage) / 0.2)" : "hsl(var(--admin-danger) / 0.2)"}`,
      }}
    >
      <div className="flex items-center gap-2 font-body">
        {ok ? (
          <CheckCircle2
            size={16}
            aria-hidden
            style={{ color: "hsl(var(--admin-sage))" }}
          />
        ) : (
          <XCircle
            size={16}
            aria-hidden
            style={{ color: "hsl(var(--admin-danger))" }}
          />
        )}
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "hsl(var(--admin-text))",
          }}
        >
          {summary}
        </span>
      </div>
      {job.success_count > 0 && (
        <a
          href="/admin/pages"
          className="font-body"
          style={{
            fontSize: 12,
            color: "hsl(var(--admin-accent))",
            textDecoration: "underline",
            marginTop: 6,
            display: "inline-block",
          }}
        >
          View generated pages →
        </a>
      )}
    </div>
  );
}

/** Active, stalled and just-finished generation jobs with Cancel/Resume. */
export default function GenerationJobsPanel({
  openJobs,
  finishedJobs,
  nowMs,
  busyJobId,
  onCancel,
  onResume,
}: {
  openJobs: GenerationJob[];
  finishedJobs: GenerationJob[];
  nowMs: number;
  busyJobId: string | null;
  onCancel: (job: GenerationJob) => void;
  onResume: (job: GenerationJob) => void;
}) {
  if (!openJobs.length && !finishedJobs.length) return null;
  const anyActive = openJobs.some((j) => jobPhase(j, nowMs) === "active");
  return (
    <div className="admin-card" style={{ padding: 24, marginBottom: 20 }}>
      <h2
        className="font-body"
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "hsl(var(--admin-text))",
          marginBottom: 16,
        }}
      >
        {anyActive
          ? "Active Jobs"
          : openJobs.length
            ? "Stopped Jobs"
            : "Just Finished"}
      </h2>
      {openJobs.map((job) => (
        <OpenJob
          key={job.id}
          job={job}
          nowMs={nowMs}
          busy={busyJobId === job.id}
          onCancel={onCancel}
          onResume={onResume}
        />
      ))}
      {finishedJobs.map((job) => (
        <FinishedJob key={job.id} job={job} />
      ))}
    </div>
  );
}
