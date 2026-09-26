import { useQuery } from "@tanstack/react-query";
import { funnelJourneyMeasurementQuery } from "@/lib/funnelJourneyMeasurementReport";
import QueryNotice from "./QueryNotice";
export default function FunnelJourneyMetrics({ days }: { days: 7 | 30 | 90 }) {
  const report = useQuery(funnelJourneyMeasurementQuery(days));
  return (
    <section
      className="admin-card p-5 sm:p-6"
      aria-labelledby="connected-journey-metrics"
    >
      <h2 id="connected-journey-metrics" className="text-xl font-semibold">
        Connected journey progress
      </h2>
      <p className="admin-help mt-2">
        Consenting browser sessions first observed in each published revision
        during this date range. Sessions are visits, not unique people. Each
        step has its own reached-session denominator; branches are not a single
        linear funnel.
      </p>
      <QueryNotice
        loading={report.isPending}
        error={report.error}
        retry={() => {
          void report.refetch();
        }}
      />
      {report.data && (
        <>
          <p className="admin-help mt-3">
            Collection started{" "}
            {new Date(report.data.measurement_started_at).toLocaleDateString()}.
            A return visit in a new measurement session can enter midway.
            Repeated views, choices and handoff clicks at the same step count
            once per session and revision.
          </p>
          {!report.data.revisions.length && (
            <p className="mt-5 text-sm">
              No consented journey activity in this range yet. This does not
              mean no one used a journey.
            </p>
          )}
          {report.data.revisions.map((revision) => (
            <article
              className="mt-6 border-t border-border pt-5"
              key={`${revision.journey_id}:${revision.revision}`}
            >
              <h3 className="font-semibold">
                {revision.title} · Published revision {revision.revision}
              </h3>
              <p className="admin-help mt-1">
                {revision.measured_sessions} measured sessions ·{" "}
                {revision.entry_sessions} observed at the entry step
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Reached sessions and next actions for {revision.title},
                    revision {revision.revision}
                  </caption>
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 pr-4">Step</th>
                      <th className="p-2">Reached</th>
                      <th className="p-2">Continued</th>
                      <th className="p-2">Handoff</th>
                      <th className="p-2">No next action</th>
                      <th className="p-2">Still active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revision.steps.map((step) => (
                      <tr
                        className="border-b border-border/50 align-top"
                        key={step.step_id}
                      >
                        <th className="py-3 pr-4 text-left font-medium">
                          {step.title}
                          <span className="block text-xs font-normal text-muted-foreground">
                            {step.kind === "end"
                              ? "End reached; no purchase implied"
                              : step.kind}
                          </span>
                          {step.branches.length > 0 && (
                            <ul className="mt-2 space-y-1 text-xs font-normal">
                              {step.branches.map((branch) => (
                                <li key={branch.option_id}>
                                  {branch.label}: {branch.sessions} of{" "}
                                  {step.continue_sessions} continuing sessions
                                </li>
                              ))}
                            </ul>
                          )}
                        </th>
                        <td className="p-3">{step.view_sessions}</td>
                        <td className="p-3">
                          {step.kind === "end"
                            ? "—"
                            : `${step.continue_sessions} / ${step.view_sessions}`}
                        </td>
                        <td className="p-3">
                          {step.kind === "offer" || step.kind === "provider"
                            ? `${step.handoff_sessions} / ${step.view_sessions}`
                            : "—"}
                        </td>
                        <td className="p-3">
                          {step.kind === "end"
                            ? "—"
                            : `${step.no_next_action_sessions} / ${step.view_sessions}`}
                        </td>
                        <td className="p-3">
                          {step.kind === "end"
                            ? "—"
                            : step.still_active_sessions}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
          {report.data.revision_count > 20 && (
            <p className="admin-help mt-4">
              Showing the 20 revisions with the most measured sessions, of{" "}
              {report.data.revision_count} revisions in this range.
            </p>
          )}
        </>
      )}
      <p className="admin-help mt-5">
        “No next action” means a reached non-final step with neither a recorded
        Continue nor handoff after the measurement session became inactive for
        30 minutes or reached its 24-hour limit. Active visits stay separate.
        Handoffs and Continue can overlap; they do not confirm a booking,
        download, purchase, or provider-page arrival. Missing consent, blocked
        requests, later returns and tracking failures can leave gaps.
      </p>
    </section>
  );
}
