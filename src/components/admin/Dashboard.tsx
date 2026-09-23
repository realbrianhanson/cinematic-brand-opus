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
import { Skeleton } from "@/components/ui/skeleton";
import {
  loadDashboardOverview,
  type AttentionItem,
  type DashboardOverview,
} from "./dashboardData";
import { invokeOfferApi, type OfferHealth } from "@/lib/offers";
import BriansNotesWidget from "./BriansNotesWidget";
import NewsletterPreviewCard from "./NewsletterPreviewCard";
import QueryNotice from "./QueryNotice";
import { ConversionOverview } from "./ConversionDashboard";

type Overview = DashboardOverview;

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function paidOrdersDetail(data: Overview) {
  const parts = ["All-time · Live payments only"];
  if (data.testPaidOrders > 0)
    parts.push(
      `${plural(data.testPaidOrders, "test purchase", "test purchases")} not counted`,
    );
  if (data.unknownPaidOrders > 0)
    parts.push(`${data.unknownPaidOrders.toLocaleString()} unverified`);
  return parts.join(" · ");
}

function metricCards(data: Overview) {
  return [
    {
      label: "Confirmed subscribers",
      value: data.subscribers,
      detail:
        data.pendingSubscribers > 0
          ? `${data.pendingSubscribers.toLocaleString()} awaiting confirmation`
          : "Your opted-in audience",
      icon: Users,
      to: "/admin/audience",
    },
    {
      label: "Live shop offers",
      value: data.shop,
      detail: "Published and listed in the shop",
      icon: ShoppingBag,
      to: "/admin/offers",
    },
    {
      label: "Paid orders",
      value: data.paidOrders,
      detail: paidOrdersDetail(data),
      icon: PackageCheck,
      to: "/admin/offers?tab=orders",
    },
    {
      label: "Free resource claims",
      value: data.freeClaims,
      detail: "All-time fulfilled · native downloads",
      icon: Gift,
      to: "/admin/offers?tab=orders",
    },
  ];
}

function MetricSkeletons() {
  return (
    <>
      {[0, 1, 2, 3].map((key) => (
        <div
          className="admin-card admin-overview-metric"
          aria-hidden="true"
          key={key}
        >
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-8 w-16" />
          <Skeleton className="mt-3 h-3 w-40" />
        </div>
      ))}
    </>
  );
}

const severityLabel: Record<AttentionItem["severity"], string> = {
  high: "Urgent",
  medium: "Needs a look",
  low: "When you can",
};
const attentionIcons: Partial<Record<string, typeof AlertTriangle>> = {
  speaking_inquiries: Mic,
  drafts: FileText,
  pending_subscribers: Users,
  access_email_failed: Gift,
  access_email_waiting: Gift,
};

function AttentionRow({
  to,
  icon: Icon,
  title,
  detail,
  severity,
}: {
  to: string;
  icon: typeof AlertTriangle;
  title: string;
  detail: string | null;
  severity: AttentionItem["severity"];
}) {
  return (
    <li>
      <Link to={to} className="admin-attention-row" data-severity={severity}>
        <span className="admin-overview-icon">
          <Icon size={18} aria-hidden="true" />
        </span>
        <div>
          <strong>{title}</strong>
          {detail && <p>{detail}</p>}
        </div>
        {severity !== "low" && (
          <span className="admin-badge">{severityLabel[severity]}</span>
        )}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </li>
  );
}

function AttentionList({
  data,
  paymentsBlocked,
}: {
  data: Overview;
  paymentsBlocked: boolean;
}) {
  if (!data.attention.length && !paymentsBlocked)
    return (
      <div className="admin-attention-row">
        <span className="admin-overview-icon">
          <CheckCircle2 size={18} aria-hidden="true" />
        </span>
        <div>
          <strong>Nothing needs your attention right now</strong>
          <p>Create a new article or offer when you’re ready.</p>
        </div>
      </div>
    );
  const urgent = data.attention.filter((item) => item.severity === "high");
  const rest = data.attention.filter((item) => item.severity !== "high");
  const row = (item: AttentionItem) => (
    <AttentionRow
      key={item.key}
      to={item.link}
      icon={attentionIcons[item.key] ?? AlertTriangle}
      title={item.message}
      detail={item.detail}
      severity={item.severity}
    />
  );
  return (
    <ul
      className="admin-attention-list [&>li+li]:border-t [&>li+li]:border-[hsl(var(--admin-border))]"
      aria-label="Needs your attention"
    >
      {urgent.map(row)}
      {paymentsBlocked && (
        <AttentionRow
          to="/admin/offers?tab=setup"
          icon={ShoppingBag}
          title="Finish setup for your paid offers"
          detail={`${plural(data.nativePaidOffers, "published native offer needs", "published native offers need")} Stripe or download-email setup.`}
          severity="high"
        />
      )}
      {rest.map(row)}
    </ul>
  );
}

function AttentionSkeleton() {
  return (
    <div aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <div className="admin-attention-row" key={key}>
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-4 w-56" />
            <Skeleton className="mt-2 h-3 w-72 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [indexingOpen, setIndexingOpen] = useState(false);
  // One admin RPC for every card, the attention list and recent posts.
  const overview = useQuery({
    queryKey: ["admin-post-stats"],
    refetchInterval: 5 * 60_000,
    queryFn: loadDashboardOverview,
  });
  const paymentHealth = useQuery({
    queryKey: ["admin-offer-health"],
    enabled: (overview.data?.nativePaidOffers ?? 0) > 0,
    queryFn: () => invokeOfferApi<OfferHealth>({ action: "health" }),
    staleTime: 60000,
  });
  const indexing = useQuery({
    queryKey: ["admin-indexing-stats"],
    enabled: indexingOpen,
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
          "admin-post-stats",
          "admin-indexing-stats",
          "admin-generated-pages",
        ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
      );
    }
  }
  const data = overview.data;
  const paymentsBlocked =
    !!data &&
    data.nativePaidOffers > 0 &&
    paymentHealth.data?.payments_ready === false;
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
            disabled={overview.isFetching}
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
        error={data ? null : overview.error}
        retry={() => overview.refetch()}
      />
      {overview.error && data && (
        <p role="status" className="admin-help">
          Showing the last successful counts. Refresh to confirm the latest
          activity.
        </p>
      )}
      {(data || overview.isPending) && (
        <>
          <div
            className="admin-overview-metrics"
            data-testid="overview-metrics"
            aria-busy={overview.isPending}
          >
            {overview.isPending && (
              <span role="status" className="sr-only">
                Loading your numbers…
              </span>
            )}
            {data ? (
              metricCards(data).map((metric) => (
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
              ))
            ) : (
              <MetricSkeletons />
            )}
          </div>
          <p className="admin-help admin-overview-footnote">
            External and affiliate purchases happen on the provider’s site and
            are not included in orders or claims. Stripe test purchases are
            never counted as paid orders.
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
          {overview.isPending && <AttentionSkeleton />}
          {data && (
            <AttentionList data={data} paymentsBlocked={paymentsBlocked} />
          )}
          {paymentHealth.error && (
            <div className="admin-notice admin-notice-error" role="alert">
              Payment readiness could not be checked.{" "}
              <Link to="/admin/offers?tab=setup">Review payment setup</Link>
            </div>
          )}
          {!!data?.stalePages && (
            <div className="admin-notice">
              <span>
                {data.stalePages} published resources are flagged for review.
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
            {data
              ? `${data.published} published · ${data.drafts} drafts · ${data.scheduled} scheduled`
              : "Articles, editorial notes, and your next newsletter."}
          </p>
        </div>
        <Link className="admin-btn-ghost" to="/admin/queue">
          Open queue <ArrowRight size={16} />
        </Link>
      </div>
      <div className="admin-editorial-columns">
        <div id="newsletter" className="scroll-mt-24">
          <NewsletterPreviewCard />
        </div>
        <BriansNotesWidget />
      </div>

      <section className="admin-card admin-section">
        <div className="admin-section-header">
          <h2>Recently updated</h2>
          <Link to="/admin/posts">View all posts →</Link>
        </div>
        {overview.isPending && <AttentionSkeleton />}
        {data?.recentPosts.length === 0 && (
          <p>No posts yet. Start with a draft.</p>
        )}
        {data?.recentPosts.map((post) => (
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
      <details
        className="admin-card admin-section admin-indexing-details"
        onToggle={(event) => setIndexingOpen(event.currentTarget.open)}
      >
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
        {indexingOpen && (
          <QueryNotice
            loading={indexing.isPending}
            error={indexing.error}
            retry={() => indexing.refetch()}
          />
        )}
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
