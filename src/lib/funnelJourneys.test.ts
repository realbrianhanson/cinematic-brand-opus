import { describe, expect, it } from "vitest";
import {
  emptyFunnelGraph,
  funnelGraphIssues,
  funnelProviderUrl,
  nextFunnelStep,
  parseFunnelGraph,
  type FunnelGraph,
} from "./funnelJourneys";
import { parseFunnelRequest } from "../../supabase/functions/_shared/funnelJourneyRequests";
const graph = (): FunnelGraph => ({
  version: 1,
  entryStepId: "question",
  steps: [
    {
      id: "question",
      kind: "choice",
      title: "Support?",
      body: "",
      options: [
        { id: "guided", label: "Training" },
        { id: "independent", label: "Myself" },
      ],
      branches: { guided: "guide" },
      defaultStepId: "finish",
    },
    {
      id: "guide",
      kind: "provider",
      title: "Review training",
      body: "",
      url: "https://example.com/training",
      nextStepId: "finish",
    },
    { id: "finish", kind: "end", title: "Ready", body: "" },
  ],
});
describe("connected journey graph", () => {
  it("evaluates valid choices using explicit branches and the default", () => {
    const g = graph();
    expect(parseFunnelGraph(g)).toEqual(g);
    expect(nextFunnelStep(g, "question", "guided")).toBe("guide");
    expect(nextFunnelStep(g, "question", "independent")).toBe("finish");
    expect(nextFunnelStep(g, "guide")).toBe("finish");
    expect(nextFunnelStep(g, "finish")).toBeNull();
  });
  it("rejects missing and invented choice answers instead of defaulting", () => {
    expect(() => nextFunnelStep(graph(), "question")).toThrow();
    expect(() => nextFunnelStep(graph(), "question", "rich")).toThrow();
    expect(() => nextFunnelStep(graph(), "guide", "paid")).toThrow();
  });
  it.each([
    [
      "missing destination",
      (g: FunnelGraph) => {
        g.steps[0].branches!.guided = "missing";
      },
    ],
    [
      "cycle",
      (g: FunnelGraph) => {
        g.steps[1].nextStepId = "question";
      },
    ],
    [
      "unreachable",
      (g: FunnelGraph) => {
        g.steps.push({ id: "unused", kind: "end", title: "Unused", body: "" });
      },
    ],
    [
      "duplicate stable ID",
      (g: FunnelGraph) => {
        g.steps[1].id = "question";
      },
    ],
    [
      "invented branch answer",
      (g: FunnelGraph) => {
        g.steps[0].branches!.income = "finish";
      },
    ],
    [
      "missing default",
      (g: FunnelGraph) => {
        delete g.steps[0].defaultStepId;
      },
    ],
    [
      "duplicate choice",
      (g: FunnelGraph) => {
        g.steps[0].options![1].id = "guided";
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const g = graph();
    (mutate as (g: FunnelGraph) => void)(g);
    expect(funnelGraphIssues(g).length).toBeGreaterThan(0);
  });
  it("rejects unsupported free text fields and client payment flags", () => {
    const g = graph();
    expect(funnelGraphIssues({ ...g, paid: true })).not.toEqual([]);
    expect(
      funnelGraphIssues({
        ...g,
        steps: [
          { ...g.steps[0], email: "person@example.com" },
          ...g.steps.slice(1),
        ],
      }),
    ).not.toEqual([]);
  });
  it("accepts the blank two-step journey", () =>
    expect(funnelGraphIssues(emptyFunnelGraph())).toEqual([]));
  it.each([
    "javascript:alert(1)",
    "//example.com",
    "https://user:pass@example.com",
    "https://example.com\\evil",
    "https://example.com/hello world",
  ])("rejects unsafe provider URL %s", (url) =>
    expect(funnelProviderUrl(url)).toBe(false),
  );
});
describe("public transition boundary", () => {
  const request = {
    action: "advance",
    token: "a".repeat(64),
    stepId: "question",
    expectedVersion: 0,
    requestId: "00000000-0000-4000-8000-000000000001",
    answer: "guided",
  };
  it("accepts bounded stable choice IDs", () =>
    expect(parseFunnelRequest(request)).toEqual(request));
  it.each([
    "nextStepId",
    "paid",
    "completed",
    "bookingConfirmed",
    "email",
    "income",
  ])("rejects client field %s", (key) =>
    expect(() =>
      parseFunnelRequest({ ...request, [key]: "arbitrary" }),
    ).toThrow(),
  );
  it.each([
    null,
    [],
    { action: "constructor" },
    { ...request, answer: "my private business details" },
    { ...request, expectedVersion: -1 },
    { ...request, token: "short" },
  ])("rejects malformed request %#", (value) =>
    expect(() => parseFunnelRequest(value)).toThrow(),
  );
});
