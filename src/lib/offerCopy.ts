import { z } from "zod";
import { offerStrategySchema, type OfferPage } from "./offerBuilder";

export const offerCopyModes = {
  angles: "Three sales angles",
  headline: "Strengthen the headline",
  section: "Improve a section",
  objections: "Answer buyer objections",
  upsell: "Write the upsell transition",
} as const;
const editableSectionTypes = [
  "text",
  "problem",
  "benefits",
  "method",
  "deliverables",
  "faq",
  "cta",
] as const;
export const offerCopyRequestSchema = z
  .object({
    mode: z.enum(["angles", "headline", "section", "objections", "upsell"]),
    stage: z.enum(["landing", "upsell"]),
    strategy: offerStrategySchema,
    offer: z
      .object({
        title: z.string().max(300),
        summary: z.string().max(1000),
        body: z.string().max(12000),
        kind: z.enum(["free", "paid"]),
        amount_minor: z.number().int().min(0).max(99999999),
        currency: z.string().regex(/^[a-zA-Z]{3}$/),
      })
      .strict(),
    currentCopy: z
      .object({
        headline: z.string().max(300),
        subheadline: z.string().max(1000),
        section: z
          .object({
            id: z.string().min(1).max(80),
            type: z.enum(editableSectionTypes),
            heading: z.string().max(300),
            body: z.string().max(6000),
          })
          .strict()
          .optional(),
      })
      .strict(),
    proofIds: z.array(z.string().uuid()).max(30),
    instruction: z.string().max(1000),
  })
  .strict()
  .refine((input) => input.mode !== "section" || !!input.currentCopy.section, {
    message: "Choose a sales-copy section first.",
  });

const common = {
  title: z.string().min(1).max(120),
  explanation: z.string().max(1500),
  evidenceIds: z.array(z.string().uuid()).max(8),
  missingFacts: z.array(z.string().max(400)).max(6),
};
export const offerCopySuggestionSchema = z.discriminatedUnion("target", [
  z
    .object({
      ...common,
      target: z.literal("headline"),
      headline: z.string().min(1).max(300),
      subheadline: z.string().max(1000),
    })
    .strict(),
  z
    .object({
      ...common,
      target: z.literal("section"),
      heading: z.string().max(300),
      body: z.string().min(1).max(6000),
    })
    .strict(),
]);
export const offerCopyResponseSchema = z
  .object({
    suggestions: z.array(offerCopySuggestionSchema).min(1).max(3),
    warnings: z.array(z.string().max(500)).max(6),
  })
  .strict();
export type OfferCopyRequest = z.infer<typeof offerCopyRequestSchema>;
export type OfferCopyResponse = z.infer<typeof offerCopyResponseSchema>;
export type OfferCopySuggestion = z.infer<typeof offerCopySuggestionSchema>;
export type OfferCopyProduct = OfferCopyRequest["offer"];

/** Only copy fields can change. Payment terms, proof and guarantees are never AI targets. */
export function applyOfferCopy(
  page: OfferPage,
  suggestion: OfferCopySuggestion,
  request: Pick<OfferCopyRequest, "mode" | "currentCopy">,
): OfferPage {
  if (suggestion.target === "headline")
    return {
      ...page,
      headline: suggestion.headline,
      subheadline: suggestion.subheadline,
    };
  const selectedId =
    request.mode === "section" ? request.currentCopy.section?.id : undefined;
  if (selectedId) {
    return {
      ...page,
      sections: page.sections.map((section) =>
        section.id === selectedId &&
        (editableSectionTypes as readonly string[]).includes(section.type)
          ? { ...section, heading: suggestion.heading, body: suggestion.body }
          : section,
      ),
    };
  }
  if (page.sections.length >= 30)
    throw new Error(
      "This page already has 30 sections. Remove one before adding this suggestion.",
    );
  return {
    ...page,
    sections: [
      ...page.sections,
      {
        id: crypto.randomUUID(),
        type: request.mode === "objections" ? "faq" : "text",
        heading: suggestion.heading,
        body: suggestion.body,
        imageUrl: "",
        caption: "",
        proofId: "",
      },
    ],
  };
}

export function canEditOfferSection(type: string): boolean {
  return (editableSectionTypes as readonly string[]).includes(type);
}
