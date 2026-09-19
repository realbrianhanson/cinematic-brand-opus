/** Public discovery is explicitly opt-in; checkout-only funnel pages stay unlisted. */
export const SHOP_DISCOVERY_COLUMNS =
  "title,slug,updated_at,status,show_in_shop,funnel_only";

export interface ShopDiscoveryRow {
  title: string;
  slug: string;
  updated_at: string;
  status: string;
  show_in_shop: boolean;
  funnel_only: boolean;
}
export type ShopSitemapOffer = Pick<
  ShopDiscoveryRow,
  "title" | "slug" | "updated_at"
>;

/** Range paging avoids Supabase's 1,000-row cap; each caller also filters at the DB. */
export async function loadShopSitemapOffers(
  readPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: ShopDiscoveryRow[] | null;
    error: { message: string } | null;
  }>,
): Promise<ShopSitemapOffer[]> {
  const offers: ShopSitemapOffer[] = [];
  const seen = new Set<string>();
  const pageSize = 1000;
  for (let page = 0; page < 200; page++) {
    const { data, error } = await readPage(
      page * pageSize,
      (page + 1) * pageSize - 1,
    );
    if (error) throw new Error(`Shop sitemap read failed: ${error.message}`);
    const rows = data ?? [];
    for (const row of rows) {
      // Keep this guard even though the query is filtered: never expand a funnel
      // or expose an unlisted offer if a caller accidentally weakens its query.
      if (
        row.status !== "published" ||
        row.show_in_shop !== true ||
        row.funnel_only !== false ||
        typeof row.slug !== "string" ||
        row.slug.length > 160 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) ||
        seen.has(row.slug)
      )
        continue;
      seen.add(row.slug);
      offers.push({
        title: row.title,
        slug: row.slug,
        updated_at: row.updated_at,
      });
    }
    if (rows.length < pageSize) return offers;
  }
  throw new Error("Shop sitemap exceeded its pagination limit");
}
