import type {
  FunnelGraph,
  FunnelOffer,
  FunnelStep,
} from "@/lib/funnelJourneys";
const input =
  "w-full rounded-md border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] px-3 py-2 text-sm";
export default function FunnelStepEditor({
  step,
  graph,
  offers,
  onChange,
  onDelete,
}: {
  step: FunnelStep;
  graph: FunnelGraph;
  offers: FunnelOffer[];
  onChange: (step: FunnelStep) => void;
  onDelete: () => void;
}) {
  const targets = graph.steps.filter((s) => s.id !== step.id);
  function destination(
    label: string,
    value: string | undefined,
    change: (value: string) => void,
    optional = false,
  ) {
    return (
      <label className="block space-y-1 text-sm">
        <span>{label}</span>
        <select
          className={input}
          value={value ?? ""}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">
            {optional ? "Use default destination" : "Choose a step"}
          </option>
          {targets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} ({s.id})
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <section
      className="space-y-4 rounded-lg border border-[hsl(var(--admin-border))] p-5"
      aria-label="Edit journey step"
    >
      <div className="flex justify-between gap-4">
        <p className="text-xs text-[hsl(var(--admin-text-soft))]">
          Stable ID: {step.id} · {step.kind}
        </p>
        <button type="button" className="text-sm underline" onClick={onDelete}>
          Remove step
        </button>
      </div>
      <label className="block space-y-1 text-sm">
        <span>Step title</span>
        <input
          className={input}
          maxLength={160}
          value={step.title}
          onChange={(e) => onChange({ ...step, title: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Plain-text explanation</span>
        <textarea
          className={input}
          rows={5}
          maxLength={6000}
          value={step.body}
          onChange={(e) => onChange({ ...step, body: e.target.value })}
        />
      </label>
      {step.kind === "choice" && (
        <>
          <p className="text-sm text-[hsl(var(--admin-text-soft))]">
            A selected choice uses its explicit destination, otherwise the
            default. Invalid or missing answers never advance.
          </p>
          {step.options?.map((option) => (
            <div
              className="space-y-2 rounded border border-[hsl(var(--admin-border))] p-3"
              key={option.id}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-[hsl(var(--admin-text-soft))]">
                  Choice ID: {option.id}
                </span>
                <button
                  type="button"
                  disabled={(step.options?.length ?? 0) <= 2}
                  className="text-xs underline disabled:opacity-40"
                  onClick={() => {
                    const branches = { ...step.branches };
                    delete branches[option.id];
                    onChange({
                      ...step,
                      options: step.options?.filter((o) => o.id !== option.id),
                      branches,
                    });
                  }}
                >
                  Remove choice
                </button>
              </div>
              <label className="block text-sm">
                <span>Choice label</span>
                <input
                  className={input}
                  value={option.label}
                  maxLength={200}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      options: step.options?.map((o) =>
                        o.id === option.id
                          ? { ...o, label: e.target.value }
                          : o,
                      ),
                    })
                  }
                />
              </label>
              {destination(
                "Destination for this choice",
                Object.hasOwn(step.branches ?? {}, option.id)
                  ? step.branches?.[option.id]
                  : undefined,
                (value) => {
                  const branches = { ...step.branches };
                  if (value) branches[option.id] = value;
                  else delete branches[option.id];
                  onChange({ ...step, branches });
                },
                true,
              )}
            </div>
          ))}
          <button
            type="button"
            disabled={(step.options?.length ?? 0) >= 8}
            className="text-sm underline disabled:opacity-40"
            onClick={() =>
              onChange({
                ...step,
                options: [
                  ...(step.options ?? []),
                  {
                    id: `choice-${crypto.randomUUID().slice(0, 8)}`,
                    label: "New choice",
                  },
                ],
              })
            }
          >
            Add choice
          </button>
          {destination(
            "Default destination",
            step.defaultStepId,
            (defaultStepId) => onChange({ ...step, defaultStepId }),
          )}
        </>
      )}
      {step.kind === "offer" && (
        <label className="block space-y-1 text-sm">
          <span>Published offer</span>
          <select
            className={input}
            value={step.offerId ?? ""}
            onChange={(e) => onChange({ ...step, offerId: e.target.value })}
          >
            <option value="">Choose a publicly available offer</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} · {o.checkout_mode}
              </option>
            ))}
          </select>
          <span className="text-xs text-[hsl(var(--admin-text-soft))]">
            Opens the existing offer page. Checkout and resource access stay
            with that offer.
          </span>
        </label>
      )}
      {step.kind === "provider" && (
        <label className="block space-y-1 text-sm">
          <span>Provider HTTPS address</span>
          <input
            className={input}
            type="url"
            maxLength={2048}
            value={step.url ?? ""}
            onChange={(e) => onChange({ ...step, url: e.target.value })}
          />
          <span className="text-xs text-[hsl(var(--admin-text-soft))]">
            This is a handoff. A visitor clicking Continue does not verify a
            booking or payment.
          </span>
        </label>
      )}
      {!["choice", "end"].includes(step.kind) &&
        destination("Next step", step.nextStepId, (nextStepId) =>
          onChange({ ...step, nextStepId }),
        )}
    </section>
  );
}
