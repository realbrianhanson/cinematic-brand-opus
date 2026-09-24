import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { conversionDate, type ConversionDays } from "@/lib/conversions";
import {
  externalConversionMoney,
  externalConversionQueryOptions,
  externalConversionTemplate,
  importExternalOutcomes,
  parseExternalOutcomeCsv,
  type ExternalOutcome,
} from "@/lib/externalConversions";
import QueryNotice from "./QueryNotice";

export default function ExternalConversionPanel({
  days,
}: {
  days: ConversionDays;
}) {
  const queryClient = useQueryClient();
  const report = useQuery(externalConversionQueryOptions(days));
  const [rows, setRows] = useState<ExternalOutcome[]>([]);
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [fileError, setFileError] = useState("");
  const [reading, setReading] = useState(false);
  const fileVersion = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const mutation = useMutation({
    mutationFn: () => importExternalOutcomes(rows, reference),
    onSuccess: () => {
      setRows([]);
      setConfirmed(false);
      setReference("");
      if (fileInput.current) fileInput.current.value = "";
      void queryClient.invalidateQueries({
        queryKey: ["admin-external-conversions"],
      });
    },
  });
  const data = report.data;
  return (
    <section
      className="admin-card admin-section admin-conversion-section"
      aria-labelledby="external-outcomes-title"
    >
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">
            Provider exports · manually reconciled
          </p>
          <h2 id="external-outcomes-title">Confirmed external outcomes</h2>
        </div>
        <button
          type="button"
          className="admin-btn-ghost"
          disabled={report.isFetching}
          onClick={() => report.refetch()}
        >
          Refresh external outcomes
        </button>
      </div>
      <p className="admin-help">
        Import confirmed registrations and purchases from your summit or
        workshop provider. These are provider records, separate from native
        orders and measured visits. No provider is connected automatically.
      </p>
      <QueryNotice
        loading={report.isPending}
        error={report.error}
        retry={() => report.refetch()}
      />
      {data && (
        <>
          {report.error && (
            <p className="admin-help">
              Showing the last successful external report.
            </p>
          )}
          <p className="admin-help">
            Outcome dates: {conversionDate(data.range.start)} –{" "}
            {conversionDate(data.range.end)} UTC. Updated{" "}
            {conversionDate(data.generated_at, true)} UTC.
          </p>
          <div className="admin-conversion-native-grid">
            <div>
              <strong>{data.registrations.toLocaleString()}</strong>
              <span>Confirmed live registrations</span>
            </div>
            <div>
              <strong>{data.purchases.toLocaleString()}</strong>
              <span>Confirmed live purchases</span>
            </div>
            <div>
              <strong>{data.cancelled_or_refunded.toLocaleString()}</strong>
              <span>Cancelled or refunded live records, excluded</span>
            </div>
            <div>
              <strong>{data.excluded_test_or_unknown.toLocaleString()}</strong>
              <span>Test or unknown mode records, excluded</span>
            </div>
          </div>
          <div className="admin-conversion-revenue">
            <h3>Value of confirmed live external purchases</h3>
            {data.revenue_by_currency.length ? (
              <ul>
                {data.revenue_by_currency.map((value) => (
                  <li key={value.currency}>
                    {externalConversionMoney(
                      value.amount_minor,
                      value.currency,
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-help">
                No confirmed live external purchase value imported for this
                period.
              </p>
            )}
            <p className="admin-help">
              Currencies stay separate. Cancelled, fully refunded, test and
              unknown mode records are excluded. This is recorded purchase value
              before fees, not earnings or a combined total with native sales.
              Partial refunds are not supported by this import.
            </p>
          </div>
          {data.campaigns.length > 0 && (
            <div
              className="admin-conversion-table-wrap"
              role="region"
              aria-label="Provider-reported external campaigns"
              tabIndex={0}
            >
              <table className="admin-conversion-table">
                <caption className="sr-only">
                  Provider-reported external campaigns
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Provider / destination</th>
                    <th scope="col">Source / medium</th>
                    <th scope="col">Campaign</th>
                    <th scope="col">Registrations</th>
                    <th scope="col">Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((row) => (
                    <tr
                      key={JSON.stringify([
                        row.provider,
                        row.destination,
                        row.source,
                        row.medium,
                        row.campaign,
                      ])}
                    >
                      <th scope="row">
                        {row.provider}
                        <small>{row.destination}</small>
                      </th>
                      <td>
                        {row.source ?? "Unknown"}
                        <small>{row.medium ?? "Unknown"}</small>
                      </td>
                      <td>{row.campaign ?? "Not supplied"}</td>
                      <td>{row.registrations}</td>
                      <td>{row.purchases}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="admin-help">
            {data.without_campaign} confirmed live records have no campaign.
            Showing {data.campaigns.length} of {data.campaign_groups} campaign
            groups. Labels come from the provider; they do not establish that a
            visit to this website caused an outcome. No external session
            conversion rate is calculated.
          </p>
          {data.imports.length ? (
            <details className="admin-conversion-details">
              <summary>Recent imports and coverage</summary>
              <p className="admin-help">
                Last import: {conversionDate(data.imports[0].imported_at, true)}{" "}
                UTC. Counts cover only supplied records; a recent import does
                not guarantee the provider export is complete. This history
                spans all date ranges.
              </p>
              <ul className="space-y-2">
                {data.imports.map((entry) => (
                  <li key={entry.id}>
                    {entry.reference} ·{" "}
                    {conversionDate(entry.imported_at, true)} UTC ·{" "}
                    {entry.inserted} added, {entry.updated} updated,{" "}
                    {entry.unchanged} unchanged, {entry.stale} older updates
                    ignored
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="admin-notice">
              No provider export has been imported. Zero means no confirmed
              records here; it does not mean your external funnel has no
              conversions.
            </p>
          )}
        </>
      )}
      <details className="admin-conversion-details">
        <summary>Import a provider export</summary>
        <div className="space-y-4 pt-4">
          <p className="admin-help">
            Prepare up to 500 rows using the template. Import only external
            registrations or purchases verified in the provider. Remove contact
            details. Do not import this website’s native orders.
          </p>
          <a
            className="admin-btn-ghost"
            download="external-outcomes-template.csv"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(externalConversionTemplate)}`}
          >
            Download CSV template
          </a>
          <details>
            <summary>How to prepare the columns</summary>
            <ul className="admin-help list-disc pl-5 space-y-2">
              <li>
                <strong>provider, record_id:</strong> a consistent provider
                label and the stable registration or order ID. Never use an
                email address or customer name. Reuse the same ID for
                corrections.
              </li>
              <li>
                <strong>outcome, destination:</strong> registration or purchase,
                and a consistent destination label such as summit-october-2026.
              </li>
              <li>
                <strong>occurred_at, provider_updated_at:</strong> the outcome
                date and the provider’s latest update date, including time zone,
                such as 2026-09-24T14:30:00Z. For a provider without an update
                timestamp, use the verified export’s as-of time consistently.
              </li>
              <li>
                <strong>status, mode:</strong> confirmed, cancelled or refunded;
                live, test or unknown. Only confirmed live records count.
                Refunded applies to fully refunded purchases.
              </li>
              <li>
                <strong>amount_minor, currency:</strong> purchases require a
                positive whole number in minor units and an uppercase currency
                code (USD 7.00 = 700; JPY 700 = 700). Leave both empty for
                registrations.
              </li>
              <li>
                <strong>source, medium, campaign:</strong> optional
                provider-reported labels. Use lowercase letters, numbers,
                hyphens or underscores; no URLs, names or contact details. Leave
                unknown values empty.
              </li>
            </ul>
          </details>
          <label className="block">
            Provider CSV
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="admin-input mt-2 w-full"
              disabled={mutation.isPending}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                const version = ++fileVersion.current;
                setRows([]);
                setConfirmed(false);
                setFileError("");
                mutation.reset();
                if (!file) {
                  setReading(false);
                  return;
                }
                setReading(true);
                try {
                  if (file.size > 256 * 1024)
                    throw new Error("Choose a CSV smaller than 256 KiB.");
                  const parsed = parseExternalOutcomeCsv(await file.text());
                  if (version === fileVersion.current) setRows(parsed);
                } catch (error) {
                  if (version === fileVersion.current)
                    setFileError(
                      error instanceof Error
                        ? error.message
                        : "The file could not be read.",
                    );
                } finally {
                  if (version === fileVersion.current) setReading(false);
                }
              }}
            />
          </label>
          {reading && <p role="status">Reading the export…</p>}
          {fileError && (
            <p role="alert" className="admin-notice admin-notice-error">
              {fileError}
            </p>
          )}
          {rows.length > 0 && (
            <>
              <p role="status">
                {rows.length} rows ready to review.{" "}
                {
                  rows.filter(
                    (row) => row.status === "confirmed" && row.mode === "live",
                  ).length
                }{" "}
                are marked confirmed and live. Existing records will be
                reconciled when imported.
              </p>
              <div
                className="admin-conversion-table-wrap"
                role="region"
                aria-label="External import preview"
                tabIndex={0}
              >
                <table className="admin-conversion-table">
                  <caption>First {Math.min(rows.length, 5)} rows</caption>
                  <thead>
                    <tr>
                      <th scope="col">Provider / record</th>
                      <th scope="col">Outcome / destination</th>
                      <th scope="col">Status / mode</th>
                      <th scope="col">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row) => (
                      <tr
                        key={`${row.provider}:${row.record_id}:${row.outcome}`}
                      >
                        <th scope="row">
                          {row.provider}
                          <small>{row.record_id}</small>
                        </th>
                        <td>
                          {row.outcome}
                          <small>{row.destination}</small>
                        </td>
                        <td>
                          {row.status}
                          <small>{row.mode}</small>
                        </td>
                        <td>
                          {row.amount_minor !== null && row.currency
                            ? externalConversionMoney(
                                row.amount_minor,
                                row.currency,
                              )
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="block">
                Export reference
                <input
                  className="admin-input mt-2 w-full"
                  value={reference}
                  maxLength={80}
                  placeholder="summit-2026-09-24"
                  disabled={mutation.isPending}
                  onChange={(event) => {
                    setReference(event.target.value);
                    mutation.reset();
                  }}
                />
              </label>
              <p className="admin-help">
                Use a recognizable export label without personal information.
                Exact retries do not add conversions. Newer provider updates can
                correct records; older updates are ignored. Records absent from
                a file are kept.
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={mutation.isPending}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  I verified these external outcomes with the provider, removed
                  personal information, and excluded this website’s native
                  orders.
                </span>
              </label>
              <button
                type="button"
                className="admin-btn-primary"
                disabled={
                  !confirmed ||
                  !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(reference) ||
                  mutation.isPending ||
                  reading
                }
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending
                  ? "Reconciling…"
                  : `Import ${rows.length} verified rows`}
              </button>
            </>
          )}
          {mutation.error && (
            <p role="alert" className="admin-notice admin-notice-error">
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Import failed. No partial import was saved."}
            </p>
          )}
          {mutation.data && (
            <p role="status" className="admin-notice">
              Import saved: {mutation.data.inserted} added,{" "}
              {mutation.data.updated} updated, {mutation.data.unchanged}{" "}
              unchanged, {mutation.data.stale} older updates ignored.
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
