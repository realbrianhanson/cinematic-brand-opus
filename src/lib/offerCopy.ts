import { z } from "zod";
import {
  offerStrategySchema,
  sectionTypes,
  type OfferPage,
} from "./offerBuilder";

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
const pageContextSchema = z
  .object({
    eyebrow: z.string().max(100),
    ctaText: z.string().max(80),
    ctaMicrocopy: z.string().max(500),
    sections: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            type: z.enum(sectionTypes),
            heading: z.string().max(300),
            body: z.string().max(6000),
            caption: z.string().max(500),
            proofId: z.string().max(80),
            hasMedia: z.boolean(),
            truncated: z.boolean(),
          })
          .strict(),
      )
      .max(30),
  })
  .strict()
  .refine(
    (page) =>
      page.sections.reduce(
        (size, section) => size + section.body.length + section.caption.length,
        0,
      ) <= 24000,
    "Page context is too long.",
  );

/** Preserve page order and every section's purpose; expose omitted text instead of hiding it. */
export function buildOfferPageCopyContext(
  page: OfferPage,
): z.infer<typeof pageContextSchema> {
  let remaining = 24000;
  // Terms get first use of the budget so ordinary copy cannot crowd them out.
  const excerpts = new Map<
    OfferPage["sections"][number],
    { body: string; caption: string; truncated: boolean }
  >();
  for (const section of [
    ...page.sections.filter((item) => item.type === "guarantee"),
    ...page.sections.filter((item) => item.type !== "guarantee"),
  ]) {
    const body = section.body.slice(
      0,
      Math.min(remaining, section.type === "guarantee" ? 6000 : 1200),
    );
    remaining -= body.length;
    const caption = section.caption.slice(0, Math.min(remaining, 500));
    remaining -= caption.length;
    excerpts.set(section, {
      body,
      caption,
      truncated:
        body.length < section.body.length ||
        caption.length < section.caption.length,
    });
  }
  return {
    eyebrow: page.eyebrow,
    ctaText: page.ctaText,
    ctaMicrocopy: page.ctaMicrocopy,
    sections: page.sections.map((section) => ({
      id: section.id,
      type: section.type,
      heading: section.heading,
      ...excerpts.get(section)!,
      proofId: section.proofId,
      hasMedia: !!section.imageUrl,
    })),
  };
}

export const offerCopyRequestSchema = z
  .object({
    mode: z.enum(["angles", "headline", "section", "objections", "upsell"]),
    stage: z.enum(["landing", "upsell"]),
    savedOfferId: z.string().uuid().optional(),
    strategy: offerStrategySchema,
    offer: z
      .object({
        title: z.string().max(300),
        summary: z.string().max(1000),
        body: z.string().max(12000),
        kind: z.enum(["free", "paid"]),
        checkout_mode: z.enum(["native", "external"]).optional(),
        price_display_mode: z.enum(["fixed", "provider"]).optional(),
        amount_minor: z.number().int().min(0).max(99999999),
        currency: z.string().regex(/^[a-zA-Z]{3}$/),
      })
      .strict(),
    currentCopy: z
      .object({
        headline: z.string().max(300),
        subheadline: z.string().max(1000),
        page: pageContextSchema.optional(),
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
