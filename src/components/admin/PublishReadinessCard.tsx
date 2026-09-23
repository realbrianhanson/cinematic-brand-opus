import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/errorMessage";
import {
  checkPublishReadiness,
  heldReasonSentences,
  invokeAdminFunction,
  type GateReason,
} from "./manualPublishClient";

type FixAction = "fix_facts" | "fact_check" | "edit";

/** What Brian can do about each gate failure, keyed by the gate's code. */
const FIX: Record<string, { action?: FixAction; hint: string }> = {
  quality_missing: {
    action: "fact_check",
    hint: "Run the fact check. It also scores quality",
  },
  quality_low: {
    action: "edit",
    hint: "Strengthen the article, save, then run the fact check again to re-score it",
  },
  lint_flags: {
    action: "edit",
    hint: "Rewrite the flagged phrases, save, then run the fact check again",
  },
  fact_check_missing: { action: "fact_check", hint: "Run the fact check" },
  fact_check_too_few_claims: {
    action: "fact_check",
    hint: "Add specific, checkable facts with sources, save, then run the fact check",
  },
  fact_check_incomplete: {
    action: "fact_check",
    hint: "Run the fact check again",
  },
  fact_check_failed: {
    action: "fix_facts",
    hint: "Use Fix facts, or correct the claims yourself",
  },
  contradicted_claims: {
    action: "fix_facts",
    hint: "Use Fix facts to rewrite the flagged claims, or correct them yourself",
  },
  too_few_verified: {
    action: "fix_facts",
    hint: "Use Fix facts, or add sources for the main claims",
  },
  too_many_unverified: {
    action: "fix_facts",
    hint: "Use Fix facts, or add sources for the claims it couldn't confirm",
  },
  gate_error: { hint: "Try Re-check in a moment" },
};

const ACTION_LABEL: Record<FixAction, string> = {
  fix_facts: "Fix facts",
  fact_check: "Run fact check",
  edit: "Improve quality",
};

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export interface PublishReadinessCardProps {
  postId: string | null;
  /** The article's saved status. */
  status: string;
  /** Saved version; a new version re-runs the check. */
  updatedAt: string | null;
  heldReason: string | null;
  heldAt: string | null;
  contradictedCount: number;
  /** Unsaved edits in the editor. Server-side fixes wait until they're saved. */
  dirty: boolean;
  /** Called after a fix rewrote the saved article, so the editor reloads it. */
  onServerChange: () => void | Promise<void>;
  onEditArticle?: () => void;
}

export default function PublishReadinessCard(props: PublishReadinessCardProps) {
  const { postId, status } = props;
  if (!postId)
    return (
      <Card>
        <p className="admin-help">
          Save the article to check whether it's ready to publish
        </p>
      </Card>
    );
  if (status === "published")
    return <LiveArticleStatus contradictedCount={props.contradictedCount} />;
  return <DraftReadiness {...props} postId={postId} />;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="admin-card"
      style={{ padding: 20 }}
      aria-labelledby="publish-readiness-title"
    >
      <h2 id="publish-readiness-title" className="admin-label">
        Publish readiness
      </h2>
      {children}
    </section>
  );
}

function LiveArticleStatus({
  contradictedCount,
}: {
  contradictedCount: number;
}) {
  return (
    <Card>
      {contradictedCount > 0 ? (
        <div role="status">
          <p className="flex items-center gap-2 font-semibold text-red-400">
            <AlertTriangle size={16} aria-hidden="true" />
            Needs fact review
          </p>
          <p className="admin-help">
            This article is live with {plural(contradictedCount, "claim")} the
            fact-checker marked as contradicted. Correct them and Save, or set
            Status to Draft and Save to take it offline while you fix it
          </p>
        </div>
      ) : (
        <p className="flex items-center gap-2" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          This article is live
        </p>
      )}
    </Card>
  );
}

function HeldNotice({
  heldReason,
  heldAt,
}: {
  heldReason: string | null;
  heldAt: string | null;
}) {
  const sentences = heldReasonSentences(heldReason);
  if (!sentences.length) return null;
  return (
    <div className="admin-notice" style={{ display: "block", marginTop: 12 }}>
      <p className="font-semibold">
        Held by the publishing pipeline
        {heldAt ? ` on ${new Date(heldAt).toLocaleString()}` : ""}
      </p>
      <ul className="list-disc pl-5 text-sm">
        {sentences.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

function DraftReadiness({
  postId,
  updatedAt,
  heldReason,
  heldAt,
  dirty,
  onServerChange,
  onEditArticle,
}: PublishReadinessCardProps & { postId: string }) {
  const { toast } = useToast();
  const check = useQuery({
    queryKey: ["publish-readiness", postId, updatedAt],
    queryFn: () => checkPublishReadiness(postId),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
  const fix = useMutation({
    mutationFn: async (action: "fix_facts" | "fact_check") => {
      const name =
        action === "fix_facts" ? "remediate-post-facts" : "fact-check";
      const { status, body } = await invokeAdminFunction(name, {
        post_id: postId,
      });
      const reason =
        typeof body.reason === "string" && body.reason ? body.reason : "";
      if (status !== 200 || body.ok !== true)
        throw new Error(
          (typeof body.error === "string" && body.error) ||
            reason ||
            "The request was not confirmed. Re-check before retrying",
        );
      return { action, body, reason };
    },
    onSuccess: async ({ action, body, reason }) => {
      if (action === "fix_facts") {
        toast({
          title: body.changed ? "Facts fixed" : "No fact changes needed",
          description: body.changed
            ? "The flagged claims were rewritten and checked again. Review the article before publishing"
            : reason || undefined,
        });
      } else if (typeof body.skipped === "string") {
        toast({
          title: "The fact check didn't run",
          description: body.skipped,
          variant: "destructive",
        });
        return;
      } else {
        toast({ title: "Fact check finished" });
      }
      await onServerChange();
    },
    onError: (error) =>
      toast({
        title: "That didn't work",
        description: errorMessage(error),
        variant: "destructive",
      }),
  });
  const reasons: GateReason[] = check.data?.reasons ?? [];
  const actions = [
    ...new Set(
      reasons.flatMap((r) =>
        FIX[r.code]?.action ? [FIX[r.code].action!] : [],
      ),
    ),
  ];
  const busy = fix.isPending || check.isFetching;
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <p className="admin-help" style={{ margin: 0 }}>
          Checks the last saved version
        </p>
        <button
          type="button"
          className="admin-btn-ghost"
          onClick={() => void check.refetch()}
          disabled={busy}
        >
          <RefreshCw
            size={14}
            aria-hidden="true"
            className={check.isFetching ? "animate-spin" : ""}
          />
          Re-check
        </button>
      </div>
      {dirty && (
        <p className="admin-help" role="status">
          You have unsaved changes. Save first, then Re-check
        </p>
      )}
      {check.isPending && (
        <p className="flex items-center gap-2" role="status">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          Checking whether this article can go live…
        </p>
      )}
      {check.error && (
        <p role="alert" className="text-red-400">
          Couldn't run the publishing check: {errorMessage(check.error)}
        </p>
      )}
      {check.data?.ready && (
        <p
          className="flex items-center gap-2 font-semibold text-emerald-400"
          role="status"
        >
          <CheckCircle2 size={16} aria-hidden="true" />
          Ready to publish
        </p>
      )}
      {check.data && !check.data.ready && (
        <div role="status">
          <p className="flex items-center gap-2 font-semibold text-amber-400">
            <AlertTriangle size={16} aria-hidden="true" />
            Why this isn't live yet
          </p>
          <ul className="text-sm space-y-2" style={{ marginTop: 8 }}>
            {reasons.map((r, i) => (
              <li key={i}>
                <span className="block">{r.message}</span>
                {FIX[r.code] && (
                  <span className="admin-help block">{FIX[r.code].hint}</span>
                )}
              </li>
            ))}
          </ul>
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              {actions.map((action) =>
                action === "edit" ? (
                  <button
                    key={action}
                    type="button"
                    className="admin-btn-ghost"
                    onClick={onEditArticle}
                  >
                    {ACTION_LABEL[action]}
                  </button>
                ) : (
                  <button
                    key={action}
                    type="button"
                    className="admin-btn-ghost"
                    disabled={dirty || busy}
                    onClick={() => fix.mutate(action)}
                  >
                    {fix.isPending && fix.variables === action
                      ? "Working…"
                      : ACTION_LABEL[action]}
                  </button>
                ),
              )}
            </div>
          )}
          {actions.some((a) => a !== "edit") && (
            <p className="admin-help">
              Fix facts and the fact check change the saved article and use AI
              credits
            </p>
          )}
        </div>
      )}
      <HeldNotice heldReason={heldReason} heldAt={heldAt} />
    </Card>
  );
}
