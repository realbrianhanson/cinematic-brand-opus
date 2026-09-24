import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { withTimeout } from "@/lib/withTimeout";
import {
  isRedirectEligiblePath,
  normalizeRedirectPath,
  validateRedirectTarget,
  type RedirectStatus,
} from "../../../supabase/functions/_shared/redirectPaths";

export type RedirectRule = Tables<"redirect_rules">;
export type MissingPage = Tables<"not_found_hits">;
export type PathSuggestion = { path: string; label: string };
export type RuleDraft = {
  from_path: string;
  to_path: string;
  status_code: RedirectStatus;
  note: string | null;
};
export type DraftResult =
  { ok: true; value: RuleDraft } | { ok: false; error: string };

export const REDIRECT_KEYS = {
  missing: ["admin-redirects", "missing"],
  rules: ["admin-redirects", "rules"],
  suggestions: ["admin-redirects", "suggestions"],
} as const;

const MISSING_LIMIT = 200;
const RULES_LIMIT = 500;
const SUGGESTION_LIMIT = 1000;
const NOTE_MAX = 500;

/** Pages that exist on every build of the site. */
export const STATIC_SUGGESTIONS: PathSuggestion[] = [
  { path: "/", label: "Home page" },
  { path: "/about", label: "About" },
  { path: "/speaking", label: "Speaking" },
  { path: "/shop", label: "Shop" },
  { path: "/start-here", label: "Start here" },
  { path: "/resources", label: "Free resources" },
  { path: "/blog", label: "Blog" },
  { path: "/news", label: "News" },
  { path: "/support", label: "Support" },
];

export async function fetchMissingPages(): Promise<MissingPage[]> {
  const { data, error } = await supabase
    .from("not_found_hits")
    .select("*")
    .order("hits", { ascending: false })
    .order("last_seen", { ascending: false })
    .limit(MISSING_LIMIT);
  if (error) throw new Error(error.message);
  return [...(data ?? [])].sort(
    (a, b) => b.hits - a.hits || b.last_seen.localeCompare(a.last_seen),
  );
}

export async function fetchRedirectRules(): Promise<RedirectRule[]> {
  const { data, error } = await supabase
    .from("redirect_rules")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RULES_LIMIT);
  if (error) throw new Error(error.message);
  return data ?? [];
}

type Titled = { slug: string; title: string };

async function published<T>(query: PromiseLike<{ data: T[] | null }>) {
  try {
    return (await query).data ?? [];
  } catch {
    // Suggestions are a convenience; a failed list never blocks the page.
    return [];
  }
}

/** Published posts, guides, resources and offers as destination ideas. */
export async function fetchPathSuggestions(): Promise<PathSuggestion[]> {
  const [posts, guides, pages, offers] = await Promise.all([
    published<Titled>(
      supabase
        .from("posts")
        .select("slug, title")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(SUGGESTION_LIMIT),
    ),
    published<Titled>(
      supabase
        .from("pillar_pages")
        .select("slug, title")
        .eq("status", "published")
        .limit(SUGGESTION_LIMIT),
    ),
    published<Titled & { content_schemas: { slug: string } | null }>(
      supabase
        .from("generated_pages")
        .select("slug, title, content_schemas(slug)")
        .eq("status", "published")
        .limit(SUGGESTION_LIMIT),
    ),
    published<Titled>(
      supabase
        .from("offers")
        .select("slug, title")
        .eq("status", "published")
        .limit(SUGGESTION_LIMIT),
    ),
  ]);
  const found: PathSuggestion[] = [
    ...posts.map((p) => ({ path: `/blog/${p.slug}`, label: p.title })),
    ...guides.map((p) => ({ path: `/guides/${p.slug}`, label: p.title })),
    ...pages
      .filter((p) => p.content_schemas?.slug)
      .map((p) => ({
        path: `/resources/${p.content_schemas?.slug}/${p.slug}`,
        label: p.title,
      })),
    ...offers.map((p) => ({ path: `/offers/${p.slug}`, label: p.title })),
  ];
  const seen = new Set<string>();
  return [...STATIC_SUGGESTIONS, ...found].filter(
    (s) => !seen.has(s.path) && !!seen.add(s.path),
  );
}

export function validateRuleDraft(input: {
  from_path: string;
  to_path: string;
  status_code: number;
  note: string;
}): DraftResult {
  const from = normalizeRedirectPath(input.from_path);
  if (!from)
    return {
      ok: false,
      error: "Enter the old address as a site path like /old-page",
    };
  if (!isRedirectEligiblePath(from))
    return { ok: false, error: "That address can't be redirected" };
  const target = validateRedirectTarget(input.to_path);
  if (!target.ok) return target;
  if (
    target.value.startsWith("/") &&
    normalizeRedirectPath(target.value) === from
  )
    return { ok: false, error: "A page can't redirect to itself" };
  const note = input.note.trim();
  if (note.length > NOTE_MAX)
    return { ok: false, error: "Keep the note under 500 characters" };
  return {
    ok: true,
    value: {
      from_path: from,
      to_path: target.value,
      status_code: input.status_code === 302 ? 302 : 301,
      note: note || null,
    },
  };
}

type DbError = { code?: string; message?: string } | null;

/** Database refusals in plain words (no trailing periods, per Brian's style). */
export function friendlyRedirectError(error: unknown): string {
  const e = error as DbError;
  if (e?.code === "23505") return "There's already a rule for that address";
  if (e?.code === "22023" && e.message) return e.message.replace(/\.+$/, "");
  if (e?.code === "23514") return "Check the address and try again";
  if (e?.code === "42501" || /row-level security/i.test(e?.message ?? ""))
    return "Your account can't change redirects";
  return "The change couldn't be saved, please try again";
}

class RedirectWriteError extends Error {
  constructor(error: DbError) {
    super(friendlyRedirectError(error));
  }
}

async function write(query: PromiseLike<{ error: DbError }>) {
  const { error } = await withTimeout(Promise.resolve(query));
  if (error) throw new RedirectWriteError(error);
}

export const createRule = (draft: RuleDraft) =>
  write(supabase.from("redirect_rules").insert(draft));

export const updateRule = (
  id: string,
  patch: Partial<RuleDraft> & { is_active?: boolean },
) => write(supabase.from("redirect_rules").update(patch).eq("id", id));

export const deleteRule = (id: string) =>
  write(supabase.from("redirect_rules").delete().eq("id", id));
