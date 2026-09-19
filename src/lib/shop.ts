import type { PublicOffer } from "./offers";

export const SHOP_CATEGORIES = {
  training: "Trainings",
  resource: "Resources",
  tool: "Tools",
  course: "Courses",
} as const;
export type ShopCategory = keyof typeof SHOP_CATEGORIES;
export interface ShopFilters {
  q: string;
  category: ShopCategory | "all";
  price: "all" | "free" | "paid";
  page: number;
}
export type ShopOffer = Pick<
  PublicOffer,
  | "id"
  | "slug"
  | "title"
  | "summary"
  | "cover_url"
  | "kind"
  | "checkout_mode"
  | "price_display_mode"
  | "external_url"
  | "external_button_text"
  | "is_affiliate"
  | "affiliate_disclosure"
  | "amount_minor"
  | "currency"
  | "updated_at"
> & { shop_category: ShopCategory; shop_featured: boolean };
export interface ShopResult {
  items: ShopOffer[];
  total: number;
  page: number;
  pageSize: number;
}
export const SHOP_PAGE_SIZE = 24;
export const SHOP_COLUMNS =
  "id,slug,title,summary,cover_url,kind,checkout_mode,price_display_mode,external_url,external_button_text,is_affiliate,affiliate_disclosure,amount_minor,currency,updated_at,shop_category,shop_featured";
export function shopFilters(raw: unknown = {}): ShopFilters {
  const input =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const requestedPage =
    typeof input.page === "number" || typeof input.page === "string"
      ? Number(input.page)
      : 1;
  return {
    q: typeof input.q === "string" ? input.q.trim().slice(0, 100) : "",
    category:
      typeof input.category === "string" &&
      Object.hasOwn(SHOP_CATEGORIES, input.category)
        ? (input.category as ShopCategory)
        : "all",
    price:
      input.price === "free" || input.price === "paid" ? input.price : "all",
    page:
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? Math.min(requestedPage, 10000)
        : 1,
  };
}
export function shopHref(input: ShopFilters): string {
  const filters = shopFilters(input);
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.price !== "all") params.set("price", filters.price);
  if (filters.page > 1) params.set("page", String(filters.page));
  return `/shop${params.size ? `?${params}` : ""}`;
}
export const escapeShopSearch = (text: string) =>
  text.replace(/[\\%_]/g, "\\$&");
