import { z } from "zod";

const short = z.string().max(300);
const copy = z.string().max(6000);
const httpsUrl = z
  .string()
  .max(2048)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !/[\s\\]/.test(value)
      );
    } catch {
      return false;
    }
  }, "Use a complete HTTPS URL without credentials or spaces.");

export const sectionTypes = [
  "text",
  "problem",
  "benefits",
  "method",
  "deliverables",
  "proof",
  "faq",
  "guarantee",
  "image",
  "video",
  "cta",
] as const;
export const sectionLabels: Record<(typeof sectionTypes)[number], string> = {
  text: "Sales copy",
  problem: "The problem",
  benefits: "Benefits",
  method: "How it works",
  deliverables: "What you get",
  proof: "Proof & testimonial",
  faq: "Questions & objections",
  guarantee: "Guarantee & terms",
  image: "Image & demonstration",
  video: "Video walkthrough",
  cta: "Call to action",
};
export const offerSectionSchema = z
  .object({
    id: z.string().min(1).max(80),
    type: z.enum(sectionTypes),
    heading: short,
    body: copy,
    imageUrl: httpsUrl,
    caption: z.string().max(500),
    proofId: z.string().max(80),
  })
  .strict();
export const offerPageSchema = z
  .object({
    headline: short,
    subheadline: z.string().max(1000),
    eyebrow: z.string().max(100),
    ctaText: z.string().max(80),
    ctaMicrocopy: z.string().max(500),
    focusMode: z.boolean(),
    sections: z.array(offerSectionSchema).max(30),
  })
  .strict();
export const offerPresentationSchema = z
  .object({
    version: z.literal(1),
    landing: offerPageSchema,
    upsell: offerPageSchema,
    thankYou: z
      .object({
        headline: short,
        body: z.string().max(2000),
        firstStep: z.string().max(2000),
      })
      .strict(),
  })
  .strict();
export const offerStrategySchema = z
  .object({
    audience: z.string().max(2000),
    traffic: z.enum(["cold", "email", "organic", "referral", "customer"]),
    problem: z.string().max(2000),
    outcome: z.string().max(2000),
    mechanism: z.string().max(2000),
    deliverables: z.string().max(3000),
    objections: z.string().max(3000),
    evidence: z.string().max(3000),
    adMessage: z.string().max(2000),
  })
  .strict();
export const offerBuilderSchema = z
  .object({
    version: z.literal(1),
    strategy: offerStrategySchema,
    presentation: offerPresentationSchema,
    proofIds: z.array(z.string().uuid()).max(30),
  })
  .strict();
export type OfferSection = z.infer<typeof offerSectionSchema>;
export type OfferPage = z.infer<typeof offerPageSchema>;
export type OfferPresentation = z.infer<typeof offerPresentationSchema>;
export type OfferStrategy = z.infer<typeof offerStrategySchema>;
export type OfferBuilder = z.infer<typeof offerBuilderSchema>;
export type OfferProof = {
  id: string;
  title: string;
  kind: "testimonial" | "demonstration" | "fact";
  content: string;
  attribution: string;
  source_url: string;
  notes: string;
  approved: boolean;
  created_at: string;
  updated_at: string;
};

export function emptyPage(): OfferPage {
  return {
    headline: "",
    subheadline: "",
    eyebrow: "",
    ctaText: "",
    ctaMicrocopy: "",
    focusMode: false,
    sections: [],
  };
}
export function emptyBuilder(): OfferBuilder {
  return {
    version: 1,
    strategy: {
      audience: "",
      traffic: "organic",
      problem: "",
      outcome: "",
      mechanism: "",
      deliverables: "",
      objections: "",
      evidence: "",
      adMessage: "",
    },
    presentation: {
      version: 1,
      landing: emptyPage(),
      upsell: emptyPage(),
      thankYou: { headline: "", body: "", firstStep: "" },
    },
    proofIds: [],
  };
}
export function readPresentation(value: unknown): OfferPresentation | null {
  const result = offerPresentationSchema.safeParse(value);
  return result.success ? result.data : null;
}
export function builderFromOffer(
  offer?: { presentation?: unknown } | null,
): OfferBuilder {
  const builder = emptyBuilder();
  const presentation = readPresentation(offer?.presentation);
  if (presentation) builder.presentation = presentation;
  return builder;
}
export function newSection(type: OfferSection["type"] = "text"): OfferSection {
  return {
    id: crypto.randomUUID(),
    type,
    heading: "",
    body: "",
    imageUrl: "",
    caption: "",
    proofId: "",
  };
}
export function pageRecipe(
  kind: "lead-magnet" | "sales" | "upsell",
): OfferPage {
  const page = emptyPage();
  page.focusMode = true;
  const types: OfferSection["type"][] =
    kind === "lead-magnet"
      ? ["benefits", "deliverables", "image", "faq", "cta"]
      : kind === "upsell"
        ? ["benefits", "method", "proof", "faq", "cta"]
        : [
            "problem",
            "method",
            "benefits",
            "deliverables",
            "proof",
            "faq",
            "cta",
          ];
  page.sections = types.map((type) => ({
    ...newSection(type),
    heading: sectionLabels[type],
  }));
  return page;
}

export function reviewOffer(
  builder: OfferBuilder,
): { title: string; detail: string }[] {
  const issues: { title: string; detail: string }[] = [];
  if (!builder.strategy.audience.trim())
    issues.push({
      title: "Name the buyer",
      detail: "Describe the person and situation this offer is designed for.",
    });
  if (!builder.strategy.outcome.trim())
    issues.push({
      title: "Make the promise concrete",
      detail: "Explain what the buyer should be able to do with the product.",
    });
  if (!builder.strategy.deliverables.trim())
    issues.push({
      title: "Spell out what they receive",
      detail: "List the files, resources, or access included in the price.",
    });
  if (!builder.strategy.evidence.trim() && !builder.proofIds.length)
    issues.push({
      title: "Support the argument",
      detail:
        "Add a real demonstration, relevant testimonial, or documented evidence.",
    });
  if (!builder.strategy.objections.trim())
    issues.push({
      title: "Answer the hesitation",
      detail: "Capture the buyer’s main questions about fit, effort, or value.",
    });
  for (const [role, page] of Object.entries({
    landing: builder.presentation.landing,
    upsell: builder.presentation.upsell,
  })) {
    if (page.sections.some((s) => s.type === "guarantee" && !s.body.trim()))
      issues.push({
        title: `Complete the ${role} guarantee`,
        detail:
          "Describe only terms you actually offer, or remove this section.",
      });
    if (
      page.sections.some(
        (s) => (s.type === "image" || s.type === "video") && !s.imageUrl,
      )
    )
      issues.push({
        title: `Add the ${role} demonstration`,
        detail: "An image or video section is missing its HTTPS media address.",
      });
  }
  return issues;
}

/** Only allow a controlled embed URL; arbitrary URLs are shown as links. */
export function offerVideoEmbed(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (["www.youtube.com", "youtube.com", "youtu.be"].includes(url.hostname)) {
      const id =
        url.hostname === "youtu.be"
          ? url.pathname.slice(1)
          : url.searchParams.get("v") ||
            url.pathname.match(/^\/embed\/([\w-]+)$/)?.[1];
      return id && /^[\w-]{11}$/.test(id)
        ? `https://www.youtube-nocookie.com/embed/${id}`
        : null;
    }
    if (
      ["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(url.hostname)
    ) {
      const id = url.pathname.match(/(?:\/video)?\/(\d+)$/)?.[1];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    /* Invalid media remains unavailable. */
  }
  return null;
}
