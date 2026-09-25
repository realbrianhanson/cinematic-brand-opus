import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json, Tables } from "@/integrations/supabase/types";

/** Bucket every admin media upload writes to. */
export const MEDIA_BUCKET = "blog-images";

/** How many rows each usage query returns before the result is marked truncated. */
const USAGE_ROW_LIMIT = 50;

export type MediaFile = Pick<
  Tables<"media">,
  "id" | "name" | "file_path" | "url"
>;

export type MediaUsageKind =
  | "post"
  | "topic_guide"
  | "generated_page"
  | "offer"
  | "news_item"
  | "offer_draft"
  | "offer_revision"
  | "site_branding";

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
 * Searchable text fields. Matching is by substring of the
 * storage path so resized or re-hosted variants of the same URL still count.
 * Structured page, funnel and branding documents are checked separately.
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

const rawUsageNeedles = (item: Pick<MediaFile, "file_path" | "url">) => {
  const path = item.file_path.trim();
  const base = path || item.url.trim();
  return base ? [...new Set(path ? [base, safeEncodeURI(base)] : [base])] : [];
};

/** Inspect values, including nested image blocks, without treating % or _ as wildcards. */
function documentUsesMedia(
  value: Json | undefined,
  needles: string[],
): boolean {
  if (typeof value === "string")
    return needles.some((needle) => value.includes(needle));
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((child) =>
    documentUsesMedia(child, needles),
  );
}

type DocumentRow = UsageRow & { value: Json };
type DocumentPage = {
  rows: DocumentRow[];
  count: number | null;
  error: QueryError;
};
const DOCUMENT_PAGE_SIZE = 200;
const DOCUMENT_SCAN_LIMIT = 5000;

/** Fail as unknown if the scan cannot finish; never call a partly checked file unused. */
async function checkDocuments(
  kind: MediaUsageKind,
  needles: string[],
  load: (from: number, to: number) => PromiseLike<DocumentPage>,
) {
  const matches: UsageRow[] = [];
  let count = 0;
  for (let from = 0; from < DOCUMENT_SCAN_LIMIT; from += DOCUMENT_PAGE_SIZE) {
    const page = await load(from, from + DOCUMENT_PAGE_SIZE - 1);
    if (page.error) return { kind, rows: [], count: 0, error: page.error };
    if (page.count !== null && page.count > DOCUMENT_SCAN_LIMIT) {
      throw new Error(
        "Couldn't finish checking saved documents. This library is too large for a complete usage check.",
      );
    }
    for (const row of page.rows) {
      if (!documentUsesMedia(row.value, needles)) continue;
      count++;
      if (matches.length < USAGE_ROW_LIMIT)
        matches.push({ id: row.id, title: row.title });
    }
    if (
      page.rows.length < DOCUMENT_PAGE_SIZE ||
      (page.count !== null && from + page.rows.length >= page.count)
    ) {
      return { kind, rows: matches, count, error: null };
    }
  }
  throw new Error(
    "Couldn't finish checking saved documents. File usage is unknown.",
  );
}

function structuredUsageChecks(client: Client, needles: string[]) {
  return [
    checkDocuments("generated_page", needles, (from, to) =>
      client
        .from("generated_pages")
        .select("id, title, content_json", COUNTED)
        .order("id")
        .range(from, to)
        .then(({ data, count, error }) => ({
          rows: (data ?? []).map((r) => ({ ...r, value: r.content_json })),
          count,
          error,
        })),
    ),
    checkDocuments("offer", needles, (from, to) =>
      client
        .from("offers")
        .select("id, title, presentation", COUNTED)
        .order("id")
        .range(from, to)
        .then(({ data, count, error }) => ({
          rows: (data ?? []).map((r) => ({ ...r, value: r.presentation })),
          count,
          error,
        })),
    ),
    checkDocuments("offer_draft", needles, (from, to) =>
      client
        .from("offer_builder_drafts")
        .select("offer_id, document, offers(title)", COUNTED)
        .order("offer_id")
        .range(from, to)
        .then(({ data, count, error }) => ({
          rows: (data ?? []).map((r) => ({
            id: r.offer_id,
            title: `${r.offers?.title || "Untitled offer"} (saved draft)`,
            value: r.document,
          })),
          count,
          error,
        })),
    ),
    checkDocuments("offer_revision", needles, (from, to) =>
      client
        .from("offer_builder_revisions")
        .select("id, document, version, offers(title)", COUNTED)
        .order("id")
        .range(from, to)
        .then(({ data, count, error }) => ({
          rows: (data ?? []).map((r) => ({
            id: r.id,
            title: `${r.offers?.title || "Untitled offer"} (version ${r.version})`,
            value: r.document,
          })),
          count,
          error,
        })),
    ),
    checkDocuments("site_branding", needles, (from, to) =>
      client
        .from("site_branding")
        .select("id, settings", COUNTED)
        .order("id")
        .range(from, to)
        .then(({ data, count, error }) => ({
          rows: (data ?? []).map((r) => ({
            id: String(r.id),
            title: "Site branding and homepage",
            value: r.settings,
          })),
          count,
          error,
        })),
    ),
  ];
}

/**
 * ILIKE patterns that find a file inside stored HTML or URL columns. Uses the
 * storage path (plus its URL-encoded form when different) and falls back to
 * the full URL. Returns nothing rather than a match-everything pattern.
 */
export function usageNeedles(item: Pick<MediaFile, "file_path" | "url">) {
  return rawUsageNeedles(item).map((v) => `%${escapeLikePattern(v)}%`);
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
  const results = await Promise.all([
    ...jobs,
    ...(needles.length
      ? structuredUsageChecks(client, rawUsageNeedles(item))
      : []),
  ]);

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
