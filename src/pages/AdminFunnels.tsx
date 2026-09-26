import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  emptyFunnelGraph,
  funnelGraphIssues,
  funnelTargets,
  type FunnelGraph,
  type FunnelOffer,
  type FunnelStep,
} from "@/lib/funnelJourneys";
import {
  listFunnelJourneys,
  listFunnelOffers,
  saveFunnelJourney,
  type FunnelDraft,
  type FunnelSave,
} from "@/lib/funnelJourneysClient";
import FunnelSimulator from "@/components/admin/funnels/FunnelSimulator";
import FunnelStepEditor from "@/components/admin/funnels/FunnelStepEditor";
const input =
  "rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] px-3 py-2 text-sm";
function blank(): FunnelDraft {
  return {
    id: crypto.randomUUID(),
    slug: "",
    title: "New connected journey",
    draft_graph: emptyFunnelGraph(),
    version: 0,
    published_version: null,
    active: false,
    updated_at: "",
  };
}
export default function AdminFunnels() {
  const [journeys, setJourneys] = useState<FunnelDraft[]>([]);
  const [offers, setOffers] = useState<FunnelOffer[]>([]);
  const [draft, setDraft] = useState<FunnelDraft | null>(null);
  const [selected, setSelected] = useState("welcome");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [kind, setKind] = useState<FunnelStep["kind"]>("content");
  const [dirty, setDirty] = useState(false);
  const pending = useRef<FunnelSave | null>(null);
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const [rows, available] = await Promise.all([
        listFunnelJourneys(),
        listFunnelOffers(),
      ]);
      setJourneys(rows);
      setOffers(available);
      if (draft) {
        const fresh = rows.find((row) => row.id === draft.id);
        if (fresh) {
          setDraft(fresh);
          setSelected(fresh.draft_graph.entryStepId);
        }
      }
      setDirty(false);
      pending.current = null;
    } catch {
      setError(
        "Journeys could not be loaded. Check your administrator access and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void Promise.all([listFunnelJourneys(), listFunnelOffers()])
      .then(([rows, available]) => {
        if (active) {
          setJourneys(rows);
          setOffers(available);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Journeys could not be loaded. Check your administrator access and try again.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useBlocker({
    shouldBlockFn: () => {
      if (busy && pending.current) {
        window.alert("Wait for the current save to finish before leaving.");
        return true;
      }
      return (
        (dirty || !!pending.current) &&
        !window.confirm(
          "Leave this journey? Unsaved changes will be lost. If a save was interrupted, reload its saved version before editing again.",
        )
      );
    },
    enableBeforeUnload: () => dirty || !!pending.current,
  });
  const graph = draft?.draft_graph;
  const issues = graph ? funnelGraphIssues(graph) : [];
  const current = graph?.steps.find((step) => step.id === selected);
  function edit(changes: Partial<FunnelDraft>) {
    if (!draft) return;
    setDraft({ ...draft, ...changes });
    setDirty(true);
    setNotice("");
  }
  function editGraph(next: FunnelGraph) {
    edit({ draft_graph: next });
  }
  function select(row: FunnelDraft) {
    if (
      dirty &&
      !window.confirm("Discard the changes that have not been saved?")
    )
      return;
    setDraft(row);
    setSelected(row.draft_graph.entryStepId);
    setDirty(false);
    pending.current = null;
    setError("");
    setNotice("");
  }
  function addStep() {
    if (!graph || graph.steps.length >= 30) return;
    const id = `step-${crypto.randomUUID().slice(0, 8)}`;
    const end = graph.steps.find((s) => s.kind === "end")?.id ?? "";
    const common = { id, title: "New step", body: "" };
    const step: FunnelStep =
      kind === "choice"
        ? {
            ...common,
            kind,
            options: [
              { id: "yes", label: "Yes" },
              { id: "no", label: "No" },
            ],
            branches: {},
            defaultStepId: end,
          }
        : kind === "end"
          ? { ...common, kind }
          : kind === "offer"
            ? { ...common, kind, offerId: "", nextStepId: end }
            : kind === "provider"
              ? { ...common, kind, url: "", nextStepId: end }
              : { ...common, kind, nextStepId: end };
    editGraph({ ...graph, steps: [...graph.steps, step] });
    setSelected(id);
  }
  async function save(publish: boolean, active = true) {
    if (!draft || !graph || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const request = pending.current ?? {
      id: draft.id,
      slug: draft.slug,
      title: draft.title,
      graph,
      expectedVersion: draft.version,
      publish,
      active,
      requestId: crypto.randomUUID(),
    };
    pending.current = request;
    try {
      const saved = await saveFunnelJourney(request);
      setDraft(saved);
      setJourneys((rows) => [saved, ...rows.filter((r) => r.id !== saved.id)]);
      setDirty(false);
      pending.current = null;
      setNotice(
        publish
          ? "Published a new revision. Visitors already in progress keep their existing revision."
          : !active
            ? "Journey paused. New and existing sessions cannot continue until you publish again."
            : "Private draft saved. The published journey is unchanged.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The save failed.");
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || !!pending.current;
  return (
    <div className="space-y-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Connected funnels</h1>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--admin-text-soft))]">
          Connect questions, helpful content and existing offers. Drafts stay
          private; publishing creates a fixed revision. Branches describe the
          next page, never proof of a booking or payment.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Journey{" "}
          <select
            className={`${input} ml-2`}
            disabled={busy}
            value={draft?.version ? draft.id : ""}
            onChange={(e) => {
              const row = journeys.find((j) => j.id === e.target.value);
              if (row) select(row);
            }}
          >
            <option value="">Choose a journey</option>
            {journeys.map((j) => (
              <option value={j.id} key={j.id}>
                {j.title} · {j.active ? "Live" : "Private / paused"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={input}
          disabled={busy}
          onClick={() => select(blank())}
        >
          New journey
        </button>
        <button
          type="button"
          className="text-sm underline"
          disabled={busy}
          onClick={() => {
            if (!dirty || window.confirm("Reload and discard unsaved changes?"))
              void refresh();
          }}
        >
          Reload saved version
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-[hsl(var(--admin-danger))] p-4"
        >
          <p>{error}</p>
          {pending.current && (
            <button
              type="button"
              disabled={busy}
              className="mt-2 underline"
              onClick={() =>
                void save(pending.current!.publish, pending.current!.active)
              }
            >
              Retry the same save
            </button>
          )}
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded border border-[hsl(var(--admin-border))] p-4"
        >
          {notice}
        </p>
      )}
      {draft && graph && (
        <>
          <fieldset disabled={locked} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="block">Journey title</span>
                <input
                  className={`${input} w-full`}
                  maxLength={160}
                  value={draft.title}
                  onChange={(e) => edit({ title: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="block">Address: /funnels/</span>
                <input
                  className={`${input} w-full`}
                  disabled={draft.version > 0}
                  maxLength={80}
                  value={draft.slug}
                  onChange={(e) => edit({ slug: e.target.value })}
                />
                <span className="text-xs text-[hsl(var(--admin-text-soft))]">
                  The address stays stable after the first save.
                </span>
              </label>
            </div>
            <label className="block text-sm">
              Start at{" "}
              <select
                className={`${input} ml-2`}
                value={graph.entryStepId}
                onChange={(e) =>
                  editGraph({ ...graph, entryStepId: e.target.value })
                }
              >
                {graph.steps.map((step) => (
                  <option key={step.id} value={step.id}>
                    {step.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid items-start gap-5 lg:grid-cols-[260px_1fr]">
              <aside className="space-y-3">
                <h2 className="font-semibold">Steps and connections</h2>
                <ol className="space-y-2">
                  {graph.steps.map((step) => (
                    <li key={step.id}>
                      <button
                        type="button"
                        aria-pressed={selected === step.id}
                        className={`w-full rounded border p-3 text-left ${selected === step.id ? "border-[hsl(var(--admin-accent))] bg-[hsl(var(--admin-surface-2))]" : "border-[hsl(var(--admin-border))]"}`}
                        onClick={() => setSelected(step.id)}
                      >
                        <span className="block text-sm font-medium">
                          {step.title}
                        </span>
                        <span className="block text-xs text-[hsl(var(--admin-text-soft))]">
                          {step.id} · {step.kind}
                        </span>
                        <span className="mt-2 block break-words text-xs">
                          {funnelTargets(step).length
                            ? `→ ${funnelTargets(step).join(", ")}`
                            : "End"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <label className="block text-sm">
                  New step type
                  <select
                    className={`${input} mt-1 w-full`}
                    value={kind}
                    onChange={(e) =>
                      setKind(e.target.value as FunnelStep["kind"])
                    }
                  >
                    <option value="content">Helpful content</option>
                    <option value="choice">Choice question</option>
                    <option value="offer">Published offer</option>
                    <option value="provider">Provider handoff</option>
                    <option value="end">End</option>
                  </select>
                </label>
                <button
                  type="button"
                  className={input}
                  disabled={graph.steps.length >= 30}
                  onClick={addStep}
                >
                  Add step
                </button>
              </aside>
              <div className="space-y-5">
                {current && (
                  <FunnelStepEditor
                    step={current}
                    graph={graph}
                    offers={offers}
                    onChange={(step) =>
                      editGraph({
                        ...graph,
                        steps: graph.steps.map((s) =>
                          s.id === step.id ? step : s,
                        ),
                      })
                    }
                    onDelete={() => {
                      if (
                        !window.confirm(
                          "Remove this step? Any connections to it must be updated before saving.",
                        )
                      )
                        return;
                      editGraph({
                        ...graph,
                        steps: graph.steps.filter((s) => s.id !== current.id),
                      });
                      setSelected(graph.entryStepId);
                    }}
                  />
                )}
                <FunnelSimulator key={JSON.stringify(graph)} graph={graph} />
              </div>
            </div>
          </fieldset>
          <section
            aria-label="Publication readiness"
            className="rounded-lg border border-[hsl(var(--admin-border))] p-5"
          >
            <h2 className="font-semibold">Ready to connect</h2>
            {issues.length ? (
              <ul className="my-3 list-disc space-y-1 pl-5 text-sm">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p className="my-3 text-sm">
                Every step is reachable, all destinations exist and no paths
                loop back.
              </p>
            )}
            <p className="text-xs text-[hsl(var(--admin-text-soft))]">
              Draft revision {draft.version || "not saved"}. Published revision{" "}
              {draft.published_version ?? "none"}. Provider steps are handoffs;
              offer access stays on the existing offer pages.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className={input}
                disabled={
                  locked ||
                  issues.length > 0 ||
                  !draft.slug ||
                  !draft.title.trim()
                }
                onClick={() => void save(false)}
              >
                Save private draft
              </button>
              <button
                type="button"
                className="admin-btn-primary"
                disabled={
                  locked ||
                  issues.length > 0 ||
                  !draft.slug ||
                  !draft.title.trim()
                }
                onClick={() => void save(true)}
              >
                Publish new revision
              </button>
              {draft.active && (
                <button
                  type="button"
                  disabled={locked || issues.length > 0}
                  className={input}
                  onClick={() => void save(false, false)}
                >
                  Pause journey
                </button>
              )}
              {draft.active && (
                <a
                  className="p-2 text-sm underline"
                  href={`/funnels/${draft.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open published journey
                </a>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
