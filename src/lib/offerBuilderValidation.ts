import type { ZodIssue } from "zod";
import {
  offerBuilderSchema,
  sectionLabels,
  type OfferBuilder,
  type OfferSection,
} from "./offerBuilder";

export type OfferStep = "strategy" | "pages" | "next" | "delivery" | "review";
/** One problem, the field it belongs to and the builder step that edits it. */
export type OfferIssue = { step: OfferStep; field: string; message: string };

export const offerStepTitles: Record<OfferStep, string> = {
  strategy: "Strategy",
  pages: "Pages",
  next: "Next step",
  delivery: "Delivery",
  review: "Review",
};

const strategyFields: Record<string, string> = {
  audience: "Who is this for?",
  traffic: "Where are visitors coming from?",
  problem: "What is getting in their way?",
  outcome: "What will they be able to do?",
  mechanism: "Why does your approach work?",
  deliverables: "What exactly do they receive?",
  objections: "What might stop them?",
  evidence: "What can you demonstrate?",
  adMessage: "What brought them here?",
};
const pageNames: Record<string, string> = {
  landing: "Landing page",
  upsell: "Upsell presentation",
  thankYou: "Thank-you page",
};
const pageFields: Record<string, string> = {
  headline: "headline",
  subheadline: "supporting promise",
  eyebrow: "eyebrow",
  ctaText: "button text",
  ctaMicrocopy: "reassurance below the button",
  focusMode: "focus setting",
  body: "copy",
  firstStep: "first action",
};
const sectionFields: Record<string, string> = {
  heading: "heading",
  body: "copy",
  imageUrl: "media URL",
  caption: "caption",
  proofId: "proof link",
  id: "identifier",
  type: "type",
};

function fieldName(path: (string | number)[], builder: OfferBuilder): string {
  const [area, first, second, third, fourth] = path;
  if (area === "strategy")
    return strategyFields[String(first)] || "Strategy brief";
  if (area === "proofIds") return "Selected proof";
  if (area !== "presentation") return "Offer page";
  const page = pageNames[String(first)] || "Page";
  if (second !== "sections" || typeof third !== "number")
    return second ? `${page} ${pageFields[String(second)] || second}` : page;
  const stage = first as "landing" | "upsell";
  const section = builder.presentation[stage]?.sections[third] as
    OfferSection | undefined;
  const label = section ? ` (${sectionLabels[section.type]})` : "";
  const field = fourth ? ` ${sectionFields[String(fourth)] || fourth}` : "";
  return `${page} · section ${third + 1}${label}${field}`;
}

function issueMessage(issue: ZodIssue): string {
  if (issue.code === "too_big" && typeof issue.maximum === "number")
    return `Keep this to ${issue.maximum.toLocaleString("en-US")} ${issue.type === "array" ? "items" : "characters"} or fewer.`;
  if (issue.code === "custom") return issue.message;
  if (issue.code === "invalid_string" && issue.validation === "uuid")
    return "Choose the evidence again from the proof library.";
  return "This value could not be read. Re-enter it and try again.";
}

/** Type, length and URL problems in the builder, named for the admin. */
export function builderIssues(builder: OfferBuilder): OfferIssue[] {
  const result = offerBuilderSchema.safeParse(builder);
  if (result.success) return [];
  const seen = new Set<string>();
  return result.error.issues.flatMap((issue) => {
    const field = fieldName(issue.path, builder);
    const message = issueMessage(issue);
    const key = `${field}\u0000${message}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const step: OfferStep =
      issue.path[0] === "presentation" ? "pages" : "strategy";
    return [{ step, field, message }];
  });
}

/** A readable single-line summary, e.g. for an alert. */
export const describeIssue = (issue: OfferIssue) =>
  `${issue.field}: ${issue.message}`;
