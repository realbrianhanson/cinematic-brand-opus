/**
 * Helpers for the admin Resources (generated_pages) list and editor:
 * row-by-row publishing with a summary, readable publish-gate errors,
 * selection hygiene, and title/slug checks.
 */
import {
  lintPageTitle,
  PAGE_SLUG_MAX_LENGTH,
  PAGE_TITLE_MAX_LENGTH,
} from "../../supabase/functions/_shared/voice";

/** Minimum quality score the generated_pages publish trigger accepts. */
export const PUBLISH_SCORE_THRESHOLD = 75;
/** Titles above this are refused outright (the composer targets 70). */
export const RESOURCE_TITLE_HARD_LIMIT = 100;

/** Plain-English next step for errors raised by validate_generated_pages_status. */
export function friendlyPublishError(message: string): string {
  if (/quality_score is not set/i.test(message))
    return "Not scored yet. Open the page and run the quality check.";
  const low = message.match(
    /quality_score ([\d.]+) is below the 75 threshold/i,
  );
  if (low)
    return `Score ${low[1]} is below ${PUBLISH_SCORE_THRESHOLD}. Open the page to improve it or publish with an override.`;
  return message;
}

export interface PublishedRow {
  id: string;
  title: string;
}
export interface BlockedRow {
  id: string;
  title: string;
  reason: string;
}
export interface BulkPublishResult {
  published: PublishedRow[];
  blocked: BlockedRow[];
}

const messageOf = (e: unknown) =>
  e instanceof Error
    ? e.message
    : e && typeof e === "object" && "message" in e
      ? String((e as { message: unknown }).message)
      : "Unknown error";

/**
 * Publish pages one at a time: re-score each on the server, skip any below the
 * threshold, and keep going when one fails. Callers fire post-publish side
 * effects only for `published`.
 */
export async function publishPagesOneByOne(input: {
  ids: string[];
  titleFor: (id: string) => string;
  scorePage: (id: string) => Promise<{ score: number; issues: string[] }>;
  publishPage: (id: string) => Promise<void>;
}): Promise<BulkPublishResult> {
  const published: PublishedRow[] = [];
  const blocked: BlockedRow[] = [];
  for (const id of input.ids) {
    const title = input.titleFor(id);
    try {
      const { score } = await input.scorePage(id);
      if (!(score >= PUBLISH_SCORE_THRESHOLD)) {
        blocked.push({
          id,
          title,
          reason: `Score ${score} is below ${PUBLISH_SCORE_THRESHOLD}. Open the page to improve it or publish with an override.`,
        });
        continue;
      }
      await input.publishPage(id);
      published.push({ id, title });
    } catch (e) {
      blocked.push({ id, title, reason: friendlyPublishError(messageOf(e)) });
    }
  }
  return { published, blocked };
}

export function bulkResultSummary(result: BulkPublishResult): string {
  const { published, blocked } = result;
  if (!published.length && !blocked.length) return "Nothing to publish";
  const parts = [`${published.length} published`];
  if (blocked.length) parts.push(`${blocked.length} blocked`);
  return parts.join(", ");
}

/** Keep only selected ids that are still visible under the current filters. */
export function keepVisibleSelection(
  selected: ReadonlySet<string>,
  visible: ReadonlyArray<{ id: string }>,
): Set<string> {
  return new Set(visible.filter((p) => selected.has(p.id)).map((p) => p.id));
}

/** Null when the slug is usable, otherwise a sentence explaining why not. */
export function validateResourceSlug(slug: string): string | null {
  const s = slug.trim();
  if (!s) return "A URL slug is required.";
  if (s.length > PAGE_SLUG_MAX_LENGTH)
    return `Keep the URL slug to ${PAGE_SLUG_MAX_LENGTH} characters or fewer.`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))
    return "Use lowercase letters, numbers and single hyphens only (for example ai-tools-for-roofers).";
  return null;
}

/** Hard error (blocks save) plus soft warnings for a resource title. */
export function validateResourceTitle(title: string): {
  error: string | null;
  warnings: string[];
} {
  const t = title.trim();
  if (!t) return { error: "A title is required.", warnings: [] };
  if (t.length > RESOURCE_TITLE_HARD_LIMIT)
    return {
      error: `Titles are limited to ${RESOURCE_TITLE_HARD_LIMIT} characters (aim for ${PAGE_TITLE_MAX_LENGTH}).`,
      warnings: [],
    };
  return { error: null, warnings: lintPageTitle(t).map((f) => f.message) };
}
