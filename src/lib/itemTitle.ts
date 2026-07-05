// Canonical field lookup for the "name" of a card/item across all content schemas.
// Kept in sync with ITEM_NAME_KEYS in supabase/functions/render-page/index.ts.
const ITEM_NAME_KEYS = [
  "name",
  "title",
  "tool_name",
  "idea",
  "strategy",
  "step",
  "task",
  "template_name",
  "tactic",
  "heading",
  "question",
  "mistake",
];

export function getItemTitle(item: any): string {
  if (!item || typeof item !== "object") return "";
  for (const k of ITEM_NAME_KEYS) {
    const v = item[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}
