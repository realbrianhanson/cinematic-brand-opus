import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/errorMessage";
import { refreshOutcome, indexingOutcome } from "@/lib/adminOutcomes";
import {
  Plus,
  RefreshCw,
  ArrowRight,
  ShoppingBag,
  Users,
  FileText,
  PackageCheck,
  Gift,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Mic,
} from "lucide-react";
import { loadDashboardOverview } from "./dashboardData";
import { invokeOfferApi, type OfferHealth } from "@/lib/offers";
import BriansNotesWidget from "./BriansNotesWidget";
import NewsletterPreviewCard from "./NewsletterPreviewCard";
import QueryNotice from "./QueryNotice";
import { ConversionOverview } from "./ConversionDashboard";

export default function Dashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const overview = useQuery({
    queryKey: ["admin-post-stats"],
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    queryFn: loadDashboardOverview,
  });
  const paymentHealth = useQuery({
    queryKey: ["admin-offer-health"],
    enabled: (overview.data?.nativePaidOffers ?? 0) > 0,
    queryFn: () => invokeOfferApi<OfferHealth>({ action: "health" }),
    staleTime: 60000,
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
          <p className="admin-eyebrow">Your business, at a glance</p>
          <h1>Make your next move.</h1>
          <p>
            Grow your audience. Publish something useful. Build your next offer.
          </p>
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
            <Plus size={16} /> New article
          </Link>
        </div>
      </header>
      <QueryNotice
        loading={overview.isPending}
        error={overview.error}
        retry={() => overview.refetch()}
      />
      {overview.error && overview.data && (
        <p className="admin-help">
          Showing the last successful counts. Refresh to confirm the latest
          activity.
        </p>
      )}
      {overview.data && (
        <>
          <div className="admin-overview-metrics">
            {[
              {
                label: "Confirmed subscribers",
                value: overview.data.subscribers,
                detail: "Your opted-in audience",
                icon: Users,
                to: "/admin/site-settings",
              },
              {
                label: "Live shop offers",
                value: overview.data.shop,
                detail: "Published and listed in the shop",
                icon: ShoppingBag,
                to: "/admin/offers",
              },
              {
                label: "Fulfilled paid orders",
                value: overview.data.paidOrders,
                detail: "All-time native · all payment modes",
                icon: PackageCheck,
                to: "/admin/offers?tab=orders",
              },
              {
                label: "Free resource claims",
                value: overview.data.freeClaims,
                detail: "All-time fulfilled · native downloads",
                icon: Gift,
                to: "/admin/offers?tab=orders",
              },
            ].map((metric) => (
              <Link
                to={metric.to}
                className="admin-card admin-overview-metric"
                key={metric.label}
              >
                <div>
                  <span>{metric.label}</span>
                  <metric.icon size={18} />
                </div>
                <strong>{metric.value.toLocaleString()}</strong>
                <p>{metric.detail}</p>
              </Link>
            ))}
          </div>
          <p className="admin-help admin-overview-footnote">
            External and affiliate purchases happen on the provider’s site and
            are not included in orders or claims.
          </p>
        </>
      )}
      <ConversionOverview />
      <div className="admin-overview-columns">
        <section className="admin-card admin-section">
          <div className="admin-section-header">
            <h2>Needs your attention</h2>
            <span className="admin-badge">Next actions</span>
          </div>
          {overview.data && (
            <div className="admin-attention-list">
              {overview.data.inquiries > 0 && (
                <Link to="/admin/inquiries" className="admin-attention-row">
                  <span className="admin-overview-icon">
                    <Mic size={18} />
                  </span>
                  <div>
                    <strong>
                      {overview.data.inquiries} new speaking{" "}
                      {overview.data.inquiries === 1 ? "inquiry" : "inquiries"}
                    </strong>
                    <p>
                      Review the event details and follow up with the organizer.
                    </p>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              )}
              {overview.data.overdue > 0 && (
                <Link
                  to="/admin/posts?status=scheduled"
                  className="admin-attention-row"
                >
                  <span className="admin-overview-icon">
                    <AlertTriangle size={18} />
                  </span>
                  <div>
                    <strong>
                      {overview.data.overdue} overdue scheduled{" "}
                      {overview.data.overdue === 1 ? "article" : "articles"}
                    </strong>
                    <p>Check the schedule before publishing again.</p>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              )}
              {overview.data.queueErrors > 0 && (
                <Link to="/admin/queue" className="admin-attention-row">
                  <span className="admin-overview-icon">
                    <AlertTriangle size={18} />
                  </span>
                  <div>
                    <strong>
                      {overview.data.queueErrors} active pipeline{" "}
                      {overview.data.queueErrors === 1 ? "issue" : "issues"}
                    </strong>
                    <p>Review failed attempts and source errors.</p>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              )}
              {overview.data.nativePaidOffers > 0 &&
                paymentHealth.data?.payments_ready === false && (
                  <Link
                    to="/admin/offers?tab=setup"
                    className="admin-attention-row"
                  >
                    <span className="admin-overview-icon">
                      <ShoppingBag size={18} />
                    </span>
                    <div>
                      <strong>Finish setup for your paid offers</strong>
                      <p>
                        {overview.data.nativePaidOffers} published native{" "}
                        {overview.data.nativePaidOffers === 1
                          ? "offer needs"
                          : "offers need"}{" "}
                        Stripe or download-email setup.
                      </p>
                    </div>
                    <ArrowRight size={16} />
                  </Link>
                )}
              {overview.data.drafts > 0 && (
                <Link
                  to="/admin/posts?status=draft"
                  className="admin-attention-row"
                >
                  <span className="admin-overview-icon">
                    <FileText size={18} />
                  </span>
                  <div>
                    <strong>
                      {overview.data.drafts}{" "}
                      {overview.data.drafts === 1 ? "draft" : "drafts"} to
                      review
                    </strong>
                    <p>Check the hook, sources, and next step for readers.</p>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              )}
              {overview.data.drafts === 0 &&
                overview.data.overdue === 0 &&
                overview.data.queueErrors === 0 && (
                  <div className="admin-attention-row">
                    <span className="admin-overview-icon">
                      <CheckCircle2 size={18} />
                    </span>
                    <div>
                      <strong>Your content queue is clear</strong>
                      <p>Create a new article or offer when you’re ready.</p>
                    </div>
                  </div>
                )}
            </div>
          )}
          {paymentHealth.error && (
            <div className="admin-notice admin-notice-error" role="alert">
              Payment readiness could not be checked.{" "}
              <Link to="/admin/offers?tab=setup">Review payment setup</Link>
            </div>
          )}
          <QueryNotice
            loading={attention.isPending}
            error={attention.error}
            retry={() => attention.refetch()}
          />
          {!!attention.data && (
            <div className="admin-notice">
              <span>
                {attention.data} published resources are flagged for review.
                Human-edited pages are protected from automatic refresh.
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
        <section className="admin-card admin-section admin-overview-launchpad">
          <p className="admin-eyebrow">Build what’s next</p>
          <h2>Turn your expertise into an offer.</h2>
          <p className="admin-help">
            Free resources, paid training, your own checkout, or a partner’s
            product. Bring it together in your shop.
          </p>
          <Link className="admin-btn-primary" to="/admin/offers/new">
            <Plus size={16} /> Create an offer
          </Link>
          <div className="admin-overview-shortcuts">
            <Link to="/admin/generate">
              <Sparkles size={17} />
              <span>Generate a draft</span>
              <ArrowRight size={14} />
            </Link>
            <Link to="/admin/inquiries">
              <Mic size={17} />
              <span>Speaking inquiries</span>
              <ArrowRight size={14} />
            </Link>
            <Link to="/admin/pseo-dashboard">
              <FileText size={17} />
              <span>Search performance</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </div>
      <div className="admin-section-header">
        <div>
          <h2 className="text-xl font-semibold">Your publishing desk</h2>
          <p className="admin-help">
            {overview.data
              ? `${overview.data.published} published · ${overview.data.drafts} drafts · ${overview.data.scheduled} scheduled`
              : "Articles, editorial notes, and your next newsletter."}
          </p>
        </div>
        <Link className="admin-btn-ghost" to="/admin/queue">
          Open queue <ArrowRight size={16} />
        </Link>
      </div>
      <div className="admin-editorial-columns">
        <NewsletterPreviewCard />
        <BriansNotesWidget />
      </div>

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
      <details className="admin-card admin-section admin-indexing-details">
        <summary className="cursor-pointer font-semibold">
          Search engine submissions
        </summary>
        <div className="admin-section-header">
          <p className="admin-help">Recent IndexNow activity</p>
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
      </details>
    </div>
  );
}
