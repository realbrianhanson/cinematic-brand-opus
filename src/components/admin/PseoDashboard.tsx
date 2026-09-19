import { toast } from "sonner";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@/lib/router-compat";
import QueryNotice from "./QueryNotice";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
const number = z.number();
const schema = z.object({
  generated_at: z.string(),
  published_resources: number,
  resource_views_all_time: number,
  cta_clicks: number,
  review_needed: number,
  top_pages: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      slug: z.string(),
      views: number.nullable(),
      content_type: z.string().nullable(),
    }),
  ),
  daily_views: z.array(z.object({ day: z.string(), views: number })),
  search: z.object({
    period_end: z.string().nullable(),
    period_start: z.string().nullable(),
    fetched_at: z.string().nullable(),
    rows: number,
    clicks: number,
    impressions: number,
  }),
  queries: z.array(
    z.object({
      page_url: z.string(),
      query: z.string(),
      clicks: number,
      impressions: number,
      ctr: number,
      position: number,
    }),
  ),
  jobs: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      total_combinations: number,
      completed_count: number,
      success_count: number,
      failed_count: number,
      skipped_count: number,
      error_message: z.string().nullable(),
      updated_at: z.string(),
    }),
  ),
});
export default function PseoDashboard() {
  const [days, setDays] = useState(30);
  const [sendingReport, setSendingReport] = useState(false);
  const breakdown = useQuery({
    queryKey: ["admin-content-breakdown"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_content_breakdown");
      if (error) throw error;
      return z
        .object({
          formats: z.array(
            z.object({
              name: z.string(),
              pages: z.number(),
              views: z.number(),
            }),
          ),
          niches: z.array(
            z.object({
              name: z.string(),
              pages: z.number(),
              views: z.number(),
              clicks: z.number(),
            }),
          ),
        })
        .parse(data);
    },
  });
  async function sendReport() {
    if (
      !window.confirm(
        "Email the performance report to the configured report address?",
      )
    )
      return;
    setSendingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-report", {
        body: { manual: true },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      if (!data?.message) throw new Error("No report result was returned.");
      toast(data.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report failed");
    } finally {
      setSendingReport(false);
    }
  }

  const report = useQuery({
    queryKey: ["admin-performance", days],
    refetchOnWindowFocus: true,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_performance_snapshot", {
        days,
      });
      if (error) throw error;
      return schema.parse(data);
    },
  });
  const data = report.data;
  const stale =
    data?.search.fetched_at &&
    Date.now() - Date.parse(data.search.fetched_at) > 8 * 86400000;
  return (
    <section className="admin-page-stack">
      <header className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Performance & automation</h1>
          <p className="text-muted-foreground mt-2">
            See what readers use, review search signals, and check recent
            generation runs.
          </p>
        </div>
        <button
          className="admin-btn-secondary"
          onClick={() => report.refetch()}
          disabled={report.isFetching}
        >
          Refresh
        </button>
      </header>
      <QueryNotice
        loading={report.isPending}
        error={report.error}
        retry={() => report.refetch()}
      />
      {data && !report.error && (
        <>
          <label className="flex items-center gap-3">
            Activity window
            <select
              className="admin-input w-auto"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {[7, 30, 90].map((n) => (
                <option key={n} value={n}>
                  Last {n} days
                </option>
              ))}
            </select>
          </label>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              [data.published_resources, "Published resources"],
              [data.resource_views_all_time, "Resource views · all time"],
              [data.cta_clicks, `Offer clicks · ${days} days`],
              [data.review_needed, "Resources flagged for review"],
            ].map(([value, label]) => (
              <div className="admin-card p-5" key={String(label)}>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-3xl font-semibold mt-3">
                  {Number(value).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
          {data.review_needed > 0 && (
            <Link
              className="admin-btn-secondary w-fit"
              to="/admin/pages?trend=needs_refresh"
            >
              Review flagged resources →
            </Link>
          )}
          <div className="admin-card p-6">
            <h2 className="text-xl font-semibold mb-2">
              Recorded resource views
            </h2>
            <p className="text-sm text-muted-foreground mb-5">
              UTC days, selected activity window. These are recorded events, not
              unique visitors.
            </p>
            {data.daily_views.length ? (
              <>
                <div className="h-64" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.daily_views}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Line
                        dataKey="views"
                        stroke="var(--brand-accent)"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <details>
                  <summary className="cursor-pointer mt-3">
                    View daily counts
                  </summary>
                  <ul>
                    {data.daily_views.map((r) => (
                      <li key={r.day}>
                        {r.day}: {r.views} views
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : (
              <p>No view events recorded in this window.</p>
            )}
          </div>
          <div className="admin-card p-6">
            <h2 className="text-xl font-semibold mb-3">
              Search Console signals
            </h2>
            {data.search.period_end ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Imported reporting period: {data.search.period_start}–
                  {data.search.period_end}. Last fetched{" "}
                  {new Date(data.search.fetched_at!).toLocaleString()}. This
                  import has its own reporting period and is not filtered by the
                  activity selector.
                </p>
                {stale && (
                  <p role="status" className="admin-notice mt-3">
                    This import is over eight days old. Check Search Console
                    integration before using it for current decisions.
                  </p>
                )}
                <p className="my-4">
                  {data.search.clicks.toLocaleString()} clicks ·{" "}
                  {data.search.impressions.toLocaleString()} impressions across{" "}
                  {data.search.rows.toLocaleString()} imported page/query rows.
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Query totals may differ from Search Console totals because
                  anonymized or unimported queries are excluded. Low-volume
                  rankings are directional; they do not prove that an edit
                  worked.
                </p>
                <div className="overflow-x-auto">
                  <table className="admin-table w-full">
                    <thead>
                      <tr>
                        <th>Query / page</th>
                        <th>Impressions</th>
                        <th>Clicks</th>
                        <th>CTR</th>
                        <th>Avg. position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.queries.map((r, i) => (
                        <tr key={`${r.page_url}:${r.query}:${i}`}>
                          <td>
                            <strong>{r.query}</strong>
                            <br />
                            <a
                              className="text-xs underline break-all"
                              href={
                                /^https?:\/\//.test(r.page_url)
                                  ? r.page_url
                                  : undefined
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              {r.page_url}
                            </a>
                          </td>
                          <td>{r.impressions}</td>
                          <td>{r.clicks}</td>
                          <td>{(r.ctr * 100).toFixed(1)}%</td>
                          <td>{r.position.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p>
                No Search Console data has been imported.{" "}
                <Link className="underline" to="/admin/settings">
                  Configure the integration
                </Link>
                .
              </p>
            )}
          </div>
          <div className="admin-card p-6">
            <h2 className="text-xl font-semibold mb-4">
              Most-viewed resources · all time
            </h2>
            {!data.top_pages.length ? (
              <p>No published resources yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.top_pages.map((p) => (
                  <li className="py-3 flex justify-between gap-4" key={p.id}>
                    <Link
                      className="underline"
                      to={`/admin/pages/${p.id}/edit`}
                    >
                      {p.title}
                    </Link>
                    <span>{p.views ?? 0} views</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="admin-card p-6">
            <h2 className="text-xl font-semibold mb-2">
              Recent generation jobs
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              The latest five recorded jobs. A quiet queue does not confirm that
              every scheduled integration is healthy.
            </p>
            {!data.jobs.length ? (
              <p>No generation jobs recorded.</p>
            ) : (
              data.jobs.map((j) => (
                <div className="border-t border-border py-4" key={j.id}>
                  <p className="font-semibold">
                    {j.status} · {j.completed_count}/{j.total_combinations}{" "}
                    processed
                  </p>
                  <p>
                    {j.success_count} created · {j.failed_count} failed ·{" "}
                    {j.skipped_count} skipped
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Updated {new Date(j.updated_at).toLocaleString()}
                  </p>
                  {["running", "pending"].includes(j.status) &&
                    Date.now() - Date.parse(j.updated_at) > 600000 && (
                      <p className="text-amber-600">
                        No update for over ten minutes. Inspect the job before
                        starting another batch.
                      </p>
                    )}
                  {j.error_message && (
                    <p role="status" className="text-red-500">
                      {j.error_message}
                    </p>
                  )}
                </div>
              ))
            )}
            <Link className="underline" to="/admin/generate">
              Open generation workspace →
            </Link>
          </div>
          <section className="admin-card p-6">
            <h2 className="text-xl font-semibold mb-4">
              Resource breakdown · all time
            </h2>
            <QueryNotice
              loading={breakdown.isPending}
              error={breakdown.error}
              retry={() => breakdown.refetch()}
            />
            {breakdown.data && !breakdown.error && (
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-semibold mb-3">By content format</h3>
                  {breakdown.data.formats.length ? (
                    breakdown.data.formats.map((r) => (
                      <p key={r.name} className="py-2">
                        {r.name}: {r.pages} pages · {r.views} views
                      </p>
                    ))
                  ) : (
                    <p>No published resources yet.</p>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold mb-3">Top audiences & niches</h3>
                  {breakdown.data.niches.map((r) => (
                    <p key={r.name} className="py-2">
                      {r.name}: {r.pages} pages · {r.views} views · {r.clicks}{" "}
                      offer clicks
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>
          <div className="flex flex-wrap gap-3">
            <button
              className="admin-btn-secondary"
              disabled={sendingReport}
              onClick={sendReport}
            >
              {sendingReport ? "Preparing report…" : "Email performance report"}
            </button>
            <Link to="/admin" className="admin-btn-secondary">
              Search submissions & content refresh
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Snapshot loaded {new Date(data.generated_at).toLocaleString()}.
          </p>
        </>
      )}
    </section>
  );
}
