import { createServerFn } from "@tanstack/react-start";
import { createPublicServerClient } from "./publicData.server";
import {
  loadShopSitemapOffers,
  SHOP_DISCOVERY_COLUMNS,
} from "../../supabase/functions/_shared/shopDiscovery";

// Always read as anon, including when an administrator views the HTML sitemap.
export const getShopSitemapOffers = createServerFn({ method: "GET" }).handler(
  async () => {
    const client = createPublicServerClient();
    return loadShopSitemapOffers((from, to) =>
      client
        .from("offers")
        .select(SHOP_DISCOVERY_COLUMNS)
        .eq("status", "published")
        .eq("show_in_shop", true)
        .eq("funnel_only", false)
        .order("slug")
        .range(from, to),
    );
  },
);
