import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";

/** Bucket every admin media upload writes to. */
export const MEDIA_BUCKET = "blog-images";

/** How many rows each usage query returns before the result is marked truncated. */
const USAGE_ROW_LIMIT = 50;

export type MediaFile = Pick<
  Tables<"media">,
  "id" | "name" | "file_path" | "url"
>;

export type MediaUsageKind =
  "post" | "topic_guide" | "generated_page" | "offer" | "news_item";

export interface MediaUsageRef {
  kind: MediaUsageKind;
  id: string;
  title: string;
}

export interface MediaUsage {
  /** Distinct pages that reference the file (a lower bound when truncated). */
  total: number;
  /** True when at least one query matched more rows than it returned. */
  truncated: boolean;
  /** Page titles in check order, one per distinct page. */
  titles: string[];
  references: MediaUsageRef[];
}

export interface DeleteMediaResult {
  /** Set when the row is gone but the stored object could not be removed. */
  storageError: string | null;
}

type Client = SupabaseClient<Database>;
type QueryError = { message: string } | null;
type UsageRow = { id: string; title: string | null };
type CheckResult = {
  rows: UsageRow[];
  count: number | null;
  error: QueryError;
};

interface UsageCheck {
  kind: MediaUsageKind;
  run: (client: Client, pattern: string) => PromiseLike<CheckResult>;
}

const titled = (
  data: UsageRow[] | null,
  count: number | null,
  error: QueryError,
) => ({
  rows: data ?? [],
  count,
  error,
});

const COUNTED = { count: "exact" as const };

/**
 * Every place a media URL can be stored. Matching is by substring of the
 * storage path so resized or re-hosted variants of the same URL still count.
 * generated_pages.content_json is structured JSON that PostgREST cannot
 * pattern-match; those pages get images from their OG field, checked here.
 */
const USAGE_CHECKS: UsageCheck[] = [
  {
    kind: "post",
    run: (c, p) =>
      c
        .from("posts")
        .select("id, title", COUNTED)
        .ilike("featured_image", p)
        .limit(USAGE_ROW_LIMIT)
        .then(({ data, count, error }) => titled(data, count, error)),
  },
  {
    kind: "post",
    run: (c, p) =>
      c
        .from("posts")
        .select("id, title", COUNTED)
        .ilike("content", p)
        .limit(USAGE_ROW_LIMIT)
        .then(({ data, count, error }) => titled(data, count, error)),
  },
  {
    kind: "post",
    run: (c, p) =>
      c
        .from("seo_metadata")
        .select("post_id, posts(title)", COUNTED)
        .ilike("og_image", p)
        .limit(USAGE_ROW_LIMIT)
        .then(({ data, count, error }) => ({
          rows: (data ?? []).map((row) => ({
            id: row.post_id,
            title: row.posts?.title ?? null,
          })),
          count,
          error,
        })),
  },
  {
    kind: "topic_guide",
    run: (c, p) =>
      c
        .from("pillar_pages")
        .select("id, title", COUNTED)
        .ilike("content", p)
        .limit(USAGE_ROW_LIMIT)
        .then(({ data, count, error }) => titled(data, count, error)),
  },
  {
    kind: "topic_guide",
    run: (c, p) =>
      c
        .from("pillar_pages")
        .select("id, title", COUNTED)
        .ilike("seo_meta->>og_image", p)
        .limit(USAGE_ROW_LIMIT)
        .then(({ data, count, error }) => titled(data, count, error)),
  },
  {
    kind: "generated_page",
    run: (c, p) =>
      c
        .from("generated_pages")
        .select("id, title", COUNTED)
        .ilike("seo_meta->>og_image", p)
        .limit(USAGE_ROW_LIMIT)
        .then(({ data, count, error }) => titled(data, count, error)),
  },
  {
    kind: "offer",
    run: (c, p) =>
      c
        .from("offers")
        .select("id, title", COUNTED)
        .ilike("cover_url", p)
        .limit(USAGE_ROW_LIMIT)
        .then(({ data, count, error }) => titled(data, count, error)),
  },
  {
    kind: "offer",
    run: (c, p) =>
      c
        .from("offers")
        .select("id, title", COUNTED)
        .ilike("body", p)
        .limit(USAGE_ROW_LIMIT)
        .then(({ data, count, error }) => titled(data, count, error)),
  },
  {
    kind: "news_item",
    run: (c, p) =>
      c
        .from("source_items")
        .select("id, title, ai_title", COUNTED)
        .ilike("image_url", p)
        .limit(USAGE_ROW_LIMIT)
        .then(({ data, count, error }) => ({
          rows: (data ?? []).map((row) => ({
            id: row.id,
            title: row.ai_title ?? row.title,
          })),
          count,
          error,
        })),
  },
];

/** Escapes LIKE/ILIKE wildcards so a path only matches itself. */
export const escapeLikePattern = (value: string) =>
  value.replace(/[\\%_]/g, "\\$&");

const safeEncodeURI = (value: string) => {
  try {
    return encodeURI(value);
  } catch {
    return value;
  }
};

/**
 * ILIKE patterns that find a file inside stored HTML or URL columns. Uses the
 * storage path (plus its URL-encoded form when different) and falls back to
 * the full URL. Returns nothing rather than a match-everything pattern.
 */
export function usageNeedles(item: Pick<MediaFile, "file_path" | "url">) {
  const path = item.file_path.trim();
  const base = path || item.url.trim();
  if (!base) return [];
  const variants = path ? [base, safeEncodeURI(base)] : [base];
  return [...new Set(variants)].map((v) => `%${escapeLikePattern(v)}%`);
}

/**
 * Read-only check of every page that references the file. Throws when any
 * query fails, so callers never mistake an unknown result for "unused".
 */
export async function findMediaUsage(
  item: Pick<MediaFile, "file_path" | "url">,
  client: Client = supabase,
): Promise<MediaUsage> {
  const needles = usageNeedles(item);
  const jobs = needles.flatMap((needle) =>
    USAGE_CHECKS.map((check) =>
      Promise.resolve(check.run(client, needle)).then((result) => ({
        kind: check.kind,
        ...result,
      })),
    ),
  );
  const results = await Promise.all(jobs);

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    throw new Error(
      `Couldn't check where this file is used: ${failed.error.message}`,
    );
  }

  const seen = new Map<string, MediaUsageRef>();
  let truncated = false;
  let largestCount = 0;
  for (const result of results) {
    const count = result.count ?? result.rows.length;
    largestCount = Math.max(largestCount, count);
    if (count > result.rows.length) truncated = true;
    for (const row of result.rows) {
      const key = `${result.kind}:${row.id}`;
      if (!seen.has(key)) {
        seen.set(key, {
          kind: result.kind,
          id: row.id,
          title: row.title?.trim() || "Untitled",
        });
      }
    }
  }

  const references = [...seen.values()];
  return {
    total: Math.max(references.length, largestCount),
    truncated,
    titles: references.map((r) => r.title),
    references,
  };
}

/**
 * Deletes the media row first, then the stored object. A failed row delete
 * throws and leaves storage untouched. A failed storage removal after the row
 * is gone is returned, not thrown: an orphaned object is harmless, while a
 * library row pointing at a missing file is not.
 */
export async function deleteMedia(
  item: Pick<MediaFile, "id" | "file_path">,
  client: Client = supabase,
): Promise<DeleteMediaResult> {
  const { data, error } = await client
    .from("media")
    .delete()
    .eq("id", item.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(
      "The file wasn't deleted. It may already be gone, or your account can't delete it.",
    );
  }

  const { data: removed, error: storageErr } = await client.storage
    .from(MEDIA_BUCKET)
    .remove([item.file_path]);
  if (storageErr) {
    console.error("Media row deleted but storage removal failed:", storageErr);
    return { storageError: storageErr.message };
  }
  if (!removed || removed.length === 0) {
    return { storageError: "Stored file not found, nothing to remove" };
  }
  return { storageError: null };
}
