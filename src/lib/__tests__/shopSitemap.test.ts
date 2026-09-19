import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadShopSitemapOffers,
  type ShopDiscoveryRow,
} from "../../../supabase/functions/_shared/shopDiscovery";

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  errors: {} as Record<string, string>,
  reads: [] as {
    table: string;
    columns: string;
    filters: [string, unknown][];
  }[],
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const read = { table, columns: "", filters: [] as [string, unknown][] };
      db.reads.push(read);
      const rows = () =>
        (db.tables[table] ?? []).filter((row) =>
          read.filters.every(([field, value]) => row[field] === value),
        );
      const error = () =>
        db.errors[table] ? { message: db.errors[table] } : null;
      const query = {
        select: (columns: string) => {
          read.columns = columns;
          return query;
        },
        eq: (field: string, value: unknown) => {
          read.filters.push([field, value]);
          return query;
        },
        order: () => query,
        limit: () => query,
        range: async (from: number, to: number) => ({
          data: rows().slice(from, to + 1),
          error: error(),
        }),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: error() }),
      };
      return query;
    },
  }),
}));
import { buildSitemapXml } from "@/lib/feeds.server";

const listed: ShopDiscoveryRow = {
  title: "Practical toolkit",
  slug: "practical-toolkit",
  status: "published",
  show_in_shop: true,
  funnel_only: false,
  updated_at: "2026-09-19T00:00:00Z",
};
beforeEach(() => {
  db.reads.length = 0;
  db.errors = {};
  db.tables = {
    site_settings: [
      { site_name: "Member Site", site_url: "https://member.example" },
    ],
    offers: [
      { ...listed },
      { ...listed, slug: "unlisted-magnet", show_in_shop: false },
      { ...listed, slug: "private-upsell", funnel_only: true },
      { ...listed, slug: "draft-toolkit", status: "draft" },
      { ...listed, slug: "archived-toolkit", status: "archived" },
    ],
    posts: [
      {
        slug: "existing-article",
        title: "Existing article",
        status: "published",
        updated_at: listed.updated_at,
      },
    ],
  };
});

describe("opt-in shop discovery", () => {
  it("adds the shop and only listed standalone published offers without changing existing article URLs", async () => {
    const xml = await buildSitemapXml();
    expect(xml).toContain("<loc>https://member.example/shop</loc>");
    expect(xml).toContain(
      "<loc>https://member.example/offers/practical-toolkit</loc>",
    );
    expect(xml).toContain(
      "<loc>https://member.example/blog/existing-article</loc>",
    );
    for (const privateSlug of [
      "unlisted-magnet",
      "private-upsell",
      "draft-toolkit",
      "archived-toolkit",
    ])
      expect(xml).not.toContain(privateSlug);
    const query = db.reads.find((read) => read.table === "offers")!;
    expect(query.filters).toEqual([
      ["status", "published"],
      ["show_in_shop", true],
      ["funnel_only", false],
    ]);
    expect(query.columns).not.toMatch(
      /asset_path|email|token|stripe|next_offer/,
    );
  });
  it("never represents a failed shop read as a successfully empty sitemap", async () => {
    db.errors.offers = "permission denied";
    await expect(buildSitemapXml()).rejects.toThrow(
      "Shop sitemap read failed: permission denied",
    );
  });
  it("guards visibility and strips extra columns even if a caller supplies unfiltered rows", async () => {
    const result = await loadShopSitemapOffers(async () => ({
      data: db.tables.offers.map((row) => ({
        ...row,
        asset_path: "private/file.pdf",
        email: "private@example.com",
      })) as unknown as ShopDiscoveryRow[],
      error: null,
    }));
    expect(result).toEqual([
      { title: listed.title, slug: listed.slug, updated_at: listed.updated_at },
    ]);
  });
  it("pages beyond 1,000 records and does not stop on a full page containing hidden offers", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      ...listed,
      slug: `offer-${i}`,
      show_in_shop: i === 1000,
    }));
    const read = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));
    const result = await loadShopSitemapOffers(read);
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.map((row) => row.slug)).toEqual(["offer-1000"]);
  });
  it("fails on a later page instead of publishing a partial discovery list", async () => {
    await expect(
      loadShopSitemapOffers(async (from) =>
        from === 0
          ? {
              data: Array.from({ length: 1000 }, (_, i) => ({
                ...listed,
                slug: `offer-${i}`,
              })),
              error: null,
            }
          : { data: null, error: { message: "network unavailable" } },
      ),
    ).rejects.toThrow("network unavailable");
  });
});
