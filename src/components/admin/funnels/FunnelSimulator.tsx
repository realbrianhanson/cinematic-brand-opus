import { useState } from "react";
import {
  funnelGraphIssues,
  nextFunnelStep,
  type FunnelGraph,
} from "@/lib/funnelJourneys";
export default function FunnelSimulator({ graph }: { graph: FunnelGraph }) {
  const [current, setCurrent] = useState(graph.entryStepId);
  const [visited, setVisited] = useState<string[]>([]);
  const issues = funnelGraphIssues(graph);
  const step = graph.steps.find((s) => s.id === current);
  function move(answer?: string) {
    const next = nextFunnelStep(graph, current, answer);
    if (next) {
      setVisited([...visited, current]);
      setCurrent(next);
    }
  }
  return (
    <section
      className="rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-5"
      aria-label="Journey simulator"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold">Try the connections</h2>
        <button
          type="button"
          className="underline"
          onClick={() => {
            setCurrent(graph.entryStepId);
            setVisited([]);
          }}
        >
          Restart simulation
        </button>
      </div>
      <p className="my-3 text-sm text-[hsl(var(--admin-text-soft))]">
        Preview only. No booking, purchase, access request or visitor session is
        created.
      </p>
      {issues.length ? (
        <p>Resolve the connection issues before simulating.</p>
      ) : step ? (
        <>
          <p className="text-xs text-[hsl(var(--admin-text-soft))]">
            {[...visited, current].join(" → ")}
          </p>
          <h3 className="mt-4 font-semibold">{step.title}</h3>
          <p className="my-3 whitespace-pre-line text-sm">{step.body}</p>
          {step.kind === "choice" ? (
            <div className="space-y-2">
              {step.options?.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className="block w-full rounded border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] p-3 text-left"
                  onClick={() => move(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : step.kind === "end" ? (
            <p>End of journey</p>
          ) : (
            <>
              <p className="text-xs text-[hsl(var(--admin-text-soft))]">
                {step.kind === "offer"
                  ? `Offer handoff: ${step.offerId}`
                  : step.kind === "provider"
                    ? `Provider handoff: ${step.url}`
                    : ""}
              </p>
              <button
                type="button"
                className="mt-3 rounded border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] px-4 py-2"
                onClick={() => move()}
              >
                Continue simulation
              </button>
            </>
          )}
        </>
      ) : (
        <p>Restart to use the current entry step.</p>
      )}
    </section>
  );
}
