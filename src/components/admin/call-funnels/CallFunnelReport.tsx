import { useEffect, useRef, useState } from "react";
import {
  loadCallReport,
  isCallMutationRejected,
  saveCallOutcome,
  type CallAdminEvent,
  type CallReportApplication,
  type CallFunnelReport as ReportData,
} from "@/lib/callFunnelsClient";
import type { CallOutcomeKind } from "@/lib/callFunnels";
const metricLabels: Record<string, string> = {
  applications: "Submitted applications",
  qualified: "Qualified",
  alternative: "Alternative offered",
  booked: "Bookings recorded",
  cancelled: "Cancelled",
  attended: "Attended",
  no_show: "No-shows",
  manual_sales: "Sales entered by team",
  webhook_sales: "Sales reported by integration",
};
export type CallReportProtection = {
  busy: boolean;
  pending: boolean;
  dirty: boolean;
};
const emptyProtection: CallReportProtection = {
  busy: false,
  pending: false,
  dirty: false,
};
const outcomeLabels: Record<CallOutcomeKind, string> = {
  booked: "Booking recorded",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  attended: "Attended",
  no_show: "No-show",
  sale: "Sale recorded",
};
function availableOutcomes(app?: CallReportApplication): CallOutcomeKind[] {
  if (!app) return [];
  if (app.outcome !== "qualified") return ["sale"];
  return app.booking?.status === "booked"
    ? ["booked", "rescheduled", "cancelled", "attended", "no_show", "sale"]
    : ["booked", "sale"];
}
export default function CallFunnelReport({
  funnelId,
  onStateChange,
}: {
  funnelId: string;
  onStateChange?: (state: CallReportProtection) => void;
}) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState("");
  const [eventType, setEventType] = useState<CallOutcomeKind>("attended");
  const [startsAt, setStartsAt] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef<CallAdminEvent | null>(null);
  const actionLocked = useRef(false);
  const protection = useRef<CallReportProtection>(emptyProtection);
  const stateCallback = useRef(onStateChange);
  stateCallback.current = onStateChange;
  const [uncertain, setUncertain] = useState(false);
  const selectedApplication = report?.applications.find(
    (app) => app.id === selected,
  );
  const outcomes = pending.current
    ? [pending.current.type]
    : availableOutcomes(selectedApplication);
  function protect(next: Partial<CallReportProtection>) {
    protection.current = { ...protection.current, ...next };
    stateCallback.current?.(protection.current);
  }
  function clearForm() {
    setSelected("");
    setReference("");
    setNote("");
    setStartsAt("");
    protect({ dirty: false });
  }
  useEffect(() => {
    let active = true;
    actionLocked.current = true;
    setBusy(true);
    setReport(null);
    setSelected("");
    setError("");
    protect({ busy: true });
    loadCallReport(funnelId, offset)
      .then((r) => {
        if (active) setReport(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) {
          actionLocked.current = false;
          setBusy(false);
          protect({ busy: false });
        }
      });
    return () => {
      active = false;
    };
  }, [funnelId, offset]);
  useEffect(() => () => stateCallback.current?.(emptyProtection), []);
  function chooseApplication(app: CallReportApplication) {
    if (actionLocked.current || pending.current || app.id === selected) return;
    if (
      protection.current.dirty &&
      !window.confirm(
        "Discard the unsaved outcome entry before selecting another application?",
      )
    )
      return;
    clearForm();
    setError("");
    setNotice("");
    setSelected(app.id);
    setEventType(
      app.outcome === "qualified"
        ? app.booking?.status === "booked"
          ? "attended"
          : "booked"
        : "sale",
    );
  }
  function changePage(next: number) {
    if (actionLocked.current || pending.current) return;
    if (
      protection.current.dirty &&
      !window.confirm(
        "Discard the unsaved outcome entry before changing application pages?",
      )
    )
      return;
    clearForm();
    setOffset(next);
  }
  async function reload() {
    if (actionLocked.current) return;
    actionLocked.current = true;
    setBusy(true);
    protect({ busy: true });
    setError("");
    try {
      setReport(await loadCallReport(funnelId, offset));
      // A read cannot establish whether an earlier mutation committed. Preserve
      // the original request and form until its exact replay is acknowledged.
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Please retry loading outcomes.",
      );
    } finally {
      actionLocked.current = false;
      setBusy(false);
      protect({ busy: false });
    }
  }
  async function record() {
    if (actionLocked.current || !selected) return;
    if (
      !pending.current &&
      (!reference.trim() ||
        reference.trim().length > 300 ||
        !note.trim() ||
        note.length > 2000)
    ) {
      setError(
        "Add a reference up to 300 characters and a short note explaining the recorded outcome.",
      );
      return;
    }
    if (
      !pending.current &&
      !availableOutcomes(selectedApplication).includes(eventType)
    ) {
      setError(
        "Choose an outcome that matches the application’s current booking status.",
      );
      return;
    }
    if (
      !pending.current &&
      ["booked", "rescheduled"].includes(eventType) &&
      (!startsAt || !Number.isFinite(Date.parse(startsAt)))
    ) {
      setError("Choose the appointment date and time.");
      return;
    }
    const request = pending.current ?? {
      applicationId: selected,
      requestId: crypto.randomUUID(),
      type: eventType,
      occurredAt: new Date().toISOString(),
      startsAt: ["booked", "rescheduled"].includes(eventType)
        ? new Date(startsAt).toISOString()
        : null,
      reference: reference.trim(),
      note: note.trim(),
    };
    pending.current = request;
    actionLocked.current = true;
    protect({ busy: true, pending: true });
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveCallOutcome(request);
    } catch (e) {
      if (isCallMutationRejected(e)) {
        pending.current = null;
        setUncertain(false);
        protect({ pending: false });
      } else {
        setUncertain(true);
      }
      setError(
        e instanceof Error
          ? e.message
          : "This update could not be confirmed. Retry the same outcome.",
      );
      actionLocked.current = false;
      setBusy(false);
      protect({ busy: false });
      return;
    }
    pending.current = null;
    setUncertain(false);
    protect({ pending: false });
    clearForm();
    setNotice(
      "Outcome recorded with your administrator identity. This does not send messages or change the provider appointment.",
    );
    try {
      setReport(await loadCallReport(funnelId, offset));
    } catch {
      setError(
        "Outcome saved, but the report could not refresh. Reload outcomes to see the latest report; do not enter the same outcome again.",
      );
    } finally {
      actionLocked.current = false;
      setBusy(false);
      protect({ busy: false });
    }
  }
  return (
    <section
      className="space-y-5"
      aria-label="Call funnel applications and outcomes"
    >
      <div className="admin-card p-5">
        <h2 className="text-xl font-semibold">Applications & outcomes</h2>
        <p className="mt-2">
          These counts come from submitted applications and recorded outcomes.
          Calendar clicks are never counted as bookings. Sales entered by your
          team or reported by an integration are not independently verified
          Stripe payments.
        </p>
        <p className="mt-2 text-sm">
          Application data is retained for 90 days. Contact permission is for
          the application and call, not newsletter enrollment.
        </p>
        <button
          className="admin-btn-secondary mt-3"
          disabled={busy}
          onClick={() => void reload()}
        >
          Reload outcomes
        </button>
      </div>
      {error && (
        <p role="alert" className="admin-card p-4">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {uncertain && (
        <p className="admin-notice">
          The last outcome is still unconfirmed. Reloading the report does not
          clear it. Retry the same outcome before leaving this workspace.
        </p>
      )}
      {busy && !report && <p role="status">Loading applications…</p>}
      {report && (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Object.entries(metricLabels).map(([key, label]) => (
              <div className="admin-card p-4" key={key}>
                <dt className="text-sm">{label}</dt>
                <dd className="mt-2 text-3xl font-semibold">
                  {report.counts[key] ?? 0}
                </dd>
              </div>
            ))}
          </dl>
          {!report.applications.length && <p>No submitted applications yet.</p>}
          <div className="space-y-3">
            {report.applications.map((app) => (
              <details key={app.id} className="admin-card p-5">
                <summary className="cursor-pointer py-2 font-semibold">
                  {app.contact.name} ·{" "}
                  {app.outcome === "qualified"
                    ? "Qualified"
                    : "Alternative offered"}{" "}
                  · {new Date(app.submittedAt).toLocaleDateString()}
                </summary>
                <p className="mt-3 break-all">{app.contact.email}</p>
                <p className="mt-2 text-sm">
                  Application {app.id} · version {app.revision}
                </p>
                <dl className="mt-4 space-y-3">
                  {Object.entries(app.answers).map(([id, answer]) => {
                    const q = app.questions?.find((q) => q.id === id);
                    return (
                      <div key={id}>
                        <dt className="font-semibold">{q?.label ?? id}</dt>
                        <dd className="whitespace-pre-wrap">
                          {q?.options?.find((o) => o.id === answer)?.label ??
                            answer}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                <p className="mt-4">
                  Booking: {app.booking?.status ?? "unconfirmed"}
                  {app.booking?.source
                    ? ` · ${app.booking.source === "admin" ? "recorded by team" : "signed integration"}`
                    : ""}
                  {app.booking?.startsAt
                    ? ` · ${new Date(app.booking.startsAt).toLocaleString()}`
                    : ""}
                </p>
                <p>
                  Attendance: {app.attendance?.status ?? "unrecorded"} · Sale:{" "}
                  {app.sale?.status ?? "unrecorded"}
                </p>
                {app.events?.length ? (
                  <ol className="mt-4 space-y-2 text-sm">
                    {app.events.map((e) => (
                      <li key={e.id}>
                        <strong>{e.type}</strong> · {e.source} ·{" "}
                        {new Date(e.occurredAt).toLocaleString()}
                        <p className="break-words">
                          {e.reference} — {e.note}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <button
                  className="admin-btn-secondary mt-4"
                  disabled={busy || uncertain}
                  onClick={() => chooseApplication(app)}
                >
                  Record an outcome for {app.contact.name}
                </button>
              </details>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <button
              className="admin-btn-secondary"
              disabled={busy || uncertain || offset === 0}
              onClick={() => changePage(Math.max(0, offset - 50))}
            >
              Previous applications
            </button>
            <p>{report.total} total</p>
            <button
              className="admin-btn-secondary"
              disabled={busy || uncertain || !report.hasMore}
              onClick={() => changePage(offset + 50)}
            >
              Next applications
            </button>
          </div>
        </>
      )}
      {selected && (
        <form
          className="admin-card space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void record();
          }}
        >
          <h3 className="text-xl font-semibold">
            Record a team-observed outcome
          </h3>
          <p className="break-all text-sm">Application {selected}</p>
          <label className="block">
            Outcome
            <select
              className="admin-input mt-2 w-full"
              disabled={busy || uncertain}
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value as CallOutcomeKind);
                protect({ dirty: true });
              }}
            >
              {outcomes.map((value) => (
                <option key={value} value={value}>
                  {outcomeLabels[value]}
                </option>
              ))}
            </select>
          </label>
          {["booked", "rescheduled"].includes(eventType) && (
            <label className="block">
              Appointment time (your timezone)
              <input
                className="admin-input mt-2 w-full"
                type="datetime-local"
                disabled={busy || uncertain}
                value={startsAt}
                onChange={(e) => {
                  setStartsAt(e.target.value);
                  protect({ dirty: true });
                }}
              />
            </label>
          )}
          <label className="block">
            Reference
            <input
              className="admin-input mt-2 w-full"
              disabled={busy || uncertain}
              maxLength={300}
              value={reference}
              onChange={(e) => {
                setReference(e.target.value);
                protect({ dirty: true });
              }}
              placeholder="Calendar booking or CRM reference"
            />
          </label>
          <label className="block">
            What did you verify?
            <textarea
              className="admin-input mt-2 w-full"
              disabled={busy || uncertain}
              maxLength={2000}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                protect({ dirty: true });
              }}
            />
          </label>
          <button className="admin-btn-primary" disabled={busy}>
            {uncertain ? "Retry the same outcome" : "Save outcome"}
          </button>
        </form>
      )}
      <details className="admin-card p-5">
        <summary className="cursor-pointer py-2 font-semibold">
          Connect calendar and CRM outcomes
        </summary>
        <p className="mt-3">
          Use your calendar URL in the Booking tab. To update outcomes
          automatically, configure a trusted server-side integration with the
          signed call-funnel-events endpoint and its CALL_FUNNEL_WEBHOOK_SECRET.
          The application ID identifies the record; email alone never confirms a
          booking.
        </p>
        <p className="mt-2">
          Until that connection is configured and tested, record confirmed
          outcomes here. Calendar confirmations and reminders remain with your
          booking provider.
        </p>
      </details>
    </section>
  );
}
