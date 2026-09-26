import { describe, expect, it } from "vitest";
import {
  emptyBuilder,
  offerBuilderSchema,
  offerPageSchema,
  type OfferRecipeContext,
} from "../offerBuilder";
import {
  blueprintPage,
  blueprintWorkbook,
  qualifiedCallBlueprint,
  type OfferBlueprintPageRole,
} from "../offerBlueprints";

const roles: OfferBlueprintPageRole[] = [
  "invitation",
  "preparation",
  "membership",
];

const context: OfferRecipeContext = {
  offer: {
    title: "A supplied offer",
    summary: "A supplied summary",
    kind: "paid",
  },
  strategy: {
    ...emptyBuilder().strategy,
    problem: "The supplied obstacle",
    outcome: "The supplied outcome",
    mechanism: "The supplied method",
    deliverables: "The supplied inclusions",
    audience: "PRIVATE_AUDIENCE",
    evidence: "PRIVATE_EVIDENCE: unsupported testimonial and earnings",
    objections: "PRIVATE_OBJECTIONS: unresolved guarantee request",
    adMessage: "PRIVATE_AD_MESSAGE: unapproved campaign promise",
  },
};

describe("qualified call blueprint pages", () => {
  it.each(roles)(
    "creates a valid %s page in the existing builder schema",
    (role) => {
      const page = blueprintPage(role, context);
      expect(offerPageSchema.safeParse(page).success).toBe(true);
      const builder = emptyBuilder();
      builder.presentation.landing = page;
      expect(offerBuilderSchema.safeParse(builder).success).toBe(true);
      expect(page.focusMode).toBe(true);
    },
  );

  it("creates the page-specific structures and neutral action labels", () => {
    expect(
      blueprintPage("invitation").sections.map(({ type }) => type),
    ).toEqual([
      "video",
      "problem",
      "method",
      "benefits",
      "proof",
      "faq",
      "cta",
    ]);
    expect(
      blueprintPage("preparation").sections.map(({ type }) => type),
    ).toEqual(["video", "method", "deliverables", "faq", "cta"]);
    expect(
      blueprintPage("membership").sections.map(({ type }) => type),
    ).toEqual(["benefits", "deliverables", "method", "proof", "faq", "cta"]);
    expect(roles.map((role) => blueprintPage(role).ctaText)).toEqual([
      "See whether this is a fit",
      "Review the next steps",
      "See membership details",
    ]);
  });

  it("uses fresh UUIDs and independent sections on every application", () => {
    const pages = roles.flatMap((role) => [
      blueprintPage(role),
      blueprintPage(role),
    ]);
    const ids = pages.flatMap(({ sections }) => sections.map(({ id }) => id));
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) =>
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    );
    pages[0].sections[0].heading = "Changed";
    expect(pages[1].sections[0].heading).not.toBe("Changed");
  });

  it.each(roles)(
    "keeps unsupported %s content blank and does not invent claims",
    (role) => {
      const page = blueprintPage(role);
      expect(page.headline).toBe("");
      expect(page.subheadline).toBe("");
      expect(page.eyebrow).toBe("");
      expect(page.ctaMicrocopy).toBe("");
      for (const section of page.sections) {
        expect(section.body).toBe("");
        expect(section.imageUrl).toBe("");
        expect(section.caption).toBe("");
        expect(section.proofId).toBe("");
      }
      expect(JSON.stringify(page)).not.toMatch(
        /https?:|@|\$\d|guarantee|earnings|Nicholas|Kusmich|confirmed|email sent|automatically|insert |replace |add your/i,
      );
    },
  );

  it.each(roles)("reuses only explicitly allowed %s facts", (role) => {
    const page = blueprintPage(role, context);
    expect(page.headline).toBe(context.offer.title);
    expect(page.subheadline).toBe(context.offer.summary);
    const allowed = {
      problem: context.strategy.problem,
      method: context.strategy.mechanism,
      benefits: context.strategy.outcome,
      deliverables: context.strategy.deliverables,
    };
    for (const section of page.sections) {
      expect(section.body).toBe(
        allowed[section.type as keyof typeof allowed] || "",
      );
      expect(section.proofId).toBe("");
      expect(section.imageUrl).toBe("");
    }
    expect(JSON.stringify(page)).not.toContain("PRIVATE_");
    expect(context.strategy.evidence).toContain("PRIVATE_EVIDENCE");
  });

  it.each(roles)(
    "bounds long supplied values to the %s presentation contract",
    (role) => {
      const longContext: OfferRecipeContext = {
        offer: {
          ...context.offer,
          title: "t".repeat(1000),
          summary: "s".repeat(2000),
        },
        strategy: {
          ...context.strategy,
          problem: "p".repeat(2000),
          outcome: "o".repeat(2000),
          mechanism: "m".repeat(2000),
          deliverables: "d".repeat(3000),
        },
      };
      const page = blueprintPage(role, longContext);
      expect(offerPageSchema.safeParse(page).success).toBe(true);
      expect(page.headline).toHaveLength(300);
      expect(page.subheadline).toHaveLength(1000);
      expect(page.sections.every(({ body }) => body.length <= 6000)).toBe(true);
    },
  );
});

describe("blueprint setup contract", () => {
  it("maps only editable local pages to roles and leaves operational steps with providers", () => {
    expect(
      qualifiedCallBlueprint.stages
        .filter(({ kind }) => kind === "page")
        .map(({ pageRole }) => pageRole),
    ).toEqual(roles);
    expect(
      qualifiedCallBlueprint.stages
        .filter(({ kind }) => kind === "provider")
        .map(({ id }) => id),
    ).toEqual([
      "qualification",
      "qualified-calendar",
      "booking-confirmation",
      "subscription-checkout",
    ]);
    expect(
      qualifiedCallBlueprint.stages
        .filter(({ kind }) => kind === "provider")
        .every((stage) => !stage.pageRole),
    ).toBe(true);
    const checklist = qualifiedCallBlueprint.setupChecklist.join(" ");
    expect(checklist).toContain(
      "applying a layout edits only the current page",
    );
    expect(checklist).toContain("do not collect answers or create branches");
    expect(checklist).toContain(
      "No email, video-completion tracking or automatic cancellation is enabled",
    );
    expect(checklist).toContain("handoff is not proof of a booking or payment");
  });

  it("provides a reusable workbook with both routes, complete terms and explicit operational boundaries", () => {
    const workbook = blueprintWorkbook();
    expect(workbook).toBe(blueprintWorkbook());
    for (const question of qualifiedCallBlueprint.qualificationQuestions)
      expect(workbook).toContain(question);
    for (const topic of [
      "Primary route:",
      "Alternative route:",
      "Short video invitation script",
      "Qualification questions and decision rules",
      "Joining is optional",
      "Failed or abandoned booking",
      "Cancelled booking",
      "Rescheduled booking",
      "success URL alone is not verification",
      "does not enable video-completion tracking",
      "Currency and recurring charge",
      "Initial payment and total due",
      "Taxes",
      "Trial or introductory period",
      "Renewal",
      "Minimum commitment",
      "Cancellation method",
      "Cancellation deadline",
      "Cancellation effect",
      "Refund policy",
      "Failed payments",
      "Access delivery",
      "Terms and privacy",
      "Consent",
      "Flow QA before launch",
      "Measurement plan",
      "deduplication key",
      "A native one-time offer does not become a subscription",
    ])
      expect(workbook).toContain(topic);
    expect(workbook).not.toMatch(
      /https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]+|\$\d|Nicholas|Kusmich/i,
    );
  });
});
