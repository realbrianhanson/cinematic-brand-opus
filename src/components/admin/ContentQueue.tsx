import { z } from "zod";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { safeHref } from "@/lib/newsMarkdown";
import { errorMessage } from "@/lib/errorMessage";
import {
  pipelineOutcome,
  draftOutcome,
  confirmedPublish,
} from "@/lib/adminOutcomes";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link } from "@/lib/router-compat";
import {
  RefreshCw,
  Zap,
  ExternalLink,
  Radio,
  Trash2,
  ArrowRight,
  ShieldCheck,
  Clock,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import NewsItemEditor from "./NewsItemEditor";
import QueryNotice from "./QueryNotice";
import QueueAutomationSettings from "./QueueAutomationSettings";
import { loadContentQueue } from "./contentQueueData";

const briefSchema = z
  .object({ sources: z.array(z.object({ url: z.string() })).catch([]) })
  .catch({ sources: [] });
const factSchema = z
  .object({
    claims: z.array(z.unknown()).optional(),
    verified_count: z.number().optional(),
    unverified_count: z.number().optional(),
    contradicted_count: z.number().optional(),
    remediated: z.boolean().optional(),
  })
  .catch({});
const publishSchema = z
  .object({
    decision: z.string().optional(),
    error: z.string().optional(),
    failures: z.array(z.string()).optional(),
  })
  .catch({});

export default function ContentQueue() {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [overrideFor, setOverrideFor] = useState<{
    postId: string;
    failures: string[];
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const queue = useQuery({
    queryKey: ["admin-content-queue"],
    queryFn: loadContentQueue,
    refetchInterval: 60000,
  });
  const { refetch } = queue;
  useEffect(() => {
    const channel = supabase.channel(
      `content-queue-${Math.random().toString(36).slice(2)}`,
    );
    for (const table of [
      "content_opportunities",
      "source_items",
      "posts",
      "site_settings_private",
    ])
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          void refetch();
        },
      );
    channel.subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch]);

  async function action(
    id: string,
    run: () => Promise<{
      title: string;
      description?: string;
      failed?: boolean;
    } | void>,
  ) {
    if (busy) return;
    setBusy(id);
    try {
      const receipt = await run();
      if (receipt)
        toast({
          ...receipt,
          variant: receipt.failed ? "destructive" : "default",
        });
    } catch (error) {
      toast({
        title: "Action needs attention",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      await refetch();
      setBusy(null);
    }
  }
  async function invoke(name: string, body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }
  function updateOpportunity(id: string, retry: boolean) {
    void action(id, async () => {
      const { data, error } = await supabase
        .from("content_opportunities")
        .update(
          retry
            ? {
                status: "proposed",
                attempts: 0,
                last_error: null,
                reject_reason: null,
              }
            : { status: "rejected", reject_reason: "manual reject" },
        )
        .eq("id", id)
        .eq("status", retry ? "rejected" : "proposed")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error(
          "This opportunity changed. The queue has been refreshed; review its current status.",
        );
      return {
        title: retry ? "Opportunity returned to queue" : "Opportunity rejected",
      };
    });
  }
  function remove(id: string, table: "content_opportunities" | "source_items") {
    if (
      !window.confirm(
        `Delete this ${table === "source_items" ? "signal" : "opportunity"}? This cannot be undone.`,
      )
    )
      return;
    void action(id, async () => {
      // Do not delete an opportunity that has been claimed by an active worker.
      const query = supabase.from(table).delete().eq("id", id);
      const { data, error } = await (
        table === "content_opportunities"
          ? query.neq("status", "drafting")
          : query
      )
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error(
          "Nothing was deleted. The item may have changed or been claimed by a worker.",
        );
      return { title: "Item deleted" };
    });
  }
  function publish(postId: string, reason?: string) {
    void action(postId, async () => {
      const { data, error } = await supabase.functions.invoke(
        "manual-publish",
        {
          body: {
            post_id: postId,
            ...(reason ? { override_reason: reason } : {}),
          },
        },
      );
      let response = publishSchema.parse(data);
      if (
        error instanceof FunctionsHttpError &&
        error.context instanceof Response
      ) {
        try {
          response = publishSchema.parse(await error.context.json());
        } catch {
          /* Report the original failure. */
        }
      }
      if (response.decision === "blocked" && response.failures?.length) {
        setOverrideReason("");
        setOverrideFor({ postId, failures: response.failures });
        return;
      }
      if (error) throw error;
      const title = confirmedPublish(data);
      setOverrideFor(null);
      return { title };
    });
  }
  const snapshot = queue.data;
  const settings = snapshot?.settings;
  const disabled = !!busy || !snapshot || !!queue.error;
  const counts = snapshot?.opps.reduce<Record<string, number>>((sum, item) => {
    sum[item.status] = (sum[item.status] ?? 0) + 1;
    return sum;
  }, {});
  return (
    <div className="admin-page-stack admin-queue">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Editorial operations</p>
          <h1>Queue & automation</h1>
          <p>
            Make room for good ideas. Review the evidence before publishing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="admin-btn-ghost"
            onClick={() => void refetch()}
            disabled={queue.isFetching}
          >
            <RefreshCw
              size={16}
              className={queue.isFetching ? "animate-spin" : ""}
            />{" "}
            Refresh
          </button>
          <button
            className="admin-btn-primary"
            disabled={disabled || settings?.auto_publish_enabled !== true}
            onClick={() =>
              void action("run", async () =>
                pipelineOutcome(await invoke("daily-content-run", {})),
              )
            }
          >
            <Zap size={16} />
            {busy === "run" ? "Running…" : "Run now"}
          </button>
        </div>
      </header>
      <QueryNotice
        loading={queue.isPending}
        error={queue.error}
        retry={() => void refetch()}
      />
      {queue.error && snapshot && (
        <p className="admin-help" role="status">
          Showing the last successful snapshot from{" "}
          {new Date(snapshot.checkedAt).toLocaleTimeString()}. Actions are
          paused until current data can be loaded.
        </p>
      )}
      {snapshot && (
        <>
          <section
            className="admin-card admin-queue-automation"
            aria-label="Automation status"
          >
            <span className="admin-overview-icon">
              {settings?.auto_publish_enabled ? (
                <Zap size={22} />
              ) : (
                <Clock size={22} />
              )}
            </span>
            <div>
              <h2>
                {!settings
                  ? "Automation not configured"
                  : settings.auto_publish_enabled
                    ? "Automation enabled"
                    : "Automation is paused"}
              </h2>
              <p className="admin-help">
                {settings
                  ? `Daily cap: ${settings.auto_publish_daily_cap} · Minimum quality: ${settings.auto_publish_min_quality}/100. ${settings.auto_publish_enabled ? "Eligible drafts still pass the publishing checks." : "You can continue reviewing and publishing manually."}`
                  : "Set your publishing preferences before running the pipeline."}
              </p>
              <span className="admin-queue-live">
                <Radio size={12} />
                {live
                  ? "Live updates connected"
                  : "Checking for updates every minute"}
              </span>
            </div>
            <QueueAutomationSettings
              settings={settings ?? null}
              disabled={disabled}
              onSaved={refetch}
            />
          </section>
          <div>
            <p className="admin-help mb-3">
              Recent snapshot · up to 80 opportunities, 30 drafts, and 50
              signals. These are counts of the records shown below.
            </p>
            <div className="admin-queue-stats">
              {[
                [
                  "New signals",
                  snapshot.items.filter((item) => item.status === "new").length,
                ],
                ["Proposed", counts?.proposed ?? 0],
                ["Drafting", counts?.drafting ?? 0],
                ["Drafts to review", snapshot.posts.length],
                ["Rejected", counts?.rejected ?? 0],
              ].map(([label, value]) => (
                <div className="admin-card admin-stat" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
          <section aria-labelledby="queue-drafts">
            <div className="admin-section-header mb-4">
              <div>
                <h2 id="queue-drafts" className="text-xl font-semibold">
                  Drafts to review
                </h2>
                <p className="admin-help">
                  Scores are signals. The full publishing gate runs when you
                  publish.
                </p>
              </div>
              <Link to="/admin/posts?status=draft" className="admin-btn-ghost">
                All drafts <ArrowRight size={15} />
              </Link>
            </div>
            {snapshot.posts.length === 0 && (
              <div className="admin-card admin-queue-empty">
                <ShieldCheck size={26} />
                <h3>No pipeline drafts waiting</h3>
                <p>
                  Your manually written drafts are available in Articles. New
                  pipeline drafts will appear here as they are created.
                </p>
              </div>
            )}
            {snapshot.posts.map((post) => {
              const facts = factSchema.parse(post.fact_check);
              const checked = Array.isArray(facts.claims);
              const issues =
                (facts.unverified_count ?? 0) + (facts.contradicted_count ?? 0);
              return (
                <article className="admin-card admin-queue-item" key={post.id}>
                  <div className="admin-queue-item-main">
                    <h3>
                      <Link to={`/admin/posts/${post.id}/edit`}>
                        {post.title}
                      </Link>
                    </h3>
                    <div className="admin-queue-meta">
                      <span>Quality {post.quality_score ?? "—"}/100</span>
                      <span>Originality {post.originality_score ?? "—"}%</span>
                      <span>
                        {Array.isArray(post.source_citations)
                          ? post.source_citations.length
                          : 0}{" "}
                        sources
                      </span>
                    </div>
                    <p
                      className={`admin-queue-facts ${issues ? "has-issues" : ""}`}
                    >
                      {!checked
                        ? "Fact check pending — review the evidence."
                        : `${facts.verified_count ?? 0} verified · ${facts.unverified_count ?? 0} unverified · ${facts.contradicted_count ?? 0} contradicted`}
                    </p>
                  </div>
                  <div className="admin-queue-actions">
                    {issues > 0 && !facts.remediated && (
                      <button
                        className="admin-btn-ghost"
                        disabled={disabled}
                        onClick={() =>
                          void action(post.id, async () => {
                            const result = await invoke(
                              "remediate-post-facts",
                              { post_id: post.id },
                            );
                            if (typeof result?.changed !== "boolean")
                              throw new Error(
                                "Remediation was not confirmed. Review the draft before retrying.",
                              );
                            return {
                              title: result.changed
                                ? "Facts remediated"
                                : "No remediation needed",
                              description: result.reason,
                            };
                          })
                        }
                      >
                        Fix facts
                      </button>
                    )}
                    <Link
                      className="admin-btn-ghost"
                      to={`/admin/posts/${post.id}/edit`}
                    >
                      Review
                    </Link>
                    <button
                      className="admin-btn-primary"
                      disabled={disabled}
                      onClick={() => publish(post.id)}
                    >
                      {busy === post.id ? "Working…" : "Check & publish"}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
          <section aria-labelledby="queue-opportunities">
            <div className="admin-section-header mb-4">
              <h2 id="queue-opportunities" className="text-xl font-semibold">
                Recent opportunities
              </h2>
              <span className="admin-help">
                Latest {snapshot.opps.length} · newest first
              </span>
            </div>
            {!snapshot.opps.length && (
              <div className="admin-card admin-queue-empty">
                <p>
                  No opportunities yet. Configure your sources and publishing
                  preferences in Integrations.
                </p>
              </div>
            )}
            {snapshot.opps.map((opp) => (
              <article className="admin-card admin-queue-item" key={opp.id}>
                <div className="admin-queue-item-main">
                  <div className="admin-queue-meta">
                    <span className="admin-badge">{opp.status}</span>
                    <span>Score {opp.opportunity_score}</span>
                    <span>{opp.topic_lane.replaceAll("_", " ")}</span>
                  </div>
                  <h3>{opp.angle}</h3>
                  <p className="admin-help">
                    {opp.rationale || opp.target_keyword}
                  </p>
                  {(opp.last_error || opp.reject_reason) && (
                    <p className="admin-queue-facts has-issues">
                      {opp.last_error || opp.reject_reason}
                    </p>
                  )}
                  <div className="admin-queue-meta">
                    {briefSchema
                      .parse(opp.brief)
                      .sources.slice(0, 4)
                      .map((source, index) => (
                        <a
                          key={`${source.url}-${index}`}
                          href={safeHref(source.url) ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Source {index + 1} <ExternalLink size={11} />
                        </a>
                      ))}
                    <span>{new Date(opp.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="admin-queue-actions">
                  {opp.status === "proposed" && (
                    <>
                      <button
                        className="admin-btn-ghost"
                        disabled={disabled}
                        onClick={() =>
                          void action(opp.id, async () =>
                            draftOutcome(
                              await invoke("draft-from-opportunity", {
                                opportunity_id: opp.id,
                              }),
                            ),
                          )
                        }
                      >
                        Draft article
                      </button>
                      <button
                        className="admin-btn-ghost"
                        disabled={disabled}
                        onClick={() => updateOpportunity(opp.id, false)}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {opp.status === "rejected" && (
                    <button
                      className="admin-btn-ghost"
                      disabled={disabled}
                      onClick={() => updateOpportunity(opp.id, true)}
                    >
                      Return to queue
                    </button>
                  )}
                  {opp.status !== "drafting" && (
                    <button
                      className="admin-btn-ghost"
                      disabled={disabled}
                      onClick={() => remove(opp.id, "content_opportunities")}
                      aria-label={`Delete opportunity: ${opp.angle}`}
                      title="Delete opportunity"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </section>
          <details className="admin-card admin-section">
            <summary className="cursor-pointer font-semibold">
              Source signals{" "}
              <span className="admin-help">
                · latest {snapshot.items.length}
              </span>
            </summary>
            {!snapshot.items.length && (
              <p className="admin-help">
                No source signals have been collected yet.
              </p>
            )}
            {snapshot.items.map((item) => (
              <div className="admin-queue-signal" key={item.id}>
                <div>
                  <button
                    className="admin-queue-signal-title"
                    onClick={() => setEditingId(item.id)}
                  >
                    {item.title || item.url}
                  </button>
                  <p className="admin-help">
                    {item.topic_lane?.replaceAll("_", " ")} ·{" "}
                    {new Date(
                      item.published_at || item.fetched_at,
                    ).toLocaleDateString()}{" "}
                    · {item.status}
                  </p>
                </div>
                <div className="admin-queue-actions">
                  <a
                    className="admin-btn-ghost"
                    href={safeHref(item.url) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open source: ${item.title || item.url}`}
                  >
                    <ExternalLink size={15} />
                  </a>
                  <button
                    className="admin-btn-ghost"
                    disabled={disabled}
                    onClick={() => remove(item.id, "source_items")}
                    aria-label={`Delete signal: ${item.title || item.url}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </details>
        </>
      )}
      {editingId && (
        <NewsItemEditor
          itemId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            void refetch();
          }}
        />
      )}
      <Dialog
        open={!!overrideFor}
        onOpenChange={(open) => {
          if (!open && !busy) setOverrideFor(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle size={20} />
            Publishing checks need attention
          </DialogTitle>
          <DialogDescription>
            Fix these issues in the editor, or give a specific reason to
            override the checks. Your reason is saved with the article.
          </DialogDescription>
          <ul className="list-disc pl-5 text-sm space-y-2">
            {overrideFor?.failures.map((failure, i) => (
              <li key={i}>{failure}</li>
            ))}
          </ul>
          <label htmlFor="publish-override">Override reason</label>
          <textarea
            id="publish-override"
            className="admin-input w-full"
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            rows={3}
            minLength={10}
            maxLength={1000}
            placeholder="Explain why this article can be published (at least 10 characters)."
          />
          <div className="flex justify-end gap-2 flex-wrap">
            <button
              className="admin-btn-ghost"
              disabled={!!busy}
              onClick={() => setOverrideFor(null)}
            >
              Cancel
            </button>
            <button
              className="admin-btn-primary"
              disabled={disabled || overrideReason.trim().length < 10}
              onClick={() => {
                if (overrideFor)
                  publish(overrideFor.postId, overrideReason.trim());
              }}
            >
              Publish with recorded override
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
