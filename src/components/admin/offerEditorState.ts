import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { safeExternalOfferUrl } from "@/lib/offers";

export type Offer = Tables<"offers">;
export const shopCategories = {
  training: "Training",
  resource: "Resource",
  tool: "Tool",
  course: "Course",
} as const;
export type Form = {
  title: string;
  slug: string;
  summary: string;
  body: string;
  cover: string;
  checkoutMode: "native" | "external";
  priceDisplayMode: "fixed" | "provider";
  externalUrl: string;
  externalButtonText: string;
  isAffiliate: boolean;
  affiliateDisclosure: string;
  kind: "free" | "paid";
  price: string;
  currency: string;
  status: string;
  assetPath: string;
  assetName: string;
  thankYou: string;
  nextOffer: string;
  window: string;
  funnelOnly: boolean;
  showInShop: boolean;
  shopCategory: keyof typeof shopCategories;
  shopFeatured: boolean;
};
export const empty: Form = {
  title: "",
  slug: "",
  summary: "",
  body: "",
  cover: "",
  checkoutMode: "native",
  priceDisplayMode: "fixed",
  externalUrl: "",
  externalButtonText: "",
  isAffiliate: false,
  affiliateDisclosure: "",
  kind: "free",
  price: "",
  currency: "usd",
  status: "draft",
  assetPath: "",
  assetName: "",
  thankYou: "Thanks! Your download is ready below.",
  nextOffer: "",
  window: "0",
  funnelOnly: false,
  showInShop: false,
  shopCategory: "resource",
  shopFeatured: false,
};
export function toForm(offer: Offer): Form {
  return {
    title: offer.title,
    slug: offer.slug,
    summary: offer.summary,
    body: offer.body,
    cover: offer.cover_url || "",
    checkoutMode: offer.checkout_mode === "external" ? "external" : "native",
    priceDisplayMode:
      offer.price_display_mode === "provider" ? "provider" : "fixed",
    externalUrl: offer.external_url || "",
    externalButtonText: offer.external_button_text || "",
    isAffiliate: offer.is_affiliate || false,
    affiliateDisclosure: offer.affiliate_disclosure || "",
    kind: offer.kind === "paid" ? "paid" : "free",
    price: offer.amount_minor ? (offer.amount_minor / 100).toFixed(2) : "",
    currency: offer.currency,
    status: offer.status,
    assetPath: offer.asset_path || "",
    assetName: offer.asset_name || "",
    thankYou: offer.thank_you_message,
    nextOffer: offer.next_offer_id || "",
    window: String(offer.next_offer_window_minutes),
    funnelOnly: offer.funnel_only,
    showInShop: offer.show_in_shop,
    shopCategory: offer.shop_category as Form["shopCategory"],
    shopFeatured: offer.shop_featured,
  };
}
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120)
    .replace(/-+$/, "");

export function payload(form: Form): TablesInsert<"offers"> {
  const title = form.title.trim();
  const slug = form.slug.trim();
  const external = form.checkoutMode === "external";
  const providerPrice =
    external && form.kind === "paid" && form.priceDisplayMode === "provider";
  let externalUrl: string | null = null;
  if (external && form.externalUrl) {
    externalUrl = safeExternalOfferUrl(form.externalUrl);
    if (!externalUrl)
      throw new Error(
        "Use a complete HTTPS destination URL without spaces, a username, or a password (up to 2,048 characters).",
      );
  }
  if (external && form.externalButtonText.trim().length > 80)
    throw new Error(
      "Keep the external button label to 80 characters or fewer.",
    );
  if (
    external &&
    form.isAffiliate &&
    form.affiliateDisclosure.trim().length > 1000
  )
    throw new Error(
      "Keep the affiliate disclosure to 1,000 characters or fewer.",
    );
  if (!title) throw new Error("Add an offer title before saving.");
  if (!Object.hasOwn(shopCategories, form.shopCategory))
    throw new Error(
      "Choose Training, Resource, Tool, or Course for the Shop category.",
    );
  if (!external && form.showInShop && form.funnelOnly)
    throw new Error(
      "Follow-up-only offers cannot appear in the Shop. Turn off Shop visibility or the follow-up-only setting.",
    );
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new Error(
      "Use a URL slug with lowercase letters, numbers, and single hyphens.",
    );
  if (form.cover) {
    let url: URL;
    try {
      url = new URL(form.cover);
    } catch {
      throw new Error("Use a complete HTTPS URL for the cover image.");
    }
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error(
        "The cover image must use HTTPS without a username or password.",
      );
  }
  let amount = 0;
  if (form.kind === "paid" && !providerPrice) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(form.price.trim()))
      throw new Error("Enter a price with no more than two decimal places.");
    const [whole, fraction = ""] = form.price.trim().split(".");
    amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(amount) || amount < 50 || amount > 99999999)
      throw new Error(
        "The price must be between 0.50 and 999,999.99 in the selected currency.",
      );
  }
  const window = external ? 0 : Number(form.window);
  if (
    !external &&
    (!/^\d+$/.test(form.window) ||
      !Number.isInteger(window) ||
      (window !== 0 && (window < 30 || window > 10080)))
  )
    throw new Error(
      "The follow-up window must be 0 (no timer), or 30–10,080 minutes.",
    );
  if (
    form.status === "published" &&
    (!form.summary.trim() ||
      (external ? !externalUrl : !form.assetPath || !form.assetName))
  )
    throw new Error(
      external
        ? "A published external offer needs a summary and a valid HTTPS destination URL."
        : "A published offer needs a summary and an uploaded download file.",
    );
  return {
    title,
    slug,
    summary: form.summary.trim(),
    body: form.body.trim(),
    cover_url: form.cover.trim() || null,
    checkout_mode: external ? "external" : "native",
    price_display_mode: providerPrice ? "provider" : "fixed",
    external_url: externalUrl,
    external_button_text: external ? form.externalButtonText.trim() : "",
    is_affiliate: external && form.isAffiliate,
    affiliate_disclosure:
      external && form.isAffiliate
        ? form.affiliateDisclosure.trim() || null
        : null,
    kind: form.kind,
    amount_minor: amount,
    currency: form.currency,
    status: form.status,
    asset_path: external ? null : form.assetPath || null,
    asset_name: external ? null : form.assetName || null,
    thank_you_message: external ? "" : form.thankYou.trim(),
    next_offer_id: external ? null : form.nextOffer || null,
    next_offer_window_minutes: !external && form.nextOffer ? window : 0,
    funnel_only: !external && form.funnelOnly,
    show_in_shop: form.showInShop,
    shop_category: form.shopCategory,
    shop_featured: form.shopFeatured,
  };
}
