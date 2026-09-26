import { useQuery } from "@tanstack/react-query";
import { conversionDate, type ConversionDays } from "@/lib/conversions";
import {
  externalPaymentMoney,
  externalPaymentQueryOptions,
  externalPaymentStatusQueryOptions,
} from "@/lib/externalPayments";
import QueryNotice from "./QueryNotice";

export default function ExternalPaymentSetup({
  days,
}: {
  days: ConversionDays;
}) {
  const report = useQuery(externalPaymentQueryOptions(days));
  const setup = useQuery(externalPaymentStatusQueryOptions());
  const data = report.data,
    status = setup.data;
  return (
    <section
      className="admin-card admin-section admin-conversion-section"
      aria-labelledby="external-payment-title"
    >
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">External Stripe payments</p>
          <h2 id="external-payment-title">Automatic payment reconciliation</h2>
        </div>
        <button
          type="button"
          className="admin-btn-ghost"
          disabled={report.isFetching || setup.isFetching}
          onClick={() => {
            void report.refetch();
            void setup.refetch();
          }}
        >
          Refresh payment status
        </button>
      </div>
      <p className="admin-help">
        Confirmed provider payments are kept separate from native orders, manual
        imports and measured visits. These totals cover accepted callbacks for
        configured products; they do not establish complete provider coverage or
        website attribution.
      </p>
      <QueryNotice
        loading={setup.isPending}
        error={setup.error}
        retry={() => setup.refetch()}
      />
      {status && (
        <div className="admin-conversion-details">
          <h3>
            {!status.configured
              ? "Account setup required"
              : !status.enabled
                ? "Intake paused"
                : status.mode === "test"
                  ? "Test intake enabled"
                  : "Live intake enabled"}
          </h3>
          <p className="admin-help">
            {status.configured
              ? `${status.mapped_prices} exact price mappings · ${status.mode} mode · ${status.scope === "connected" ? "connected account" : "account endpoint"}.`
              : "A verified Stripe account, signing secret and exact product mappings must be configured before callbacks are accepted."}{" "}
            HighLevel account reconciliation and historical backfill are not
            connected. Live end-to-end coverage remains unverified by this
            panel.
          </p>
          <details>
            <summary>Activation checklist</summary>
            <ol className="admin-help list-decimal pl-5 space-y-1">
              <li>
                Verify the actual PushTen Stripe account and the product/price
                IDs used by its checkout.
              </li>
              <li>
                Use an isolated test account or sandbox and complete a paid
                checkout, subscription invoice, renewal and partial/full refund.
                Confirm totals against Stripe.
              </li>
              <li>
                Configure the signed callback for this deployment and enable
                live intake only after those checks. Monitor failed deliveries
                in Stripe.
              </li>
            </ol>
            <p className="admin-help">
              Supported: mapped one-time Checkout payments and paid invoices
              backed by a single allocated PaymentIntent. Mixed destinations,
              out-of-band payments, direct charges without a PaymentIntent,
              payment allocations across invoices, and unusually large baskets
              require separate reconciliation. Registrations and bookings are
              not counted here.
            </p>
          </details>
        </div>
      )}
      <QueryNotice
        loading={report.isPending}
        error={report.error}
        retry={() => report.refetch()}
      />
      {data && (
        <>
          {report.error && (
            <p className="admin-help">
              Showing the last successful payment report.
            </p>
          )}
          <p className="admin-help">
            Payment dates: {conversionDate(data.range.start)} –{" "}
            {conversionDate(data.range.end)} UTC. Refund totals reflect the
            latest accepted observations for those payments. Updated{" "}
            {conversionDate(data.generated_at, true)} UTC.
          </p>
          <div className="admin-conversion-native-grid">
            <div>
              <strong>{data.live.payments}</strong>
              <span>Live payments, including refunded</span>
            </div>
            <div>
              <strong>{data.live.partial_refund_payments}</strong>
              <span>Partially refunded live payments</span>
            </div>
            <div>
              <strong>{data.live.full_refund_payments}</strong>
              <span>Fully refunded live payments</span>
            </div>
            <div>
              <strong>{data.test.payments}</strong>
              <span>Test payments, excluded from live totals</span>
            </div>
          </div>
          {data.live.revenue_by_currency.length ? (
            <div
              className="admin-conversion-table-wrap"
              role="region"
              aria-label="External live payment totals"
              tabIndex={0}
            >
              <table className="admin-conversion-table">
                <caption className="sr-only">
                  External live payments by currency
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Currency</th>
                    <th scope="col">Collected</th>
                    <th scope="col">Succeeded refunds</th>
                    <th scope="col">After refunds</th>
                  </tr>
                </thead>
                <tbody>
                  {data.live.revenue_by_currency.map((row) => (
                    <tr key={row.currency}>
                      <th scope="row">{row.currency}</th>
                      <td>
                        {externalPaymentMoney(row.gross_minor, row.currency)}
                      </td>
                      <td>
                        {externalPaymentMoney(row.refunded_minor, row.currency)}
                      </td>
                      <td>
                        {externalPaymentMoney(row.net_minor, row.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-help">
              No accepted live external payments for this period.
            </p>
          )}
          <p className="admin-help">
            Amounts are before processing fees, disputes and accounting
            adjustments. Renewals are separate payments, not new customers.
            Partial refunds reduce value without deleting the original payment.
            Pending, failed or action-required refunds do not reduce these
            totals. If a previously succeeded refund is returned, its value is
            restored after an authenticated refresh.
          </p>
          <details className="admin-conversion-details">
            <summary>Callback history and limits</summary>
            <p className="admin-help">
              {data.accepted_event_count_in_range} accepted callbacks in the
              selected receive-date range; {data.accepted_event_count} all time.
              Last processed:{" "}
              {data.last_processed_at
                ? `${conversionDate(data.last_processed_at, true)} UTC`
                : "None"}
              . The latest 20 callbacks span all dates. A recent callback is not
              proof that every provider event was delivered; failed callbacks
              remain visible in Stripe’s delivery log.
            </p>
            {data.latest_events.length ? (
              <ul className="space-y-2">
                {data.latest_events.map((event, index) => (
                  <li
                    key={`${event.received_at}-${index}`}
                    className="admin-help"
                  >
                    {conversionDate(event.received_at, true)} UTC · {event.mode}{" "}
                    · {event.event_type} ·{" "}
                    {event.resolution === "applied"
                      ? `${event.payment_count} payment observations`
                      : event.resolution === "unmapped"
                        ? "No configured product match"
                        : event.resolution === "not_paid"
                          ? "No paid amount"
                          : "Unsupported payment flow"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-help">
                No authenticated callbacks have been recorded.
              </p>
            )}
          </details>
        </>
      )}
    </section>
  );
}
