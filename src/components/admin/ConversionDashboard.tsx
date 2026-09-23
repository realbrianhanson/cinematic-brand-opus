import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChartNoAxesCombined, RefreshCw } from "lucide-react";
import { Link as RouterLink } from "@tanstack/react-router";
import { Link } from "@/lib/router-compat";
import { Skeleton } from "@/components/ui/skeleton";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { isBrianOwner } from "@/lib/informationPages";
import {
  campaignLabel,
  conversionDate,
  conversionLabel,
  conversionMoney,
  conversionQueryOptions,
  conversionRate,
  type ConversionDays,
  type ConversionReport,
} from "@/lib/conversions";
import QueryNotice from "./QueryNotice";

const number = (value: number) => value.toLocaleString("en-US");

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <div className="admin-card admin-conversion-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function Table({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      className="admin-conversion-table-wrap"
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table className="admin-conversion-table">
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="admin-conversion-empty">{children}</p>;
}

function DailyTrend({ rows }: { rows: ConversionReport["daily"] }) {
  const max = Math.max(1, ...rows.map((row) => row.sessions));
  return (
    <section className="admin-card admin-section admin-conversion-section">
      <div>
        <h2>Daily measured visits</h2>
        <p className="admin-help">
          Sessions grouped by the UTC day they began. Outcomes belong to those
          same sessions.
        </p>
      </div>
      {rows.some((row) => row.sessions > 0) ? (
        <>
          <div className="admin-conversion-chart" aria-hidden="true">
            <div className="admin-conversion-chart-scale">
              <span>{number(max)}</span>
              <span>0</span>
            </div>
            <div className="admin-conversion-bars">
              {rows.map((row) => (
                <div
                  key={row.date}
                  className="admin-conversion-bar-column"
                  title={`${conversionDate(row.date)}: ${row.sessions} sessions; ${row.free_claim_sessions} with a free claim; ${row.paid_order_sessions} with a live paid order`}
                >
                  <div style={{ height: `${(row.sessions / max) * 100}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="admin-conversion-chart-dates" aria-hidden="true">
            <span>{conversionDate(rows[0].date)}</span>
            <span>{conversionDate(rows[rows.length - 1].date)}</span>
          </div>
          <details className="admin-conversion-details">
            <summary>View daily counts</summary>
            <Table label="Daily measured sessions and confirmed outcomes">
              <thead>
                <tr>
                  <th scope="col">UTC day</th>
                  <th scope="col">Sessions</th>
                  <th scope="col">Outbound</th>
                  <th scope="col">Free claim</th>
                  <th scope="col">Live paid order</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.date}>
                    <th scope="row">{conversionDate(row.date)}</th>
                    <td>{number(row.sessions)}</td>
                    <td>{number(row.outbound_sessions)}</td>
                    <td>{number(row.free_claim_sessions)}</td>
                    <td>{number(row.paid_order_sessions)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </details>
        </>
      ) : (
        <Empty>
          Your daily trend will appear when visitors choose to allow
          measurement.
        </Empty>
      )}
    </section>
  );
}

export function ConversionOverview() {
  const report = useQuery(conversionQueryOptions(30));
  return (
    <section
      className="admin-card admin-section admin-conversion-overview"
      aria-labelledby="conversion-overview-title"
    >
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Last 30 days · UTC</p>
          <h2 id="conversion-overview-title">From visits to next steps</h2>
        </div>
        <ChartNoAxesCombined size={22} aria-hidden="true" />
      </div>
      <QueryNotice
        error={report.data ? null : report.error}
        retry={() => report.refetch()}
      />
      {report.isPending && (
        <div
          className="admin-conversion-overview-counts"
          data-testid="conversion-overview-counts"
          aria-busy="true"
        >
          <span role="status" className="sr-only">
            Loading conversion numbers…
          </span>
          {[0, 1, 2].map((key) => (
            <div key={key} aria-hidden="true">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="mt-2 h-3 w-36" />
            </div>
          ))}
        </div>
      )}
      {report.data && (
        <>
          {report.error && (
            <p className="admin-help">
              Showing the last successful report. Refresh to confirm current
              activity.
            </p>
          )}
          <div
            className="admin-conversion-overview-counts"
            data-testid="conversion-overview-counts"
            aria-busy="false"
          >
            <p>
              <strong>{number(report.data.summary.measured_sessions)}</strong>
              <span>Measured sessions</span>
            </p>
            <p>
              <strong>{number(report.data.summary.outbound_sessions)}</strong>
              <span>Sessions with outbound clicks</span>
            </p>
            <p>
              <strong>
                {number(report.data.summary.attributed_free_claim_sessions)}
              </strong>
              <span>Sessions with a confirmed free claim</span>
            </p>
          </div>
          <p className="admin-help">
            Visitors who allow measurement only. External clicks are not
            registrations or sales.
          </p>
        </>
      )}
      <Link to="/admin/conversions" className="admin-btn-ghost">
        View conversion dashboard <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}

export default function ConversionDashboard({
  days,
}: {
  days: ConversionDays;
}) {
  const config = useSiteConfig();
  const report = useQuery(conversionQueryOptions(days));
  const data = report.data;
  const summary = data?.summary;
  const stale =
    !!data &&
    (!!report.error || Date.now() - Date.parse(data.generated_at) > 5 * 60_000);
  return (
    <div className="admin-page-stack admin-conversions">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Business performance</p>
          <h1>See what moves people to act.</h1>
          <p>
            Follow measured visits into offer views, outbound clicks, and
            confirmed native orders.
          </p>
        </div>
        <button
          className="admin-btn-ghost"
          disabled={report.isFetching}
          onClick={() => report.refetch()}
          aria-label="Refresh conversions"
        >
          <RefreshCw size={16} aria-hidden="true" />
          {report.isFetching && !report.isPending ? "Refreshing…" : "Refresh"}
        </button>
      </header>
      <div className="admin-conversion-toolbar">
        <nav
          aria-label="Conversion date range"
          className="admin-conversion-ranges"
        >
          {([7, 30, 90] as const).map((value) => (
            // Numeric search values keep URLs canonical (?days=7, and no
            // parameter for the 30-day default). A "?days=7" string would be
            // JSON-quoted by TanStack's serializer.
            <RouterLink
              key={value}
              to="/admin/conversions"
              search={{ days: value }}
              aria-current={days === value ? "page" : undefined}
              className={days === value ? "is-active" : ""}
            >
              Last {value} days
            </RouterLink>
          ))}
        </nav>
        <p className="admin-help">UTC calendar days, including today</p>
      </div>
      <QueryNotice
        loading={report.isPending}
        error={report.error}
        retry={() => report.refetch()}
      />
      {data && summary && (
        <>
          <div className="admin-conversion-report-time">
            <span>
              {conversionDate(data.range.start)} –{" "}
              {conversionDate(data.range.end)} · UTC
            </span>
            <span>Updated {conversionDate(data.generated_at, true)} UTC</span>
          </div>
          {stale && (
            <p role="status" className="admin-notice">
              Showing the last successful report. Refresh to confirm the latest
              activity.
            </p>
          )}
          <div className="admin-conversion-metrics">
            <Metric
              label="Measured sessions"
              value={number(summary.measured_sessions)}
              detail="Consenting visits, not unique people or all traffic"
            />
            <Metric
              label="Outbound click rate"
              value={conversionRate(
                summary.outbound_sessions,
                summary.measured_sessions,
              )}
              detail={`${number(summary.outbound_sessions)} sessions clicked an external destination`}
            />
            <Metric
              label="Confirmed free claim rate"
              value={conversionRate(
                summary.attributed_free_claim_sessions,
                summary.measured_sessions,
              )}
              detail={`${number(summary.attributed_free_claim_sessions)} sessions claimed a native resource`}
            />
            <Metric
              label="Live paid order rate"
              value={conversionRate(
                summary.attributed_paid_order_sessions,
                summary.measured_sessions,
              )}
              detail={`${number(summary.attributed_paid_order_sessions)} sessions have a fulfilled live native order`}
            />
          </div>
          {summary.measured_sessions === 0 && (
            <section className="admin-card admin-conversion-start">
              <ChartNoAxesCombined size={28} aria-hidden="true" />
              <div>
                <h2>Ready for your first measured visits.</h2>
                <p>
                  Measurement began{" "}
                  {conversionDate(data.measurement_started_at)}. Share a public
                  offer or resource with your audience. Visitors who allow
                  measurement will begin filling this dashboard; earlier traffic
                  is not reconstructed.
                </p>
                <p>
                  Admin visits, previews, automated checks, and visitors who
                  decline measurement are excluded.
                </p>
                <Link className="admin-btn-ghost" to="/admin/offers">
                  Choose an offer to share{" "}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </section>
          )}
          <div className="admin-conversion-columns">
            <section className="admin-card admin-section admin-conversion-section">
              <div>
                <h2>What happened during measured visits</h2>
                <p className="admin-help">
                  Each row counts sessions once. These actions can overlap and
                  do not form a required sequence.
                </p>
              </div>
              <div className="admin-conversion-journey">
                {[
                  ["Viewed the shop", summary.shop_sessions],
                  ["Viewed an offer", summary.offer_sessions],
                  [
                    "Clicked an external destination",
                    summary.outbound_sessions,
                  ],
                  [
                    "Claimed a free native resource",
                    summary.attributed_free_claim_sessions,
                  ],
                  [
                    "Completed a live native purchase",
                    summary.attributed_paid_order_sessions,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="admin-conversion-journey-row"
                  >
                    <div>
                      <span>{label}</span>
                      <strong>
                        {number(Number(value))}{" "}
                        <small>
                          {conversionRate(
                            Number(value),
                            summary.measured_sessions,
                          )}
                        </small>
                      </strong>
                    </div>
                    <div className="admin-conversion-meter" aria-hidden="true">
                      <span
                        style={{
                          width: `${summary.measured_sessions ? Math.min(100, (Number(value) / summary.measured_sessions) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="admin-help">
                {number(summary.page_views)} public page view events. A claim or
                purchase is attributed only when that offer was viewed before
                the order was created.
              </p>
            </section>
            <DailyTrend rows={data.daily} />
          </div>
          <section className="admin-card admin-section admin-conversion-section">
            <div>
              <h2>Where measured sessions came from</h2>
              <p className="admin-help">
                Top 20 sources and campaigns by measured sessions. First
                recorded attribution stays with the session; rates use that
                row’s sessions.
              </p>
            </div>
            {data.sources.length ? (
              <Table label="Source and campaign performance">
                <thead>
                  <tr>
                    <th scope="col">Source / campaign</th>
                    <th scope="col">Sessions</th>
                    <th scope="col">Offer views</th>
                    <th scope="col">Outbound sessions</th>
                    <th scope="col">Free claim rate</th>
                    <th scope="col">Live paid rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sources.map((row) => (
                    <tr
                      key={`${row.source}:${row.medium}:${row.campaign ?? ""}`}
                    >
                      <th scope="row">
                        {conversionLabel(row.source)}
                        <small>
                          {conversionLabel(row.medium)} ·{" "}
                          {campaignLabel(row.campaign)}
                        </small>
                      </th>
                      <td>{number(row.sessions)}</td>
                      <td>{number(row.offer_sessions)}</td>
                      <td>{number(row.outbound_sessions)}</td>
                      <td>
                        {conversionRate(row.free_claim_sessions, row.sessions)}
                        <small>
                          {number(row.free_claim_sessions)} sessions ·{" "}
                          {number(row.free_claims)} claims
                        </small>
                      </td>
                      <td>
                        {conversionRate(row.paid_order_sessions, row.sessions)}
                        <small>
                          {number(row.paid_order_sessions)} sessions ·{" "}
                          {number(row.paid_orders)} orders
                        </small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Empty>
                Source and campaign results will appear after measured visits
                arrive.
              </Empty>
            )}
          </section>
          <section className="admin-card admin-section admin-conversion-section">
            <div>
              <h2>Offer performance</h2>
              <p className="admin-help">
                Top 20 offers by measured view sessions. Rates use sessions that
                viewed the same offer. Free claims and live paid orders are
                confirmed by the native backend.
              </p>
            </div>
            {data.offers.length ? (
              <Table label="Offer views and outcomes">
                <thead>
                  <tr>
                    <th scope="col">Offer</th>
                    <th scope="col">View sessions</th>
                    <th scope="col">Outbound sessions</th>
                    <th scope="col">Free claim rate</th>
                    <th scope="col">Live paid rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.offers.map((row) => (
                    <tr key={row.offer_id}>
                      <th scope="row">
                        <Link to={`/admin/offers/${row.offer_id}/edit`}>
                          {row.title}
                        </Link>
                        <small>
                          {row.checkout_mode === "external"
                            ? "External provider"
                            : "Native fulfillment"}
                        </small>
                      </th>
                      <td>{number(row.view_sessions)}</td>
                      <td>{number(row.outbound_sessions)}</td>
                      <td>
                        {row.checkout_mode === "external" ? (
                          "Not tracked"
                        ) : (
                          <>
                            {conversionRate(
                              row.free_claim_sessions,
                              row.view_sessions,
                            )}
                            <small>
                              {number(row.free_claim_sessions)} sessions ·{" "}
                              {number(row.free_claims)} claims
                            </small>
                          </>
                        )}
                      </td>
                      <td>
                        {row.checkout_mode === "external" ? (
                          "Not tracked"
                        ) : (
                          <>
                            {conversionRate(
                              row.paid_order_sessions,
                              row.view_sessions,
                            )}
                            <small>
                              {number(row.paid_order_sessions)} sessions ·{" "}
                              {number(row.paid_orders)} orders
                            </small>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Empty>
                No measured offer activity yet. Published offers remain
                available in Offers &amp; shop.
              </Empty>
            )}
          </section>
          <section className="admin-card admin-section admin-conversion-section">
            <div>
              <h2>Which links get the next click</h2>
              <p className="admin-help">
                Top 20 destination and placement pairs by clicks. Event,
                workshop, and affiliate clicks show interest; registrations and
                purchases on another website are not verified here.
              </p>
            </div>
            {data.placements.length ? (
              <Table label="Outbound destination and placement performance">
                <thead>
                  <tr>
                    <th scope="col">Destination</th>
                    <th scope="col">Placement</th>
                    <th scope="col">Click events</th>
                    <th scope="col">Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.placements.map((row) => (
                    <tr key={`${row.destination}:${row.placement}`}>
                      <th scope="row">
                        {row.destination === "summit" && !isBrianOwner(config)
                          ? "Featured event"
                          : conversionLabel(row.destination)}
                      </th>
                      <td>{conversionLabel(row.placement)}</td>
                      <td>{number(row.clicks)}</td>
                      <td>{number(row.sessions)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <Empty>
                No outbound clicks recorded in these measured sessions.
              </Empty>
            )}
          </section>
          <section
            className="admin-card admin-section admin-conversion-section"
            aria-labelledby="native-outcomes-title"
          >
            <div>
              <p className="admin-eyebrow">
                Operational records · independent of measurement consent
              </p>
              <h2 id="native-outcomes-title">Confirmed native outcomes</h2>
              <p className="admin-help">
                Orders fulfilled in the selected UTC period, regardless of when
                the visitor’s session began. Download activity instead uses the
                date of each order’s first issued link. These totals are not the
                numerator for the measured-session rates above.
              </p>
            </div>
            <div className="admin-conversion-native-grid">
              <div>
                <strong>{number(data.native_totals.free_claims)}</strong>
                <span>Fulfilled free claims</span>
              </div>
              <div>
                <strong>{number(data.native_totals.paid_orders)}</strong>
                <span>Fulfilled live paid orders</span>
              </div>
              <div>
                <strong>
                  {number(data.native_totals.download_links_issued)}
                </strong>
                <span>Orders with a first download link issued</span>
              </div>
              <div>
                <strong>{number(data.native_totals.refunded_orders)}</strong>
                <span>Orders from this fulfillment period now refunded</span>
              </div>
            </div>
            <div className="admin-conversion-revenue">
              <h3>Value of fulfilled live native orders</h3>
              {data.native_totals.revenue_by_currency.length ? (
                <ul>
                  {data.native_totals.revenue_by_currency.map((row) => (
                    <li key={row.currency}>
                      {conversionMoney(row.amount_minor, row.currency)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-help">
                  No fulfilled live native revenue recorded for this period.
                </p>
              )}
              <p className="admin-help">
                Currencies stay separate. This is order value before payment
                fees, not net earnings. Currently refunded orders, external
                sales, test payments, and payments of unknown mode are excluded.
              </p>
            </div>
            <p className="admin-help">
              {number(data.coverage.unattributed_free_claims)} free claims and{" "}
              {number(data.coverage.unattributed_paid_orders)} live paid orders
              in this period could not be linked to a measured visit (the
              visitor declined measurement, or the link failed).{" "}
              {number(data.native_totals.test_paid_orders)} test paid orders and{" "}
              {number(data.native_totals.unknown_mode_paid_orders)} paid orders
              of unknown mode are excluded from live sales.
            </p>
            <p className="admin-help">
              A download link issued means the file was made available; it does
              not confirm that the file finished downloading. This count records
              each order’s first issued link, not retries.
            </p>
            <Link to="/admin/offers?tab=orders" className="admin-btn-ghost">
              View order records <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </section>
          <details className="admin-card admin-section admin-conversion-details">
            <summary>How to read this report</summary>
            <div className="admin-conversion-methodology">
              <p>
                Measurement began{" "}
                {conversionDate(data.measurement_started_at, true)} UTC. Reports
                include consenting public sessions that started in the selected
                period, with outcomes known at the report’s update time. A
                session is a short visit, not a unique person. Returning visits
                can create new sessions.
              </p>
              <p>
                Only qualifying offer views can receive credit for a native
                claim or live payment. Confirmed order counts can exceed
                converting sessions when one session claims or buys more than
                once. Paid outcomes exclude orders that are currently refunded.
              </p>
              <p>
                Measured session details are retained for{" "}
                {data.coverage.session_retention_days} days. Earlier traffic is
                not backfilled. Admin use, local development, previews,
                automated checks, and browsers declining measurement are
                excluded. This is a measured sample, not a total audience count.
              </p>
              <p>
                Compare source and offer results after enough real activity
                accumulates. A zero denominator is shown as a dash; there is no
                inferred growth, projected revenue, or assumed external sale.
              </p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
