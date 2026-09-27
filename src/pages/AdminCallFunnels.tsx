import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Link } from "@/lib/router-compat";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { listOfferProof } from "@/lib/offerBuilderClient";
import type { OfferProof } from "@/lib/offerBuilder";
import {
  callConfigIssues,
  emptyCallFunnelConfig,
  publicCallConfig,
  type CallFunnelDraft,
  type CallPublication,
} from "@/lib/callFunnels";
import {
  listCallFunnels,
  isCallMutationRejected,
  saveCallFunnel,
  type CallSave,
} from "@/lib/callFunnelsClient";
import CallFunnelEditor from "@/components/admin/call-funnels/CallFunnelEditor";
import CallFunnelReport, {
  type CallReportProtection,
} from "@/components/admin/call-funnels/CallFunnelReport";
import CallFunnelExperience from "@/components/call-funnels/CallFunnelExperience";

export default function AdminCallFunnels() {
  const site = useSiteConfig();
  const [rows, setRows] = useState<CallFunnelDraft[]>([]);
  const [proof, setProof] = useState<OfferProof[]>([]);
  const [draft, setDraft] = useState<CallFunnelDraft | null>(null);
  const [busy, setBusy] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"edit" | "preview" | "applications">("edit");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [pendingSave, setPendingSave] = useState<CallSave | null>(null);
  const pending = useRef<CallSave | null>(null);
  const generation = useRef(0);
  const emptyReportState = { busy: false, pending: false, dirty: false };
  const [reportState, setReportState] =
    useState<CallReportProtection>(emptyReportState);
  const reportStateRef = useRef<CallReportProtection>(emptyReportState);
  const receiveReportState = useCallback((state: CallReportProtection) => {
    reportStateRef.current = state;
    setReportState(state);
  }, []);
  function mutationsInProgress() {
    return (
      !!pending.current ||
      reportStateRef.current.pending ||
      reportStateRef.current.busy
    );
  }
  function confirmDiscard(message: string) {
    if (mutationsInProgress()) {
      window.alert(
        "Confirm the pending save or outcome before leaving this workspace. Retry the same request if its result is uncertain.",
      );
      return false;
    }
    return !(dirty || reportStateRef.current.dirty) || window.confirm(message);
  }
  useEffect(() => {
    let active = true;
    Promise.all([listCallFunnels(), listOfferProof()])
      .then(([funnels, items]) => {
        if (active) {
          setRows(funnels);
          setProof(items);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useBlocker({
    shouldBlockFn: () =>
      !confirmDiscard(
        "Leave this funnel? Unsaved draft or outcome edits will be lost.",
      ),
    enableBeforeUnload: () =>
      dirty ||
      !!pending.current ||
      reportStateRef.current.pending ||
      reportStateRef.current.dirty,
  });
  function replace(next: CallFunnelDraft) {
    if (
      busy ||
      !confirmDiscard(
        "Discard unsaved draft or outcome edits and load the selected funnel?",
      )
    )
      return;
    ++generation.current;
    setDraft(structuredClone(next));
    setDirty(false);
    setError("");
    setNotice("");
    setView("edit");
    pending.current = null;
    setPendingSave(null);
  }
  function create() {
    const config = emptyCallFunnelConfig();
    config.brand.name = site.identity.name;
    config.brand.hostName = site.identity.name;
    config.brand.hostRole = site.identity.tagline;
    config.brand.hostImage = site.story.portraitSrc ?? "";
    config.invitation.video.poster = config.brand.hostImage;
    replace({
      id: crypto.randomUUID(),
      slug: "",
      title: "Video + Application",
      version: 0,
      published_version: null,
      active: false,
      draft_config: config,
      updated_at: "",
    });
  }
  async function reload() {
    if (
      busy ||
      !confirmDiscard(
        "Reload the saved version and discard unsaved draft or outcome edits?",
      )
    )
      return;
    setView("edit");
    setBusy(true);
    setError("");
    try {
      const [fresh, items] = await Promise.all([
        listCallFunnels(),
        listOfferProof(),
      ]);
      setRows(fresh);
      setProof(items);
      const row = fresh.find((r) => r.id === draft?.id);
      setDraft(row ?? null);
      setDirty(false);
      pending.current = null;
      setPendingSave(null);
      setNotice("Saved version loaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry loading.");
    } finally {
      setBusy(false);
    }
  }
  async function save(publish = false, active = draft?.active ?? false) {
    if (
      !draft ||
      busy ||
      reportStateRef.current.busy ||
      reportStateRef.current.pending
    )
      return;
    const request = pending.current ?? {
      id: draft.id,
      slug: draft.slug,
      title: draft.title,
      config: structuredClone(draft.draft_config),
      expectedVersion: draft.version,
      publish,
      active,
      requestId: crypto.randomUUID(),
    };
    const issues = callConfigIssues(request.config, request.publish);
    if (!/^[a-z][a-z0-9-]{1,79}$/.test(request.slug))
      issues.unshift(
        "Address: use 2–80 lowercase letters, numbers or hyphens, starting with a letter.",
      );
    if (!request.title.trim() || request.title.length > 160)
      issues.unshift("Enter a funnel name up to 160 characters.");
    if (issues.length) {
      setError(issues.join("\n"));
      if (!reportStateRef.current.dirty) setView("edit");
      return;
    }
    pending.current = request;
    setPendingSave(request);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveCallFunnel(request);
      setDraft(saved);
      setRows((old) => [saved, ...old.filter((r) => r.id !== saved.id)]);
      setDirty(false);
      pending.current = null;
      setPendingSave(null);
      setNotice(
        request.publish
          ? "Funnel published. Existing applications keep their original version."
          : request.active
            ? "Draft saved. Your published funnel is unchanged."
            : "Draft saved. The funnel is private or paused.",
      );
    } catch (e) {
      if (isCallMutationRejected(e)) {
        pending.current = null;
        setPendingSave(null);
      }
      setError(
        e instanceof Error
          ? e.message
          : "This save could not be confirmed. Retry the same save to confirm its result.",
      );
    } finally {
      setBusy(false);
    }
  }
  const locked =
    busy || !!pendingSave || reportState.busy || reportState.pending;
  const publication: CallPublication | null = draft
    ? {
        id: draft.id,
        slug: draft.slug || "preview",
        title: draft.title,
        revision: draft.version,
        config: publicCallConfig(draft.draft_config),
        proof: proof
          .filter((p) => p.approved)
          .map(({ id, title, content, attribution, source_url }) => ({
            id,
            title,
            content,
            attribution,
            source_url,
          })),
      }
    : null;
  return (
    <div className="space-y-6">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Book a call</p>
          <h1>Call funnel builder</h1>
          <p className="admin-help">
            Create a focused video invitation, qualify applicants, and guide
            them to a call or an alternative offer.
          </p>
        </div>
        <Link className="admin-btn-secondary" to="/admin/funnel-builder">
          Choose another funnel type
        </Link>
      </header>
      <div className="admin-card flex flex-wrap items-end gap-3 p-5">
        <label className="min-w-64 flex-1">
          Saved call funnels
          <select
            className="admin-input mt-2 w-full"
            disabled={locked}
            value={draft?.version ? draft.id : ""}
            onChange={(e) => {
              const r = rows.find((r) => r.id === e.target.value);
              if (r) replace(r);
            }}
          >
            <option value="">Choose a funnel</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · {r.active ? "Published" : "Private / paused"}
              </option>
            ))}
          </select>
        </label>
        <button
          className="admin-btn-primary"
          disabled={locked}
          onClick={create}
        >
          Use Video + Application template
        </button>
        <button
          className="admin-btn-secondary"
          disabled={locked}
          onClick={() => void reload()}
        >
          Reload saved version
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="admin-card whitespace-pre-line border-red-500 p-5"
        >
          {error}
          {pendingSave && (
            <div className="mt-3">
              <button
                className="admin-btn-primary"
                disabled={busy}
                onClick={() => void save()}
              >
                Retry the same save
              </button>
              <p className="mt-2 text-sm">
                Editing is paused until an exact retry confirms this save.
                Reloading cannot confirm whether an interrupted save committed.
              </p>
            </div>
          )}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {!draft && (
        <div className="admin-card p-8">
          <h2 className="text-2xl font-semibold">
            Start with the Video + Application template
          </h2>
          <p className="mt-3 text-lg">
            Video invitation → guided application → calendar → preparation and
            training. Applicants who need an earlier step can explore your
            alternate offer.
          </p>
          <p className="mt-3">
            Dark and white designs, approved testimonials, private video
            scripts, and application reporting are included.
          </p>
          <a
            className="admin-btn-secondary mt-5"
            href="/funnel-templates/video-application"
            target="_blank"
            rel="noreferrer"
          >
            Explore the template
          </a>
        </div>
      )}
      {draft && publication && (
        <>
          <div className="admin-card grid gap-4 p-5 md:grid-cols-2">
            <label>
              Funnel name
              <input
                className="admin-input mt-2 w-full"
                disabled={locked}
                maxLength={160}
                value={draft.title}
                onChange={(e) => {
                  setDraft({ ...draft, title: e.target.value });
                  setDirty(true);
                }}
              />
            </label>
            <label>
              Page address <span className="text-sm">/calls/</span>
              <input
                className="admin-input mt-2 w-full"
                disabled={locked || draft.version > 0}
                maxLength={80}
                value={draft.slug}
                onChange={(e) => {
                  setDraft({ ...draft, slug: e.target.value });
                  setDirty(true);
                }}
              />
            </label>
          </div>
          <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-3 shadow-sm">
            <span role="status" className="mr-auto text-sm">
              {busy
                ? "Working…"
                : dirty
                  ? "Unsaved changes"
                  : `Saved version ${draft.version}`}
            </span>
            <button
              className="admin-btn-secondary"
              disabled={locked}
              onClick={() => void save()}
            >
              Save draft
            </button>
            <button
              className="admin-btn-primary"
              disabled={locked}
              onClick={() => {
                if (
                  window.confirm(
                    "Publish this funnel at its public address? This publishes the reviewed pages and enables applications.",
                  )
                )
                  void save(true, true);
              }}
            >
              Publish funnel
            </button>
            {draft.active && (
              <button
                className="admin-btn-secondary"
                disabled={locked}
                onClick={() => void save(false, false)}
              >
                Pause funnel
              </button>
            )}
          </div>
          <nav
            aria-label="Call funnel workspace"
            className="flex flex-wrap gap-2"
          >
            {(
              [
                ["edit", "Edit template"],
                ["preview", "Test both paths"],
                ["applications", "Applications & outcomes"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={
                  view === key ? "admin-btn-primary" : "admin-btn-secondary"
                }
                aria-pressed={view === key}
                disabled={locked && view !== key}
                onClick={() => {
                  if (key === view) return;
                  if (
                    reportStateRef.current.busy ||
                    reportStateRef.current.pending ||
                    pending.current
                  )
                    return;
                  if (
                    reportStateRef.current.dirty &&
                    !window.confirm(
                      "Discard the unsaved outcome entry before leaving applications?",
                    )
                  )
                    return;
                  setView(key);
                }}
              >
                {label}
              </button>
            ))}
            {draft.active && (
              <a
                className="admin-btn-secondary"
                target="_blank"
                rel="noreferrer"
                href={`/calls/${draft.slug}`}
              >
                Open published funnel
              </a>
            )}
          </nav>
          {view === "edit" && (
            <CallFunnelEditor
              config={draft.draft_config}
              onChange={(config) => {
                if (!locked) {
                  setDraft({ ...draft, draft_config: config });
                  setDirty(true);
                  setNotice("");
                }
              }}
              proof={proof}
              disabled={locked}
            />
          )}
          {view === "preview" && (
            <div>
              <div className="mb-4 flex flex-wrap gap-3">
                <p className="mr-auto">
                  Preview your current edits. No applications, bookings or
                  payments are created.
                </p>
                <button
                  className="admin-btn-secondary"
                  aria-pressed={device === "desktop"}
                  onClick={() => setDevice("desktop")}
                >
                  Desktop
                </button>
                <button
                  className="admin-btn-secondary"
                  aria-pressed={device === "phone"}
                  onClick={() => setDevice("phone")}
                >
                  Phone
                </button>
              </div>
              <div
                style={{ maxWidth: device === "phone" ? 390 : undefined }}
                className="mx-auto overflow-hidden rounded-xl border border-current/15"
              >
                <CallFunnelExperience
                  key={`${draft.id}:${device}`}
                  publication={publication}
                  preview
                  qualificationRules={draft.draft_config.qualificationRules}
                />
              </div>
            </div>
          )}
          {view === "applications" &&
            (draft.version ? (
              <CallFunnelReport
                key={draft.id}
                funnelId={draft.id}
                onStateChange={receiveReportState}
              />
            ) : (
              <p>Save this funnel to view its application report.</p>
            ))}
        </>
      )}
    </div>
  );
}
