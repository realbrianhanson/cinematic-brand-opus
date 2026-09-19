import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/errorMessage";
import { refreshOutcome, indexingOutcome } from "@/lib/adminOutcomes";
import { Plus, RefreshCw, ArrowRight } from "lucide-react";
import BriansNotesWidget from "./BriansNotesWidget";
import NewsletterPreviewCard from "./NewsletterPreviewCard";
import QueryNotice from "./QueryNotice";

export default function Dashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const overview = useQuery({
    queryKey: ["admin-post-stats"],
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const results = await Promise.all([
        supabase.from("posts").select("*", { count: "exact", head: true }),
        ...["published", "draft", "scheduled"].map((status) =>
          supabase
            .from("posts")
            .select("*", { count: "exact", head: true })
            .eq("status", status as "published" | "draft" | "scheduled"),
        ),
        ...["confirmed", "pending"].map((status) =>
          supabase
            .from("newsletter_subscribers")
            .select("*", { count: "exact", head: true })
            .eq("status", status),
        ),
      ]);
      for (const result of results) if (result.error) throw result.error;
      return results.map((result) => result.count ?? 0);
    },
  });
  const recent = useQuery({
    queryKey: ["admin-recent-posts"],
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id,title,status,updated_at")
        .order("updated_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });
  const attention = useQuery({
    queryKey: ["admin-stale-pages-count"],
    refetchInterval: 60000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("generated_pages")
        .select("*", { count: "exact", head: true })
        .eq("performance_trend", "needs_refresh")
        .eq("status", "published");
      if (error) throw error;
      return count ?? 0;
    },
  });
  const indexing = useQuery({
    queryKey: ["admin-indexing-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("indexing_log")
        .select("id,page_url,submitted_at,status")
        .order("submitted_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
  async function run(action: "refresh" | "index") {
    if (busy) return;
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke(
        action === "refresh" ? "refresh-stale-content" : "submit-indexnow",
        {
          body:
            action === "refresh"
              ? { all_stale: true, max_pages: 3 }
              : { all_unsubmitted: true },
        },
      );
      if (error) throw error;
      if (!data || data.error)
        throw new Error(data?.error || "No result returned.");
      const result =
        action === "refresh" ? refreshOutcome(data) : indexingOutcome(data);
      toast({ ...result, variant: result.failed ? "destructive" : "default" });
    } catch (error) {
      toast({
        title: "Action needs attention",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
      await Promise.all(
        [
          "admin-stale-pages-count",
          "admin-indexing-stats",
          "admin-generated-pages",
        ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
      );
    }
  }
  return (
    <div className="admin-page-stack">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Your publishing workspace</p>
          <h1>Dashboard</h1>
          <p>Review your content, audience, and next steps.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="admin-btn-ghost"
            aria-label="Refresh dashboard"
            onClick={() =>
              qc.invalidateQueries({
                predicate: (q) => String(q.queryKey[0]).startsWith("admin-"),
              })
            }
          >
            <RefreshCw size={16} /> Refresh
          </button>
          <Link className="admin-btn-primary" to="/admin/posts/new">
            <Plus size={16} /> New Post
          </Link>
        </div>
      </header>
      <QueryNotice
        loading={overview.isPending}
        error={overview.error}
        retry={() => overview.refetch()}
      />
      {!overview.error && overview.data && (
        <div className="admin-stats-grid">
          {[
            "All posts",
            "Published",
            "Drafts",
            "Scheduled",
            "Confirmed subscribers",
            "Pending subscribers",
          ].map((label, i) => (
            <div className="admin-card admin-stat" key={label}>
              <span>{label}</span>
              <strong>{overview.data[i]}</strong>
            </div>
          ))}
        </div>
      )}
      <section className="admin-card admin-section">
        <h2>Next steps</h2>
        <div className="admin-action-grid">
          <Link to="/admin/posts?status=draft" className="admin-action-card">
            <strong>Review drafts</strong>
            <span>Check sources and preview before publishing.</span>
            <ArrowRight size={16} />
          </Link>
          <Link to="/admin/pseo-dashboard" className="admin-action-card">
            <strong>Search performance</strong>
            <span>See queries, clicks, and articles to improve.</span>
            <ArrowRight size={16} />
          </Link>
          <Link to="/admin/queue" className="admin-action-card">
            <strong>Publishing queue</strong>
            <span>Review scheduled work and automation settings.</span>
            <ArrowRight size={16} />
          </Link>
        </div>
        <QueryNotice
          loading={attention.isPending}
          error={attention.error}
          retry={() => attention.refetch()}
        />
        {!!attention.data && (
          <div className="admin-notice">
            <span>
              {attention.data} published resources flagged for review.
              Human-edited pages are excluded from automatic refresh.
            </span>
            <div className="flex flex-wrap gap-2">
              <Link
                className="admin-btn-ghost"
                to="/admin/pages?trend=needs_refresh"
              >
                Review resources
              </Link>
              <button
                className="admin-btn-ghost"
                disabled={!!busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Refresh up to 3 eligible resources using paid AI generation? Published content may change. Human-edited pages are preserved.",
                    )
                  )
                    void run("refresh");
                }}
              >
                {busy === "refresh" ? "Refreshing…" : "Refresh up to 3"}
              </button>
            </div>
          </div>
        )}
      </section>
      <NewsletterPreviewCard />
      <section className="admin-card admin-section">
        <div className="admin-section-header">
          <h2>Recently updated</h2>
          <Link to="/admin/posts">View all posts →</Link>
        </div>
        <QueryNotice
          loading={recent.isPending}
          error={recent.error}
          retry={() => recent.refetch()}
        />
        {!recent.error && recent.data?.length === 0 && (
          <p>No posts yet. Start with a draft.</p>
        )}
        {!recent.error &&
          recent.data?.map((post) => (
            <Link
              key={post.id}
              to={`/admin/posts/${post.id}/edit`}
              className="admin-recent-row"
            >
              <div>
                <strong>{post.title}</strong>
                <span>
                  Updated {new Date(post.updated_at).toLocaleDateString()}
                </span>
              </div>
              <span className="admin-badge">{post.status}</span>
              <ArrowRight size={16} />
            </Link>
          ))}
      </section>
      <BriansNotesWidget />
      <section className="admin-card admin-section">
        <div className="admin-section-header">
          <h2>Search engine submissions</h2>
          <button
            className="admin-btn-ghost"
            disabled={!!busy}
            onClick={() => run("index")}
          >
            {busy === "index" ? "Submitting…" : "Submit published URLs"}
          </button>
        </div>
        <p className="admin-help">
          IndexNow receipt records for participating search engines. Submission
          does not mean a page is indexed. Google indexing must be checked in
          Search Console.
        </p>
        <QueryNotice
          loading={indexing.isPending}
          error={indexing.error}
          retry={() => indexing.refetch()}
        />
        {!indexing.error && indexing.data?.length === 0 && (
          <p>No submission history yet.</p>
        )}
        {!indexing.error &&
          indexing.data?.map((log) => (
            <div className="admin-recent-row" key={log.id}>
              <a
                href={log.page_url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 break-all"
              >
                {log.page_url}
              </a>
              <span className="admin-badge">
                {{
                  indexnow_submitted: "Received",
                  indexnow_pending: "Key validation pending",
                  error: "Failed — retry available",
                }[log.status ?? ""] ?? "Legacy record · unverified"}
              </span>
            </div>
          ))}
      </section>
    </div>
  );
}
