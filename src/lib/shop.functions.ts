import { createServerFn } from "@tanstack/react-start";
import { createPublicServerClient } from "./publicData.server";
import {
  escapeShopSearch,
  SHOP_COLUMNS,
  SHOP_CATEGORIES,
  SHOP_PAGE_SIZE,
  shopFilters,
  type ShopResult,
  type ShopOffer,
  type ShopAvailability,
  type ShopCategory,
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

/** Goal recommendations are independent of the homepage's three featured slots. */
export const getStartHereOffers = createServerFn({ method: "GET" }).handler(
  async (): Promise<ShopOffer[]> => {
    try {
      const { data, error } = await createPublicServerClient()
        .from("offers")
        .select(SHOP_COLUMNS)
        .eq("status", "published")
        .eq("show_in_shop", true)
        .eq("funnel_only", false)
        .in("slug", ["ai-follow-up-starter-kit", "app-building-workshop"])
        .limit(2)
        .abortSignal(AbortSignal.timeout(5000));
      return error ? [] : ((data || []) as ShopOffer[]);
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

/** Facet checks remain bounded even when a member has thousands of products. */
async function shopAvailability(): Promise<ShopAvailability | null> {
  const categories = Object.keys(SHOP_CATEGORIES) as ShopCategory[];
  const prices = ["free", "paid"] as const;
  try {
    const checks = await Promise.all(
      [
        ...categories.map((value) => ({ field: "shop_category", value })),
        ...prices.map((value) => ({ field: "kind", value })),
      ].map(async ({ field, value }) => {
        const { data, error } = await createPublicServerClient()
          .from("offers")
          .select("id")
          .eq("status", "published")
          .eq("show_in_shop", true)
          .eq("funnel_only", false)
          .eq(field, value)
          .limit(1)
          .abortSignal(AbortSignal.timeout(4000));
        if (error) throw error;
        return Boolean(data?.length);
      }),
    );
    return {
      categories: categories.filter((_, index) => checks[index]),
      prices: prices.filter((_, index) => checks[categories.length + index]),
    };
  } catch {
    // A facet outage must not falsely claim categories are empty or hide the catalog.
    return null;
  }
}

function availabilityFromItems(items: ShopOffer[]): ShopAvailability {
  return {
    categories: (Object.keys(SHOP_CATEGORIES) as ShopCategory[]).filter(
      (category) => items.some((item) => item.shop_category === category),
    ),
    prices: (["free", "paid"] as const).filter((price) =>
      items.some((item) => item.kind === price),
    ),
  };
}

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
    const completeFirstPage =
      !data.q &&
      data.category === "all" &&
      data.price === "all" &&
      data.page === 1;
    // Filtered pages need catalog-wide facets, fetched alongside the listing.
    const pendingAvailability = completeFirstPage ? null : shopAvailability();
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
        availableFilters: await (pendingAvailability ?? shopAvailability()),
      };
    }
    if (error)
      throw new Error("The shop could not be loaded. Please try again.");
    return {
      items: (items || []) as ShopOffer[],
      total: count || 0,
      page: data.page,
      pageSize: SHOP_PAGE_SIZE,
      availableFilters:
        completeFirstPage && (count || 0) <= (items?.length || 0)
          ? availabilityFromItems((items || []) as ShopOffer[])
          : await (pendingAvailability ?? shopAvailability()),
    };
  });

/** Columns the article signup card needs to claim a free download. */
export const LEAD_MAGNET_COLUMNS =
  "id,slug,title,summary,kind,checkout_mode,cover_url";

export type LeadMagnetOffer = Pick<
  ShopOffer,
  "id" | "slug" | "title" | "summary" | "kind" | "checkout_mode" | "cover_url"
>;

/**
 * The site's free download (for Brian, the AI Follow-Up Starter Kit), offered
 * inside articles. Optional: articles fall back to the newsletter on failure.
 */
export const getLeadMagnetOffer = createServerFn({ method: "GET" }).handler(
  async (): Promise<LeadMagnetOffer | null> => {
    try {
      const { data, error } = await createPublicServerClient()
        .from("offers")
        .select(LEAD_MAGNET_COLUMNS)
        .eq("status", "published")
        .eq("kind", "free")
        .eq("checkout_mode", "native")
        .eq("show_in_shop", true)
        .eq("funnel_only", false)
        .order("shop_featured", { ascending: false })
        .order("updated_at", { ascending: false })
        .order("id")
        .limit(1)
        .abortSignal(AbortSignal.timeout(4000));
      if (error || !data?.length) return null;
      return data[0] as LeadMagnetOffer;
    } catch {
      return null;
    }
  },
);
