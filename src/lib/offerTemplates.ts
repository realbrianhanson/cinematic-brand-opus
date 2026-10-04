import {
  emptyBuilder,
  newSection,
  pageRecipe,
  type OfferPage,
  type OfferRecipeContext,
  type OfferRecipeKind,
  type OfferSection,
} from "./offerBuilder";
import { fillOfferPage } from "./offerDrafts";

export const offerTemplates = [
  {
    id: "direct-sales",
    title: "The clear sales argument",
    description:
      "Start with the problem, show the useful result, explain the method, then make the offer.",
    label: "Product sales",
    recipe: "sales",
    order: [
      "problem",
      "benefits",
      "method",
      "deliverables",
      "proof",
      "faq",
      "cta",
    ],
  },
  {
    id: "resource-showcase",
    title: "The useful first win",
    description:
      "Lead with what the resource helps people do, show what is inside and make the next action clear.",
    label: "Free resources",
    recipe: "lead-magnet",
    order: [
      "benefits",
      "image",
      "deliverables",
      "method",
      "proof",
      "faq",
      "cta",
    ],
  },
  {
    id: "concise-follow-up",
    title: "The relevant next step",
    description:
      "Put the included resources first, explain their additional benefit and answer the decision questions.",
    label: "Upsells & downsells",
    recipe: "upsell",
    order: ["deliverables", "benefits", "proof", "faq", "cta"],
  },
] as const satisfies readonly {
  id: string;
  title: string;
  description: string;
  label: string;
  recipe: OfferRecipeKind;
  order: readonly OfferSection["type"][];
}[];
export type OfferTemplateId = (typeof offerTemplates)[number]["id"];

export function offerTemplatePage(
  id: OfferTemplateId,
  context?: OfferRecipeContext,
): OfferPage {
  const template = offerTemplates.find((item) => item.id === id)!;
  const base = pageRecipe(template.recipe, context);
  // The resource layout includes a process section; borrow its established recipe.
  const process = pageRecipe("sales", context).sections.find(
    (section) => section.type === "method",
  )!;
  return {
    ...base,
    sections: template.order.map(
      (type) =>
        base.sections.find((section) => section.type === type) ||
        (type === "method" ? process : newSection(type)),
    ),
  };
}

/** Applying a layout rearranges real sections, retaining all manual copy and media. */
export function proposeOfferTemplate(
  current: OfferPage,
  id: OfferTemplateId,
  context: OfferRecipeContext,
) {
  const template = offerTemplatePage(id, context);
  const result = fillOfferPage(current, template);
  const order: readonly OfferSection["type"][] = offerTemplates.find(
    (item) => item.id === id,
  )!.order;
  const sorted = order.flatMap((type) =>
    result.page.sections.filter((section) => section.type === type),
  );
  const additional = result.page.sections.filter(
    (section) => !order.includes(section.type),
  );
  // Keep extra custom content before the final call to action.
  const lastAction = sorted.findIndex((section) => section.type === "cta");
  const sections =
    lastAction < 0
      ? [...sorted, ...additional]
      : [
          ...sorted.slice(0, lastAction),
          ...additional,
          ...sorted.slice(lastAction),
        ];
  return {
    page: { ...result.page, sections },
    omittedSections: result.omittedSections,
  };
}

/** Example copy is used only in gallery previews, never by the apply function. */
export function offerTemplateExample(id: OfferTemplateId): OfferPage {
  const example = offerTemplatePage(id, {
    strategy: {
      ...emptyBuilder().strategy,
      problem: "Too many ideas can make your next launch feel harder to plan.",
      outcome:
        "- Choose one clear offer\n- Turn your ideas into a practical plan",
      mechanism:
        "- Define the customer\n- Outline the offer\n- Plan your next step",
      deliverables: "- Offer planning workbook\n- Launch checklist",
    },
    offer: {
      title: "Make a plan for your next launch",
      summary:
        "Example workbook, clear prompts and a checklist to help organize your next step.",
      kind: id === "resource-showcase" ? "free" : "paid",
    },
  });
  example.headline =
    id === "concise-follow-up"
      ? "Put your plan into practice"
      : id === "resource-showcase"
        ? "Your next launch, mapped out"
        : "Make a plan for your next launch";
  example.eyebrow = "Example layout · sample copy";
  example.sections = example.sections.map((section, index) => ({
    ...section,
    id: `${id}-example-${section.type}-${index}`,
    ...(section.type === "faq"
      ? {
          body: "## What is included in this example?\nA sample workbook and checklist. Replace this with your confirmed product details.",
        }
      : {}),
  }));
  return example;
}
