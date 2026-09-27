import {
  pageRecipe,
  sectionLabels,
  type OfferBuilder,
  type OfferPage,
  type OfferRecipeContext,
  type OfferRecipeKind,
  type OfferSection,
} from "./offerBuilder";

export type OfferDraftStage = "landing" | "upsell";
export type OfferDraftChange = {
  stage: OfferDraftStage;
  label: string;
  before: string;
  after: string;
};

const textFields = [
  "headline",
  "subheadline",
  "eyebrow",
  "ctaText",
  "ctaMicrocopy",
] as const;
const fieldLabels: Record<(typeof textFields)[number], string> = {
  headline: "Headline",
  subheadline: "Supporting promise",
  eyebrow: "Eyebrow",
  ctaText: "Button text",
  ctaMicrocopy: "Button reassurance",
};

/** Fill empty copy only. Linked proof is never rewritten, even when empty. */
export function fillOfferSection(
  current: OfferSection,
  suggested: OfferSection,
): OfferSection {
  if (current.proofId || ["proof", "image", "video"].includes(current.type))
    return { ...current };
  return {
    ...current,
    heading: current.heading.trim() ? current.heading : suggested.heading,
    body: current.body.trim() ? current.body : suggested.body,
  };
}

/** Keep every existing section in place; do not duplicate a populated section type. */
export function fillOfferPage(
  current: OfferPage,
  suggested: OfferPage,
): { page: OfferPage; omittedSections: number } {
  const page = {
    ...current,
    sections: current.sections.map((item) => ({ ...item })),
  };
  for (const key of textFields) {
    if (!page[key].trim()) page[key] = suggested[key];
  }
  const empty =
    !current.sections.length && !textFields.some((key) => current[key].trim());
  if (empty) page.focusMode = suggested.focusMode;
  let omittedSections = 0;
  for (const section of suggested.sections) {
    const existing = page.sections.findIndex(
      (item) => item.type === section.type && !item.proofId,
    );
    if (existing >= 0) {
      page.sections[existing] = fillOfferSection(
        page.sections[existing],
        section,
      );
    } else if (page.sections.some((item) => item.type === section.type)) {
      // Evidence linked to the library is its own source of truth.
      continue;
    } else if (page.sections.length < 30) {
      page.sections.push({ ...section });
    } else {
      omittedSections += 1;
    }
  }
  return { page, omittedSections };
}

export function offerPageChanges(
  current: OfferPage,
  next: OfferPage,
  stage: OfferDraftStage,
): OfferDraftChange[] {
  const changes: OfferDraftChange[] = [];
  for (const key of textFields) {
    if (current[key] !== next[key])
      changes.push({
        stage,
        label: fieldLabels[key],
        before: current[key],
        after: next[key],
      });
  }
  for (const section of next.sections) {
    const prior = current.sections.find((item) => item.id === section.id);
    if (!prior) {
      changes.push({
        stage,
        label: `Add ${sectionLabels[section.type]}`,
        before: "",
        after: section.body || "Empty section to complete or remove",
      });
    } else {
      for (const key of ["heading", "body"] as const) {
        if (prior[key] !== section[key])
          changes.push({
            stage,
            label: `${sectionLabels[section.type]} ${key === "body" ? "copy" : "heading"}`,
            before: prior[key],
            after: section[key],
          });
      }
    }
  }
  if (current.focusMode !== next.focusMode)
    changes.push({
      stage,
      label: "Page focus",
      before: current.focusMode ? "Focused" : "Shop navigation",
      after: next.focusMode ? "Focused" : "Shop navigation",
    });
  return changes;
}

export function offerDraftRecipe(
  context: OfferRecipeContext,
  stage: OfferDraftStage,
): OfferRecipeKind {
  return stage === "upsell"
    ? "upsell"
    : context.offer.kind === "free" &&
        context.offer.checkout_mode !== "external"
      ? "lead-magnet"
      : "sales";
}

/** A first draft assembled from supplied facts; no model or private notes. */
export function proposeOfferDraft(
  current: OfferBuilder,
  context: OfferRecipeContext,
  stages: readonly OfferDraftStage[] = ["landing"],
) {
  const builder: OfferBuilder = {
    ...current,
    presentation: { ...current.presentation },
  };
  const changes: OfferDraftChange[] = [];
  let omittedSections = 0;
  for (const stage of new Set(stages)) {
    const suggested = pageRecipe(offerDraftRecipe(context, stage), context);
    const result = fillOfferPage(current.presentation[stage], suggested);
    builder.presentation[stage] = result.page;
    changes.push(
      ...offerPageChanges(current.presentation[stage], result.page, stage),
    );
    omittedSections += result.omittedSections;
  }
  return { builder, changes, omittedSections };
}
