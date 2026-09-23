import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as publicColumns from "../publicColumns";
import {
  PUBLIC_GENERATED_PAGE_COLUMN_LIST,
  PUBLIC_POST_COLUMN_LIST,
  PUBLIC_SEO_METADATA_COLUMN_LIST,
} from "../publicColumns";
import { BLOG_CARD_COLUMNS } from "../publicLists";

type PublicTable = "posts" | "generated_pages" | "seo_metadata";

const ALLOWED: Record<PublicTable, readonly string[]> = {
  posts: PUBLIC_POST_COLUMN_LIST,
  generated_pages: PUBLIC_GENERATED_PAGE_COLUMN_LIST,
  seo_metadata: PUBLIC_SEO_METADATA_COLUMN_LIST,
};

/** Columns confirmed exposed to anon in production before this fix. */
const PRIVATE: Record<PublicTable, string[]> = {
  posts: [
    "fact_check",
    "fact_checked_at",
    "embedding",
    "publish_override",
    "publish_override_reason",
    "publish_override_at",
    "publish_override_by",
    "draft_claim_token",
    "lint_flags",
    "quality_score",
    "originality_score",
    "editorial_metadata",
    "opportunity_id",
    "performance_grade",
    "freshness_hours",
    "scheduled_at",
    "auto_scheduled_at",
  ],
  generated_pages: [
    "generation_cost",
    "generation_model",
    "quality_score",
    "lint_flags",
    "publish_override",
    "publish_override_reason",
    "publish_override_at",
    "publish_override_by",
    "target_keyword",
    "keyword_difficulty",
    "views",
    "refresh_count",
    "performance_trend",
    "human_edited",
  ],
  seo_metadata: [],
};

/** Top-level column names of a PostgREST select, skipping embedded resources. */
function selectedColumns(select: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of select) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts
    .filter((part) => !part.includes("("))
    .map((part) => (part.includes(":") ? part.split(":")[1] : part).trim());
}

function expectAllowlisted(table: PublicTable, select: string) {
  const columns = selectedColumns(select);
  expect(columns.length, `${table} select "${select}"`).toBeGreaterThan(0);
  for (const column of columns) {
    expect(ALLOWED[table], `${table}.${column} in "${select}"`).toContain(
      column,
    );
  }
}

describe("public column allowlists", () => {
  it("never include a private column", () => {
    for (const table of Object.keys(PRIVATE) as PublicTable[]) {
      for (const column of PRIVATE[table]) {
        expect(ALLOWED[table]).not.toContain(column);
      }
      expect(ALLOWED[table]).not.toContain("*");
    }
  });

  it("keeps the select strings in sync with the column lists", () => {
    expect(selectedColumns(publicColumns.PUBLIC_POST_COLUMNS)).toEqual([
      ...PUBLIC_POST_COLUMN_LIST,
    ]);
    expect(
      selectedColumns(publicColumns.PUBLIC_GENERATED_PAGE_COLUMNS),
    ).toEqual([...PUBLIC_GENERATED_PAGE_COLUMN_LIST]);
    expect(selectedColumns(publicColumns.PUBLIC_SEO_METADATA_COLUMNS)).toEqual([
      ...PUBLIC_SEO_METADATA_COLUMN_LIST,
    ]);
    for (const [name, value] of Object.entries(publicColumns)) {
      if (typeof value !== "string") continue;
      const table: PublicTable = name.includes("GENERATED_PAGE")
        ? "generated_pages"
        : name.includes("SEO")
          ? "seo_metadata"
          : "posts";
      expectAllowlisted(table, value);
    }
  });

  it("matches the anon column grants in the migration exactly", () => {
    const sql = readFileSync(
      "supabase/migrations/20260923111000_public_column_grants.sql",
      "utf8",
    );
    for (const table of Object.keys(ALLOWED) as PublicTable[]) {
      const match = new RegExp(
        `grant\\s+select\\s*\\(([^)]*)\\)\\s*on\\s+public\\.${table}\\s+to\\s+anon\\s*;`,
        "i",
      ).exec(sql);
      expect(match, `grant for ${table}`).not.toBeNull();
      const granted = match![1]
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      expect([...granted].sort()).toEqual([...ALLOWED[table]].sort());
    }
  });
});

// ---------------------------------------------------------------------------
// Server-side public readers (publishable key, RLS as anon)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  selects: [] as Array<{ table: string; select: string }>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (run: () => unknown) => run,
    inputValidator: (validate: (data: unknown) => unknown) => ({
      handler:
        (run: (args: { data: unknown }) => unknown) =>
        (input: { data: unknown }) =>
          run({ data: validate(input.data) }),
    }),
  }),
}));

vi.mock("../publicData.server", () => ({
  SITE_SETTINGS_PUBLIC_COLUMNS: "id, site_name",
  createPublicServerClient: () => ({
    rpc: async () => ({ data: [], error: null }),
    from: (table: string) => {
      const result = () =>
        table === "content_schemas"
          ? { data: { id: "schema-1", slug: "ideas" }, error: null }
          : { data: { id: "row-1" }, error: null };
      const query: Record<string, unknown> = {
        select: (select: string) => {
          mocks.selects.push({ table, select });
          return query;
        },
        maybeSingle: async () => result(),
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: [], error: null }),
      };
      for (const method of ["eq", "neq", "in", "order", "limit", "range"]) {
        query[method] = () => query;
      }
      return query;
    },
  }),
}));

import {
  getPublicContentType,
  getPublicGeneratedPage,
  getPublicPostBySlug,
  getPublicPostSeo,
  getPublicPostsFirstPage,
} from "../publicData.functions";

type Callable = (input: { data?: unknown }) => Promise<unknown>;
const call = (fn: unknown, data?: unknown) => (fn as Callable)({ data });

beforeEach(() => {
  mocks.selects = [];
});

describe("public server readers request only allowlisted columns", () => {
  it.each([
    ["getPublicPostBySlug", () => call(getPublicPostBySlug, { slug: "a" })],
    ["getPublicPostSeo", () => call(getPublicPostSeo, { postId: "row-1" })],
    ["getPublicPostsFirstPage", () => call(getPublicPostsFirstPage, {})],
    [
      "getPublicContentType",
      () => call(getPublicContentType, { contentType: "ideas" }),
    ],
    [
      "getPublicGeneratedPage",
      () =>
        call(getPublicGeneratedPage, { contentType: "ideas", pageSlug: "p" }),
    ],
  ])("%s", async (_name, run) => {
    await run();
    const guarded = mocks.selects.filter(
      (s): s is { table: PublicTable; select: string } => s.table in ALLOWED,
    );
    expect(guarded.length).toBeGreaterThan(0);
    for (const { table, select } of guarded) expectAllowlisted(table, select);
  });
});

// ---------------------------------------------------------------------------
// Every non-admin reader in src/ (client components included)
// ---------------------------------------------------------------------------

/** Files that only ever run for a signed-in administrator (authenticated). */
const ADMIN_ONLY = new Set(["src/lib/mediaDelete.ts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (["__tests__", "admin", "integrations"].includes(name)) return [];
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

const publicReaders = sourceFiles("src")
  .map((path) => relative(process.cwd(), path))
  .filter((path) => !ADMIN_ONLY.has(path))
  .flatMap((path) => {
    const text = readFileSync(path, "utf8");
    const found: Array<{ path: string; table: PublicTable; chain: string }> =
      [];
    const re = /\.from\("(posts|generated_pages|seo_metadata)"\)/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      // A query chain ends at the statement end or at the next table read.
      const ends = [
        text.indexOf(";", m.index),
        text.indexOf(".from(", m.index + 1),
      ].filter((i) => i !== -1);
      found.push({
        path,
        table: m[1] as PublicTable,
        chain: text.slice(m.index, ends.length ? Math.min(...ends) : undefined),
      });
    }
    return found;
  });

const constants = publicColumns as unknown as Record<string, unknown>;
const listColumns: Record<string, string> = { BLOG_CARD_COLUMNS };

describe("client and server public readers", () => {
  it("finds the known public readers", () => {
    expect(publicReaders.length).toBeGreaterThanOrEqual(15);
  });

  it.each(publicReaders.map((r) => [`${r.path} (${r.table})`, r] as const))(
    "%s selects and filters only public columns",
    (_label, { table, chain }) => {
      const select = /\.select\(\s*(?:"([^"]*)"|([A-Z_]+))/.exec(chain);
      expect(select, "reader must call .select() explicitly").not.toBeNull();
      const value =
        select![1] ??
        (constants[select![2]] as string | undefined) ??
        listColumns[select![2]];
      expect(value, `unknown select constant ${select![2]}`).toBeTypeOf(
        "string",
      );
      expectAllowlisted(table, value!);
      const filters = chain.matchAll(
        /\.(?:eq|neq|in|order|gt|gte|lt|lte|like|ilike|is)\(\s*"([a-z_]+)"/g,
      );
      for (const [, column] of filters) {
        expect(ALLOWED[table], `filter on ${table}.${column}`).toContain(
          column,
        );
      }
    },
  );
});
