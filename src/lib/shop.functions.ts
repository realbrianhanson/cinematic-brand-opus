import { createServerFn } from "@tanstack/react-start";
import { createPublicServerClient } from "./publicData.server";
import {
  escapeShopSearch,
  SHOP_COLUMNS,
  SHOP_PAGE_SIZE,
  shopFilters,
  type ShopResult,
  type ShopOffer,
} from "./shop";

/** Optional home-page merchandising must never take down the main landing page. */
export const getShopShowcase = createServerFn({ method: "GET" }).handler(
  async (): Promise<ShopOffer[]> => {
    try {
      const { data, error } = await createPublicServerClient()
        .from("offers")
        .select(SHOP_COLUMNS)
        .eq("status", "published")
        .eq("show_in_shop", true)
        .eq("funnel_only", false)
        .eq("shop_featured", true)
        .order("updated_at", { ascending: false })
        .order("id")
        .limit(3)
        .abortSignal(AbortSignal.timeout(5000));
      if (error) return [];
      return (data || []) as ShopOffer[];
    } catch {
      return [];
    }
  },
);

export const getRelatedShopOffers = createServerFn({ method: "GET" })
  .inputValidator((input: { excludeId: string }) => ({
    excludeId:
      typeof input?.excludeId === "string" &&
      /^[a-f0-9-]{36}$/i.test(input.excludeId)
        ? input.excludeId
        : "",
  }))
  .handler(async ({ data }): Promise<ShopOffer[]> => {
    if (!data.excludeId) return [];
    try {
      const { data: offers, error } = await createPublicServerClient()
        .from("offers")
        .select(SHOP_COLUMNS)
        .eq("status", "published")
        .eq("show_in_shop", true)
        .eq("funnel_only", false)
        .neq("id", data.excludeId)
        .order("shop_featured", { ascending: false })
        .order("updated_at", { ascending: false })
        .order("id")
        .limit(2)
        .abortSignal(AbortSignal.timeout(4000));
      if (error) return [];
      return (offers || []) as ShopOffer[];
    } catch {
      return [];
    }
  });

export const getShopCatalog = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => shopFilters(input))
  .handler(async ({ data }): Promise<ShopResult> => {
    // Deliberately anonymous even for signed-in visitors, and never selects delivery fields.
    let query = createPublicServerClient()
      .from("offers")
      .select(SHOP_COLUMNS, { count: "exact" })
      .eq("status", "published")
      .eq("show_in_shop", true)
      .eq("funnel_only", false);
    if (data.category !== "all")
      query = query.eq("shop_category", data.category);
    if (data.price !== "all") query = query.eq("kind", data.price);
    if (data.q) query = query.ilike("title", `%${escapeShopSearch(data.q)}%`);
    const start = (data.page - 1) * SHOP_PAGE_SIZE;
    const {
      data: items,
      count,
      error,
    } = await query
      .order("shop_featured", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("id")
      .range(start, start + SHOP_PAGE_SIZE - 1);
    if (error?.code === "PGRST103") {
      // A saved later-page URL can outlive its listings. PostgREST returns 416
      // with exact counts, so recover the total without treating it as an outage.
      const first = await query.range(0, 0);
      if (first.error)
        throw new Error("The shop could not be loaded. Please try again.");
      return {
        items: [],
        total: first.count || 0,
        page: data.page,
        pageSize: SHOP_PAGE_SIZE,
      };
    }
    if (error)
      throw new Error("The shop could not be loaded. Please try again.");
    return {
      items: (items || []) as ShopOffer[],
      total: count || 0,
      page: data.page,
      pageSize: SHOP_PAGE_SIZE,
    };
  });
