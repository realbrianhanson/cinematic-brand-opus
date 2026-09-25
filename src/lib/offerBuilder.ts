import { z } from "zod";
import { hasOfferSectionContent } from "./offerSectionLayout";

const short = z.string().max(300);
const copy = z.string().max(6000);
const HOST_LABEL = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const isIpv4 = (host: string) => {
  const octets = host.split(".");
  return (
    octets.length === 4 &&
    octets.every((octet) => /^\d+$/.test(octet) && Number(octet) <= 255)
  );
};
const isIpv6 = (host: string) => {
  try {
    new URL(`https://[${host}]/`);
    return true;
  } catch {
    return false;
  }
};

/**
 * Mirrors public.offer_valid_external_url (migration
 * 20260919150000_offer_external_listings.sql) so the editor rejects exactly
 * the media, proof and destination URLs the database would reject.
 */
export function validOfferUrl(value: string): boolean {
  if (
    typeof value !== "string" ||
    Array.from(value).length > 2048 ||
    /[\s\p{Cc}\\]/u.test(value)
  )
    return false;
  const parts = /^https:\/\/([^/?#]+)([/?#].*)?$/is.exec(value);
  if (!parts) return false;
  const authority = parts[1];
  if (authority.includes("@")) return false;
  let port: string | undefined;
  if (authority.startsWith("[")) {
    const bracketed = /^\[([0-9a-fA-F:.]+)\](:([0-9]{1,5}))?$/.exec(authority);
    if (!bracketed || !isIpv6(bracketed[1])) return false;
    port = bracketed[3];
  } else {
    const named = /^([a-zA-Z0-9.-]+)(:([0-9]{1,5}))?$/.exec(authority);
    if (!named) return false;
    const host = named[1].replace(/\.+$/, "");
    port = named[3];
    if (!host.length || host.length > 253) return false;
    if (!host.split(".").every((label) => HOST_LABEL.test(label))) return false;
    if (/^[0-9.]+$/.test(host) && !isIpv4(host)) return false;
  }
  return port === undefined || Number(port) <= 65535;
}

const httpsUrl = z
  .string()
  .max(2048)
  .refine(
    (value) => !value || validOfferUrl(value),
    "Use a complete HTTPS address with a valid domain and no spaces, backslashes, username or password.",
  );

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
export type OfferRecipeKind = "lead-magnet" | "sales" | "upsell";
export type OfferAwareness = "context" | "comparing" | "ready";
export const offerAwarenessGuidance: Record<
  OfferAwareness,
  { label: string; guidance: string }
> = {
  context: {
    label: "Needs context",
    guidance:
      "Start with their situation and explain your method before presenting the included resources and proof.",
  },
  comparing: {
    label: "Comparing options",
    guidance:
      "Lead with the useful outcome, then show how the approach works, evidence and what is included.",
  },
  ready: {
    label: "Ready for this offer",
    guidance:
      "Put the included resources and benefits first. Confirm fit with evidence and answers before the decision.",
  },
};
export type OfferRecipeContext = {
  strategy: OfferStrategy;
  offer: {
    title: string;
    summary: string;
    kind: "free" | "paid";
    checkout_mode?: "native" | "external";
  };
};

/** Reuse supplied product facts only. Private evidence and unanswered objections stay private. */
export function pageRecipe(
  kind: OfferRecipeKind,
  context?: OfferRecipeContext,
  awareness?: OfferAwareness,
): OfferPage {
  const page = emptyPage();
  page.focusMode = true;
  let types: OfferSection["type"][] =
    kind === "lead-magnet"
      ? ["benefits", "deliverables", "image", "proof", "faq", "cta"]
      : kind === "upsell"
        ? ["benefits", "deliverables", "method", "proof", "faq", "cta"]
        : [
            "problem",
            "method",
            "benefits",
            "deliverables",
            "proof",
            "faq",
            "cta",
          ];
  if (awareness) {
    const order: Record<OfferAwareness, OfferSection["type"][]> = {
      context: [
        "problem",
        "method",
        "benefits",
        "deliverables",
        "image",
        "proof",
        "faq",
        "cta",
      ],
      comparing: [
        "benefits",
        "method",
        "proof",
        "deliverables",
        "image",
        "faq",
        "cta",
      ],
      ready: [
        "deliverables",
        "benefits",
        "image",
        "proof",
        "method",
        "faq",
        "cta",
      ],
    };
    const wanted = new Set(types);
    if (awareness === "context") {
      wanted.add("problem");
      wanted.add("method");
    }
    types = order[awareness].filter((type) => wanted.has(type));
  }
  const headings: Partial<Record<OfferSection["type"], string>> = {
    problem: "Does this sound familiar?",
    method: "How it works",
    benefits:
      kind === "upsell"
        ? "What this next step helps you do"
        : "What this helps you do",
    deliverables: "What’s included",
    image: "Take a look inside",
    proof: "What customers say",
    faq: "Your questions, answered",
    cta: "Ready to take the next step?",
  };
  const supplied: Partial<Record<OfferSection["type"], string>> = context
    ? {
        problem: context.strategy.problem.trim(),
        method: context.strategy.mechanism.trim(),
        benefits: context.strategy.outcome.trim(),
        deliverables: context.strategy.deliverables.trim(),
      }
    : {};
  page.sections = types.map((type) => ({
    ...newSection(type),
    heading: headings[type] || sectionLabels[type],
    body: supplied[type] || "",
  }));
  if (context) {
    const outcome = context.strategy.outcome.trim();
    page.headline =
      outcome && outcome.length <= 300
        ? outcome
        : context.offer.title.slice(0, 300);
    page.subheadline = context.offer.summary.slice(0, 1000);
    page.ctaText =
      context.offer.checkout_mode === "external"
        ? "See the offer"
        : context.offer.kind === "free"
          ? "Get the free resource"
          : "Continue to checkout";
  }
  return page;
}

export const sectionGuidance: Record<
  OfferSection["type"],
  { purpose: string; placeholder: string }
> = {
  text: {
    purpose: "Make one clear point that helps the buyer decide.",
    placeholder: "Explain why this matters to your buyer.",
  },
  problem: {
    purpose:
      "Show you understand the buyer’s current situation without exaggerating the consequences.",
    placeholder: "Describe the obstacle in your customer’s own words.",
  },
  benefits: {
    purpose:
      "Connect each benefit to a useful outcome. Start each item with - to display benefit cards.",
    placeholder:
      "- A specific task the buyer can complete\n- A practical improvement the product supports",
  },
  method: {
    purpose:
      "Explain how the buyer gets the result. Start each step with - to display a numbered process.",
    placeholder:
      "- The first action\n- What happens next\n- How to put the result to work",
  },
  deliverables: {
    purpose:
      "List actual included resources and access. Start each item with - to display inclusion cards.",
    placeholder:
      "- Resource name — what it helps them do\n- Included support or access, with its real limits",
  },
  proof: {
    purpose:
      "Use an exact testimonial with public attribution. Keep permissions and private source notes in the proof library.",
    placeholder: "Paste the exact approved quotation.",
  },
  faq: {
    purpose:
      "Use ## before each question, followed by its answer, to create an expandable FAQ. Only include answers you can confirm.",
    placeholder:
      "## Who is this for?\nYour answer.\n\n## What happens after I buy?\nYour answer.",
  },
  guarantee: {
    purpose:
      "State only your actual refund terms, eligibility, time limit, and how to request help.",
    placeholder: "Your real guarantee or refund policy.",
  },
  image: {
    purpose:
      "Show the product or a genuine demonstration. Describe what the image shows for readers using assistive technology.",
    placeholder:
      "Describe the image, including details needed to understand it.",
  },
  video: {
    purpose:
      "Show the product working. Use YouTube or Vimeo for an embedded walkthrough.",
    placeholder: "Explain what the viewer will learn from the demonstration.",
  },
  cta: {
    purpose:
      "Restate the next action. The button returns to this offer’s purchase or download controls.",
    placeholder:
      "Summarize what they get and the next step. Use only confirmed terms.",
  },
};

/** A testimonial is a quotation; facts and demonstrations are ordinary evidence copy. */
export function sectionFromProof(proof: OfferProof): OfferSection {
  return {
    ...newSection(proof.kind === "testimonial" ? "proof" : "text"),
    heading: proof.title,
    body: proof.content,
    caption: proof.attribution,
    proofId: proof.id,
  };
}

export type OfferAdvice = {
  title: string;
  detail: string;
  step: "strategy" | "pages" | "next";
  stage?: "landing" | "upsell" | "thank-you";
  sectionId?: string;
  fieldId?: string;
};
export function reviewOffer(
  builder: OfferBuilder,
  offer?: {
    title: string;
    body: string;
    checkout_mode?: string;
    funnel_only?: boolean;
  },
): OfferAdvice[] {
  const issues: OfferAdvice[] = [];
  const brief = (field: keyof OfferStrategy, title: string, detail: string) => {
    if (!builder.strategy[field].trim())
      issues.push({ title, detail, step: "strategy" });
  };
  brief(
    "audience",
    "Name the buyer",
    "Describe the person and situation this offer is designed for.",
  );
  brief(
    "outcome",
    "Make the promise concrete",
    "Explain what the buyer should be able to do with the product.",
  );
  brief(
    "deliverables",
    "Spell out what they receive",
    "List the files, resources, or access included in the price.",
  );
  if (!builder.strategy.evidence.trim() && !builder.proofIds.length)
    issues.push({
      title: "Support the argument",
      detail:
        "Add a real demonstration, relevant testimonial, or documented evidence.",
      step: "strategy",
    });
  brief(
    "objections",
    "Answer the hesitation",
    "Capture the buyer’s main questions about fit, effort, or value.",
  );
  if (["cold", "email"].includes(builder.strategy.traffic))
    brief(
      "adMessage",
      "Match the message that brought them here",
      "Add the sending ad or email, then check that the page carries through the same promise.",
    );
  for (const stage of ["landing", "upsell"] as const) {
    if (stage === "upsell" && offer?.checkout_mode === "external") continue;
    const page = builder.presentation[stage];
    const used =
      stage === "landing" ||
      offer?.funnel_only ||
      Object.values(page).some(
        (value) => typeof value === "string" && value.trim(),
      ) ||
      page.sections.length > 0;
    if (!used) continue;
    const label = stage === "landing" ? "landing page" : "upsell";
    const add = (title: string, detail: string, sectionId?: string) =>
      issues.push({
        title,
        detail,
        step: "pages",
        stage,
        ...(sectionId ? { sectionId } : {}),
      });
    if (!page.headline.trim() && !offer?.title.trim())
      add(
        `Give the ${label} a clear headline`,
        "Name the useful result before asking for a decision.",
      );
    if (!page.ctaText.trim())
      add(
        `Make the ${label} action specific`,
        "Choose a clear button label that describes the next step. The default button will still work.",
      );
    if (
      stage === "landing" &&
      builder.strategy.traffic === "cold" &&
      !page.focusMode
    )
      add(
        "Focus paid traffic on this offer",
        "Consider focus mode to remove Shop navigation and related offers from this decision.",
      );
    if (!page.sections.length && !offer?.body.trim())
      add(
        `Build the ${label} sales argument`,
        "Add the included resources, how they help, real proof, and answers to the buyer’s questions.",
      );
    if (page.sections.some(hasOfferSectionContent)) {
      for (const [type, title, detail] of [
        [
          "deliverables",
          "Make the included resources easy to find",
          "Confirm the public page names what the buyer receives, including access or support limits. Add a What you get section if it is not already clear elsewhere.",
        ],
        [
          "method",
          "Explain how the buyer gets the result",
          "Confirm the public page explains the steps or approach. Add a How it works section if that explanation is missing.",
        ],
        [
          "faq",
          "Answer the buying questions on the page",
          "Private objections do not appear on the page. Confirm the public copy answers questions about fit, effort, access and terms; add only answers you can verify.",
        ],
      ] as const) {
        if (!page.sections.some((section) => section.type === type))
          issues.push({
            title: `${title} on the ${label}`,
            detail,
            step: "pages",
            stage,
            fieldId: `offer-section-type-${stage}`,
          });
      }
    } else if (offer?.body.trim()) {
      add(
        `Review the original description on the ${label}`,
        "Check the visible original description against the buyer brief: what is included, how it works, relevant proof and answers to the buying questions. This prose needs a human review; the brief itself is private.",
      );
    }
    for (const section of page.sections) {
      const media = section.type === "image" || section.type === "video";
      if (
        (media && !section.imageUrl.trim()) ||
        (!media && section.type !== "cta" && !section.body.trim())
      ) {
        add(
          `Complete “${section.heading || sectionLabels[section.type]}” on the ${label}`,
          media
            ? "Add the demonstration’s HTTPS media address or remove this section."
            : "This section has no copy. Fill it with confirmed facts or remove it before sharing.",
          section.id,
        );
      } else if (section.type === "proof" && !section.caption.trim()) {
        add(
          `Attribute the ${label} testimonial`,
          "Add the approved public name or attribution so readers know whose words these are.",
          section.id,
        );
      }
    }
    if (
      page.sections.length &&
      !page.sections.some((section) => section.type === "cta")
    )
      add(
        `Add an action after the ${label} argument`,
        "A final call to action lets readers return to the purchase or download controls after reading.",
      );
    if (
      page.sections.some((section) => section.body.trim()) &&
      !page.sections.some(
        (section) =>
          (["proof", "image", "video"].includes(section.type) ||
            section.proofId) &&
          (section.body.trim() || section.imageUrl.trim()),
      )
    )
      add(
        `Show proof on the ${label}`,
        "Selected library evidence and private brief notes do not appear automatically. Insert relevant approved evidence or a real demonstration into the page.",
      );
  }
  if (
    offer?.checkout_mode !== "external" &&
    !builder.presentation.thankYou.firstStep.trim()
  )
    issues.push({
      title: "Give the customer a first useful action",
      detail: "Tell them where to start after opening their resource.",
      step: "pages",
      stage: "thank-you",
    });
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
