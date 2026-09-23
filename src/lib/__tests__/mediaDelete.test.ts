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
