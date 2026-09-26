/** Versioned journey content. Answers are stable option IDs, never free text. */
export type FunnelStep = {
  id: string;
  kind: "content" | "choice" | "offer" | "provider" | "end";
  title: string;
  body: string;
  nextStepId?: string;
  options?: { id: string; label: string }[];
  branches?: Record<string, string>;
  defaultStepId?: string;
  offerId?: string;
  url?: string;
};
export type FunnelGraph = {
  version: 1;
  entryStepId: string;
  steps: FunnelStep[];
};
export type FunnelOffer = {
  id: string;
  slug: string;
  title: string;
  checkout_mode: string;
};
export type FunnelSession = {
  title: string;
  revision: number;
  version: number;
  step: FunnelStep;
  visited: { id: string; title: string }[];
  offer: FunnelOffer | null;
};
const stableId = /^[a-z][a-z0-9-]{0,47}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function funnelProviderUrl(value: unknown): boolean {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\s\\]/.test(value) ||
    Array.from(value).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function funnelTargets(step: FunnelStep): string[] {
  return step.kind === "choice"
    ? [...Object.values(step.branches ?? {}), step.defaultStepId ?? ""]
    : step.nextStepId
      ? [step.nextStepId]
      : [];
}
/** Strict validation shared by admin, simulator and the edge handler. SQL repeats the boundary. */
export function funnelGraphIssues(input: unknown): string[] {
  const issues: string[] = [];
  if (
    !object(input) ||
    Object.keys(input).some(
      (key) => !["version", "entryStepId", "steps"].includes(key),
    ) ||
    input.version !== 1 ||
    typeof input.entryStepId !== "string" ||
    !Array.isArray(input.steps) ||
    input.steps.length < 1 ||
    input.steps.length > 30
  )
    return ["A journey needs version 1, an entry step and 1–30 steps."];
  const ids = new Set<string>();
  for (const raw of input.steps) {
    if (!object(raw)) {
      issues.push("Every step must be an object.");
      continue;
    }
    const allowed = [
      "id",
      "kind",
      "title",
      "body",
      ...(raw.kind === "choice"
        ? ["options", "branches", "defaultStepId"]
        : raw.kind === "end"
          ? []
          : raw.kind === "offer"
            ? ["offerId", "nextStepId"]
            : raw.kind === "provider"
              ? ["url", "nextStepId"]
              : ["nextStepId"]),
    ];
    if (Object.keys(raw).some((key) => !allowed.includes(key)))
      issues.push("A step contains unsupported fields.");
    if (typeof raw.id !== "string" || !stableId.test(raw.id) || ids.has(raw.id))
      issues.push("Step IDs must be unique, stable lowercase names.");
    else ids.add(raw.id);
    if (
      !["content", "choice", "offer", "provider", "end"].includes(
        String(raw.kind),
      )
    )
      issues.push("Unknown step kind.");
    if (
      typeof raw.title !== "string" ||
      !raw.title.trim() ||
      raw.title.length > 160 ||
      typeof raw.body !== "string" ||
      raw.body.length > 6000
    )
      issues.push(
        "Each step needs a title (160 characters maximum) and plain-text body (6,000 maximum).",
      );
    if (
      ["content", "offer", "provider"].includes(String(raw.kind)) &&
      (typeof raw.nextStepId !== "string" || !stableId.test(raw.nextStepId))
    )
      issues.push(`${raw.id}: choose the next step.`);
    if (
      raw.kind === "offer" &&
      (typeof raw.offerId !== "string" || !uuid.test(raw.offerId))
    )
      issues.push(`${raw.id}: select an offer.`);
    if (raw.kind === "provider" && !funnelProviderUrl(raw.url))
      issues.push(
        `${raw.id}: enter a complete HTTPS provider address without credentials.`,
      );
    if (raw.kind === "choice") {
      const opts = new Set<string>();
      if (
        !Array.isArray(raw.options) ||
        raw.options.length < 2 ||
        raw.options.length > 8
      )
        issues.push(`${raw.id}: use 2–8 choices.`);
      else
        for (const option of raw.options) {
          if (
            !object(option) ||
            Object.keys(option).some((key) => !["id", "label"].includes(key)) ||
            typeof option.id !== "string" ||
            !stableId.test(option.id) ||
            opts.has(option.id) ||
            typeof option.label !== "string" ||
            !option.label.trim() ||
            option.label.length > 200
          )
            issues.push(`${raw.id}: choices need unique IDs and labels.`);
          else opts.add(option.id);
        }
      if (
        !object(raw.branches) ||
        Object.keys(raw.branches).length > 8 ||
        Object.entries(raw.branches).some(
          ([answer, target]) =>
            !opts.has(answer) ||
            typeof target !== "string" ||
            !stableId.test(target),
        )
      )
        issues.push(
          `${raw.id}: every branch must use an existing choice and target step.`,
        );
      if (
        typeof raw.defaultStepId !== "string" ||
        !stableId.test(raw.defaultStepId)
      )
        issues.push(`${raw.id}: choose a default destination.`);
    }
  }
  if (issues.length) return issues;
  const graph = input as FunnelGraph;
  const byId = new Map(graph.steps.map((step) => [step.id, step]));
  if (!byId.has(graph.entryStepId))
    issues.push("The entry step does not exist.");
  for (const step of graph.steps)
    for (const target of funnelTargets(step))
      if (!byId.has(target))
        issues.push(`${step.id}: destination ${target} does not exist.`);
  if (issues.length) return issues;
  const seen = new Set<string>();
  const visiting = new Set<string>();
  function walk(id: string) {
    if (visiting.has(id)) {
      issues.push("Journey connections must not contain a cycle.");
      return;
    }
    if (seen.has(id)) return;
    seen.add(id);
    visiting.add(id);
    for (const target of funnelTargets(byId.get(id)!)) walk(target);
    visiting.delete(id);
  }
  walk(graph.entryStepId);
  if (seen.size !== graph.steps.length)
    issues.push("Every step must be reachable from the entry step.");
  if (!graph.steps.some((step) => step.kind === "end"))
    issues.push("Add an end step.");
  return [...new Set(issues)];
}
export function parseFunnelGraph(input: unknown): FunnelGraph {
  const issues = funnelGraphIssues(input);
  if (issues.length) throw new Error(issues.join(" "));
  return input as FunnelGraph;
}
/** Simulator only; the public runtime uses the same rules in a locked database transition. */
export function nextFunnelStep(
  graph: FunnelGraph,
  stepId: string,
  answer?: string,
): string | null {
  const step = graph.steps.find((item) => item.id === stepId);
  if (!step) throw new Error("Unknown step.");
  if (step.kind === "end") return null;
  if (step.kind !== "choice") {
    if (answer !== undefined)
      throw new Error("This step does not accept an answer.");
    return step.nextStepId!;
  }
  if (!answer || !step.options!.some((option) => option.id === answer))
    throw new Error("Choose one of the available answers.");
  return Object.hasOwn(step.branches!, answer)
    ? step.branches![answer]
    : step.defaultStepId!;
}
export const emptyFunnelGraph = (): FunnelGraph => ({
  version: 1,
  entryStepId: "welcome",
  steps: [
    {
      id: "welcome",
      kind: "content",
      title: "Start here",
      body: "Explain what this journey helps someone do.",
      nextStepId: "finish",
    },
    {
      id: "finish",
      kind: "end",
      title: "Your next step",
      body: "Keep the useful result and choose what to do next.",
    },
  ],
});
