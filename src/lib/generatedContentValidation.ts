/**
 * Strict shape check for a generated resource's content_json before an admin
 * save. The public renderer silently drops malformed fields (its schema uses
 * .catch fallbacks), so a renamed key or a wrong type in "Edit JSON" would
 * remove sections from a live page without any error. This rejects those
 * saves with the exact path of each problem.
 */

export interface ContentValidationResult {
  ok: boolean;
  errors: string[];
}

type Json = Record<string, unknown>;

const ITEM_LIST_KEYS = [
  "items",
  "checklist_items",
  "tools",
  "templates",
  "steps",
  "faqs",
  "questions",
] as const;

/** Item fields that must be non-empty text, per content type slug. */
const ITEM_TITLE_RULES: Record<string, { anyOf?: string[]; all?: string[] }> = {
  "tool-roundups": { anyOf: ["name", "tool_name"] },
  "ideas-use-cases": { anyOf: ["idea", "name"] },
  "implementation-checklists": { anyOf: ["task"] },
  "strategy-guides": { anyOf: ["strategy", "name"] },
  "templates-frameworks": { anyOf: ["template_name", "name"] },
  "faq-collections": { all: ["question", "answer"] },
};

const GENERIC_ITEM_TITLES = [
  "name",
  "title",
  "tool_name",
  "idea",
  "strategy",
  "step",
  "task",
  "template_name",
  "heading",
  "question",
];

const isObject = (v: unknown): v is Json =>
  !!v && typeof v === "object" && !Array.isArray(v);

const hasText = (v: unknown) => typeof v === "string" && v.trim().length > 0;

function checkItem(
  item: unknown,
  path: string,
  schemaSlug: string,
  errors: string[],
) {
  if (!isObject(item)) {
    errors.push(`${path}: each item must be an object`);
    return;
  }
  const rule = ITEM_TITLE_RULES[schemaSlug];
  if (rule?.all) {
    for (const key of rule.all)
      if (!hasText(item[key])) errors.push(`${path}.${key}: text is required`);
    return;
  }
  const keys = rule?.anyOf ?? GENERIC_ITEM_TITLES;
  if (!keys.some((k) => hasText(item[k])))
    errors.push(`${path}: needs a ${keys.join(" or ")} field with text`);
}

function checkSections(doc: Json, schemaSlug: string, errors: string[]): void {
  const key = doc.sections !== undefined ? "sections" : "categories";
  const sections = doc[key];
  if (sections === undefined) {
    errors.push("sections: a sections (or categories) list is required");
    return;
  }
  if (!Array.isArray(sections)) {
    errors.push(`${key}: must be a list of sections`);
    return;
  }
  if (sections.length === 0) {
    errors.push(`${key}: add at least one section`);
    return;
  }
  sections.forEach((section, i) => {
    const path = `${key}.${i}`;
    if (!isObject(section)) {
      errors.push(`${path}: each section must be an object`);
      return;
    }
    let itemCount = 0;
    for (const listKey of ITEM_LIST_KEYS) {
      const list = section[listKey];
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        errors.push(`${path}.${listKey}: must be a list`);
        continue;
      }
      list.forEach((item, j) =>
        checkItem(item, `${path}.${listKey}.${j}`, schemaSlug, errors),
      );
      itemCount += list.length;
    }
    if (itemCount === 0)
      errors.push(
        `${path}: needs an items (or checklist_items) list with at least one item`,
      );
  });
}

function checkFaqs(doc: Json, errors: string[]) {
  const faqs = doc.frequently_asked_questions;
  if (faqs === undefined) return;
  if (!Array.isArray(faqs)) {
    errors.push("frequently_asked_questions: must be a list");
    return;
  }
  faqs.forEach((faq, i) => {
    const path = `frequently_asked_questions.${i}`;
    if (!isObject(faq)) {
      errors.push(`${path}: each FAQ must be an object`);
      return;
    }
    for (const key of ["question", "answer"])
      if (!hasText(faq[key])) errors.push(`${path}.${key}: text is required`);
  });
}

function checkOptionalFields(doc: Json, errors: string[]) {
  const stringFields = ["title", "hero_image", "hero_image_alt"];
  for (const key of stringFields)
    if (doc[key] !== undefined && typeof doc[key] !== "string")
      errors.push(`${key}: must be text`);
  if (doc.pro_tips !== undefined) {
    if (!Array.isArray(doc.pro_tips)) errors.push("pro_tips: must be a list");
    else
      doc.pro_tips.forEach((tip, i) => {
        if (typeof tip !== "string" && !isObject(tip))
          errors.push(`pro_tips.${i}: must be text or an object`);
      });
  }
  if (doc.sources !== undefined) {
    if (!Array.isArray(doc.sources)) errors.push("sources: must be a list");
    else
      doc.sources.forEach((src, i) => {
        if (!isObject(src) || !hasText(src.url))
          errors.push(`sources.${i}.url: a link is required`);
      });
  }
  if (doc.expert_callout !== undefined) {
    if (!isObject(doc.expert_callout) || !hasText(doc.expert_callout.quote))
      errors.push("expert_callout: must be an object with quote text");
  }
}

/** Validate content_json for a content type (content_schemas.slug). */
export function validateGeneratedContent(
  value: unknown,
  schemaSlug: string,
): ContentValidationResult {
  if (!isObject(value))
    return {
      ok: false,
      errors: ["Content must be a JSON object ({ ... }), not a list or value"],
    };
  const errors: string[] = [];
  if (!hasText(value.intro)) errors.push("intro: text is required");
  checkSections(value, schemaSlug, errors);
  checkFaqs(value, errors);
  checkOptionalFields(value, errors);
  return { ok: errors.length === 0, errors };
}

/** True when the content has FAQ items under any key the site uses. */
export function hasFaqItems(value: unknown): boolean {
  if (!isObject(value)) return false;
  return ["frequently_asked_questions", "faq_items", "faqs"].some(
    (key) => Array.isArray(value[key]) && (value[key] as unknown[]).length > 0,
  );
}
