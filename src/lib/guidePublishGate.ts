/**
 * Publish gate for topic guides (pillar_pages). Mirrors the database rule in
 * public.validate_pillar_pages_status (migration
 * 20260923152000_resources_and_guides.sql): a guide becomes published only
 * with enough body text and section headings, or through
 * public.publish_pillar_page_with_override with a recorded reason.
 */

/** Visible text characters a guide needs before it can go live. */
export const GUIDE_MIN_TEXT_CHARS = 1500;
/** <h2> section headings a guide needs before it can go live. */
export const GUIDE_MIN_SECTIONS = 3;
/** Shortest accepted override reason (the RPC enforces the same). */
export const MIN_GUIDE_OVERRIDE_REASON = 10;

/** Visible text length, measured the same way as the database guard. */
export const guideTextLength = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;

const sectionCount = (html: string | null | undefined) =>
  ((html ?? "").match(/<h2[\s>]/gi) ?? []).length;

export interface GuideReadiness {
  ok: boolean;
  issues: string[];
  textChars: number;
  sections: number;
}

export function checkGuidePublishReadiness(
  html: string | null | undefined,
): GuideReadiness {
  const textChars = guideTextLength(html);
  const sections = sectionCount(html);
  const issues: string[] = [];
  if (textChars < GUIDE_MIN_TEXT_CHARS)
    issues.push(
      `The body has ${textChars} characters of text; a published guide needs at least ${GUIDE_MIN_TEXT_CHARS}.`,
    );
  if (sections < GUIDE_MIN_SECTIONS)
    issues.push(
      `The body has ${sections} section heading${sections === 1 ? "" : "s"} (H2); a published guide needs at least ${GUIDE_MIN_SECTIONS}.`,
    );
  return { ok: issues.length === 0, issues, textChars, sections };
}

/** True when a save would move a guide from not-published to published. */
export function isPublishTransition(
  storedStatus: string | null | undefined,
  nextStatus: string,
): boolean {
  return nextStatus === "published" && storedStatus !== "published";
}
