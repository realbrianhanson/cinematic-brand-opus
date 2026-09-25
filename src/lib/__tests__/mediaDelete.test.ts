import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  deleteMedia,
  escapeLikePattern,
  findMediaUsage,
  usageNeedles,
} from "../mediaDelete";

type Result = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

type Call = { table: string; op: string; args: unknown[] };

/**
 * Minimal chainable fake of the supabase-js query builder. Every filter call
 * is recorded, and awaiting the chain resolves to whatever `respond` returns
 * for the recorded calls.
 */
function fakeClient(
  respond: (table: string, calls: Call[]) => Result,
  storage: { remove?: (paths: string[]) => Result } = {},
) {
  const calls: Call[] = [];
  const removed: string[][] = [];
  const from = (table: string) => {
    const own: Call[] = [];
    const builder: Record<string, unknown> = {};
    for (const op of [
      "select",
      "ilike",
      "eq",
      "limit",
      "delete",
      "in",
      "order",
      "range",
    ]) {
      builder[op] = (...args: unknown[]) => {
        const call = { table, op, args };
        own.push(call);
        calls.push(call);
        return builder;
      };
    }
    builder.then = (
      resolve: (value: Result) => unknown,
      reject: (reason: unknown) => unknown,
    ) => {
      try {
        return Promise.resolve(respond(table, own)).then(resolve, reject);
      } catch (err) {
        return Promise.reject(err).then(resolve, reject);
      }
    };
    return builder;
  };
  const client = {
    from,
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push([bucket, ...paths]);
          return storage.remove
            ? storage.remove(paths)
            : { data: [{ name: paths[0] }], error: null };
        },
      }),
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls, removed };
}

const item = {
  id: "media-1",
  name: "hero.png",
  file_path: "photos/100-abc.png",
  url: "https://x.supabase.co/storage/v1/object/public/blog-images/photos/100-abc.png",
};

const empty: Result = { data: [], error: null, count: 0 };

describe("escapeLikePattern", () => {
  it("escapes LIKE wildcards and the escape character", () => {
    expect(escapeLikePattern("a_b%c\\d")).toBe("a\\_b\\%c\\\\d");
  });
});

describe("usageNeedles", () => {
  it("searches for the storage path, plus its URL-encoded form when it differs", () => {
    expect(usageNeedles(item)).toEqual(["%photos/100-abc.png%"]);
    expect(
      usageNeedles({ ...item, file_path: "photos/my file_1%.png" }),
    ).toEqual([
      "%photos/my file\\_1\\%.png%",
      "%photos/my\\%20file\\_1\\%25.png%",
    ]);
  });

  it("falls back to the URL when the path is blank and never matches everything", () => {
    expect(usageNeedles({ ...item, file_path: "  " })).toEqual([
      `%${item.url}%`,
    ]);
    expect(usageNeedles({ ...item, file_path: "", url: "" })).toEqual([]);
  });
});

describe("findMediaUsage", () => {
  it("checks posts, SEO images, topic guides, generated pages, offers and news items", async () => {
    const { client, calls } = fakeClient(() => empty);
    const usage = await findMediaUsage(item, client);
    expect(usage).toEqual({
      total: 0,
      truncated: false,
      titles: [],
      references: [],
    });
    const checked = calls
      .filter((c) => c.op === "ilike")
      .map((c) => `${c.table}.${String(c.args[0])}`);
    expect(checked.sort()).toEqual(
      [
        "generated_pages.seo_meta->>og_image",
        "offers.body",
        "offers.cover_url",
        "pillar_pages.content",
        "pillar_pages.seo_meta->>og_image",
        "posts.content",
        "posts.featured_image",
        "seo_metadata.og_image",
        "source_items.image_url",
      ].sort(),
    );
    for (const call of calls.filter((c) => c.op === "ilike")) {
      expect(call.args[1]).toBe("%photos/100-abc.png%");
    }
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("dedupes a post found by both featured image and body, and names each page", async () => {
    const { client } = fakeClient((table, own) => {
      const column = own.find((c) => c.op === "ilike")?.args[0];
      if (table === "posts" && column === "featured_image")
        return {
          data: [{ id: "p1", title: "AI agents" }],
          error: null,
          count: 1,
        };
      if (table === "posts" && column === "content")
        return {
          data: [
            { id: "p1", title: "AI agents" },
            { id: "p2", title: "Hiring" },
          ],
          error: null,
          count: 2,
        };
      if (table === "seo_metadata")
        return {
          data: [{ post_id: "p2", posts: { title: "Hiring" } }],
          error: null,
          count: 1,
        };
      if (table === "pillar_pages" && column === "content")
        return { data: [{ id: "g1", title: "Guide" }], error: null, count: 1 };
      if (table === "offers" && column === "cover_url")
        return { data: [{ id: "o1", title: "Course" }], error: null, count: 1 };
      if (table === "source_items")
        return {
          data: [{ id: "n1", title: "Raw", ai_title: "News" }],
          error: null,
          count: 1,
        };
      return empty;
    });
    const usage = await findMediaUsage(item, client);
    expect(usage.total).toBe(5);
    expect(usage.truncated).toBe(false);
    expect(usage.titles).toEqual([
      "AI agents",
      "Hiring",
      "Guide",
      "Course",
      "News",
    ]);
    expect(usage.references.map((r) => `${r.kind}:${r.id}`)).toEqual([
      "post:p1",
      "post:p2",
      "topic_guide:g1",
      "offer:o1",
      "news_item:n1",
    ]);
  });

  it("flags truncated results when a query matched more rows than it returned", async () => {
    const { client } = fakeClient((table, own) => {
      const column = own.find((c) => c.op === "ilike")?.args[0];
      if (table === "posts" && column === "content")
        return { data: [{ id: "p1", title: "One" }], error: null, count: 90 };
      return empty;
    });
    const usage = await findMediaUsage(item, client);
    expect(usage.total).toBe(90);
    expect(usage.truncated).toBe(true);
  });

  it("fails loudly when any usage query fails instead of reporting zero uses", async () => {
    const { client } = fakeClient((table) =>
      table === "offers"
        ? { data: null, error: { message: "permission denied" } }
        : empty,
    );
    await expect(findMediaUsage(item, client)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("finds nested media in offer pages, drafts, versions, resources and branding", async () => {
    const { client } = fakeClient((table, own) => {
      if (!own.some((c) => c.op === "range")) return empty;
      const nested = { blocks: [{ image: { src: item.url } }] };
      const data = {
        offers: [{ id: "offer", title: "Workshop", presentation: nested }],
        generated_pages: [
          { id: "resource", title: "Workbook", content_json: nested },
        ],
        offer_builder_drafts: [
          {
            offer_id: "offer",
            offers: { title: "Workshop" },
            document: nested,
          },
        ],
        offer_builder_revisions: [
          {
            id: "revision",
            version: 2,
            offers: { title: "Workshop" },
            document: nested,
          },
        ],
        site_branding: [{ id: true, settings: nested }],
      }[table];
      return { data: data ?? [], count: data?.length ?? 0, error: null };
    });
    const usage = await findMediaUsage(item, client);
    expect(usage.total).toBe(5);
    expect(usage.titles).toEqual([
      "Workbook",
      "Workshop",
      "Workshop (saved draft)",
      "Workshop (version 2)",
      "Site branding and homepage",
    ]);
  });

  it("checks documents after the first page and deduplicates published offer matches", async () => {
    const { client, calls } = fakeClient((table, own) => {
      if (table !== "offers") return empty;
      const range = own.find((c) => c.op === "range");
      if (!range)
        return own.some((c) => c.op === "ilike" && c.args[0] === "cover_url")
          ? {
              data: [{ id: "found", title: "Workshop" }],
              count: 1,
              error: null,
            }
          : empty;
      if (range.args[0] === 0)
        return {
          data: Array.from({ length: 200 }, (_, i) => ({
            id: `other-${i}`,
            title: "Other",
            presentation: {},
          })),
          count: 201,
          error: null,
        };
      return {
        data: [
          { id: "found", title: "Workshop", presentation: { image: item.url } },
        ],
        count: 201,
        error: null,
      };
    });
    const usage = await findMediaUsage(item, client);
    expect(usage.total).toBe(1);
    expect(calls).toContainEqual({
      table: "offers",
      op: "range",
      args: [200, 399],
    });
  });

  it("fails as unknown when a structured scan errors or exceeds its budget", async () => {
    const failed = fakeClient((table) =>
      table === "site_branding"
        ? {
            data: null,
            count: null,
            error: { message: "branding unavailable" },
          }
        : empty,
    );
    await expect(findMediaUsage(item, failed.client)).rejects.toThrow(
      /branding unavailable/,
    );
    const oversized = fakeClient((table) =>
      table === "offer_builder_revisions"
        ? { data: [], count: 5001, error: null }
        : empty,
    );
    await expect(findMediaUsage(item, oversized.client)).rejects.toThrow(
      /too large/,
    );
  });

  it("matches encoded filenames literally and never scans an empty path", async () => {
    const encodedItem = { file_path: "photos/my image_1%.png", url: "" };
    const { client } = fakeClient((table) =>
      table === "site_branding"
        ? {
            data: [
              {
                id: true,
                settings: {
                  image: "https://cdn.test/photos/my%20image_1%25.png",
                },
              },
            ],
            count: 1,
            error: null,
          }
        : empty,
    );
    expect((await findMediaUsage(encodedItem, client)).total).toBe(1);
    const blank = fakeClient(() => empty);
    expect(
      (await findMediaUsage({ file_path: "", url: "" }, blank.client)).total,
    ).toBe(0);
    expect(blank.calls).toEqual([]);
  });
});

describe("deleteMedia", () => {
  it("deletes the media row before removing the stored object", async () => {
    const order: string[] = [];
    const { client, calls, removed } = fakeClient(
      (table, own) => {
        if (table === "media" && own.some((c) => c.op === "delete")) {
          order.push("row");
          return { data: [{ id: item.id }], error: null };
        }
        return empty;
      },
      {
        remove: (paths) => {
          order.push("storage");
          return { data: [{ name: paths[0] }], error: null };
        },
      },
    );
    await expect(deleteMedia(item, client)).resolves.toEqual({
      storageError: null,
    });
    expect(order).toEqual(["row", "storage"]);
    expect(calls).toContainEqual({
      table: "media",
      op: "eq",
      args: ["id", item.id],
    });
    expect(removed).toEqual([["blog-images", item.file_path]]);
  });

  it("does not touch storage when the row delete fails", async () => {
    const { client, removed } = fakeClient(() => ({
      data: null,
      error: { message: "rls denied" },
    }));
    await expect(deleteMedia(item, client)).rejects.toThrow(/rls denied/);
    expect(removed).toEqual([]);
  });

  it("does not touch storage when no row was deleted", async () => {
    const { client, removed } = fakeClient(() => ({ data: [], error: null }));
    await expect(deleteMedia(item, client)).rejects.toThrow(/wasn't deleted/);
    expect(removed).toEqual([]);
  });

  it("reports a storage failure after the row is gone without throwing", async () => {
    const { client } = fakeClient(
      () => ({ data: [{ id: item.id }], error: null }),
      { remove: () => ({ data: null, error: { message: "storage down" } }) },
    );
    await expect(deleteMedia(item, client)).resolves.toEqual({
      storageError: "storage down",
    });
  });

  it("reports when storage removed nothing", async () => {
    const { client } = fakeClient(
      () => ({ data: [{ id: item.id }], error: null }),
      { remove: () => ({ data: [], error: null }) },
    );
    const result = await deleteMedia(item, client);
    expect(result.storageError).toMatch(/not found/i);
  });
});
