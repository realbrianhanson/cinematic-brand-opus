import { useQuery } from "@tanstack/react-query";
import {
  conversionDate,
  conversionMoney,
  conversionRate,
  offerJourneyQueryOptions,
  type ConversionDays,
} from "@/lib/conversions";
import QueryNotice from "./QueryNotice";

export default function OfferJourneyMetrics({
  days,
}: {
  days: ConversionDays;
}) {
  const report = useQuery(offerJourneyQueryOptions(days));
  const data = report.data;
  return (
    <section
      className="admin-card admin-section admin-conversion-section"
      aria-labelledby="follow-up-measurement-title"
    >
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Native follow-up offers</p>
          <h2 id="follow-up-measurement-title">
            Where each next step wins or loses interest
          </h2>
        </div>
        <button
          className="admin-btn-ghost"
          disabled={report.isFetching}
          onClick={() => void report.refetch()}
        >
          {report.isFetching ? "Refreshing…" : "Refresh follow-up report"}
        </button>
      </div>
      <p className="admin-help">
        Each row follows consenting sessions that saw that exact offer after the
        preceding offer. Continue means a checkout or free-claim button click,
        not a purchase. Declines and Continue can overlap after a retry; only
        confirmed orders count as outcomes.
      </p>
      <QueryNotice
        loading={report.isPending}
        error={report.error}
        retry={() => report.refetch()}
      />
      {!data && report.error && (
        <p className="admin-help">
          Follow-up reporting may need its backend update. Other conversion
          reports remain available.
        </p>
      )}
      {data && (
        <>
          {report.error && (
            <p role="status" className="admin-notice">
              Showing the last successful follow-up report. Refresh to confirm
              the latest activity.
            </p>
          )}
          <p className="admin-help">
            Measured follow-up coverage began{" "}
            {conversionDate(data.measurement_started_at, true)} UTC. Sessions
            started in the selected UTC period; confirmed outcomes are known as
            of {conversionDate(data.generated_at, true)} UTC. Earlier views are
            not reconstructed.
          </p>
          {data.steps.length ? (
            <div
              className="admin-conversion-table-wrap"
              role="region"
              aria-label="Measured follow-up offer performance"
              tabIndex={0}
            >
              <table className="admin-conversion-table">
                <caption className="sr-only">
                  Measured follow-up offer performance
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Offer sequence</th>
                    <th scope="col">Saw the step</th>
                    <th scope="col">Continue</th>
                    <th scope="col">Declined</th>
                    <th scope="col">Confirmed free claim</th>
                    <th scope="col">Confirmed live purchase</th>
                  </tr>
                </thead>
                <tbody>
                  {data.steps.map((row) => (
                    <tr key={`${row.parent_offer_id}:${row.offer_id}`}>
                      <th scope="row">
                        {row.parent_title}
                        <span aria-hidden="true"> → </span>
                        <span className="sr-only"> followed by </span>
                        {row.title}
                      </th>
                      <td>{row.view_sessions.toLocaleString("en-US")}</td>
                      {[
                        row.continue_sessions,
                        row.decline_sessions,
                        row.free_claim_sessions,
                        row.paid_order_sessions,
                      ].map((value, index) => (
                        <td key={index}>
                          {value.toLocaleString("en-US")}{" "}
                          <small>
                            {conversionRate(value, row.view_sessions)}
                          </small>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-conversion-empty">
              No measured follow-up views in this session cohort yet.
            </p>
          )}
          <p className="admin-help">
            Rates use that row’s view sessions. Names, emails, order IDs,
            private access links, and visitor answers are not collected as
            events. Signed-in visits, previews, and browsers declining
            measurement are excluded. Session details expire after 90 days.
          </p>
          <div>
            <p className="admin-eyebrow">
              Operational records · independent of measurement consent
            </p>
            <h3>Confirmed follow-up orders</h3>
          </div>
          <p className="admin-help">
            Orders fulfilled in the selected UTC period. These counts include
            unmeasured customers and are separate from the rates above. Revenue
            is order value before fees; currencies stay separate. Refunded
            orders, test payments, and unknown payment modes do not count as
            live revenue.
          </p>
          {data.native_steps.length ? (
            <div
              className="admin-conversion-table-wrap"
              role="region"
              aria-label="Operational follow-up orders"
              tabIndex={0}
            >
              <table className="admin-conversion-table">
                <caption className="sr-only">
                  Operational follow-up orders
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Offer sequence</th>
                    <th scope="col">Free claims</th>
                    <th scope="col">Live paid orders</th>
                    <th scope="col">Live order value</th>
                    <th scope="col">Excluded / refunded</th>
                  </tr>
                </thead>
                <tbody>
                  {data.native_steps.map((row) => (
                    <tr key={`${row.parent_offer_id}:${row.offer_id}`}>
                      <th scope="row">
                        {row.parent_title} → {row.title}
                      </th>
                      <td>{row.free_claims.toLocaleString("en-US")}</td>
                      <td>{row.paid_orders.toLocaleString("en-US")}</td>
                      <td>
                        {row.revenue_by_currency.length
                          ? row.revenue_by_currency.map((value) => (
                              <div key={value.currency}>
                                {conversionMoney(
                                  value.amount_minor,
                                  value.currency,
                                )}
                              </div>
                            ))
                          : "—"}
                      </td>
                      <td>
                        {row.test_paid_orders} test ·{" "}
                        {row.unknown_mode_paid_orders} unknown ·{" "}
                        {row.refunded_orders} now refunded
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-conversion-empty">
              No confirmed follow-up orders in this fulfillment period.
            </p>
          )}
        </>
      )}
    </section>
  );
}
