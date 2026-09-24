import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { safeExternalOfferUrl } from "@/lib/offers";
import type { OfferBuilder } from "@/lib/offerBuilder";
import type { OfferIssue } from "@/lib/offerBuilderValidation";

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

type Issue = OfferIssue;
const PRICE = /^\d+(?:\.\d{1,2})?$/;
const minorUnits = (price: string) => {
  const [whole, fraction = ""] = price.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
};
const isProviderPrice = (form: Form) =>
  form.checkoutMode === "external" &&
  form.kind === "paid" &&
  form.priceDisplayMode === "provider";

function coverIssue(cover: string): Issue | null {
  if (!cover) return null;
  const field = "Cover image URL";
  let url: URL;
  try {
    url = new URL(cover);
  } catch {
    return {
      step: "pages",
      field,
      message: "Use a complete HTTPS URL for the cover image.",
    };
  }
  return url.protocol !== "https:" || url.username || url.password
    ? {
        step: "pages",
        field,
        message:
          "The cover image must use HTTPS without a username or password.",
      }
    : null;
}
function priceIssue(form: Form): Issue | null {
  if (form.kind !== "paid" || isProviderPrice(form)) return null;
  const field = "Price";
  if (!PRICE.test(form.price.trim()))
    return {
      step: "delivery",
      field,
      message: "Enter a price with no more than two decimal places.",
    };
  const amount = minorUnits(form.price);
  return !Number.isSafeInteger(amount) || amount < 50 || amount > 99999999
    ? {
        step: "delivery",
        field,
        message:
          "The price must be between 0.50 and 999,999.99 in the selected currency.",
      }
    : null;
}
function windowIssue(form: Form): Issue | null {
  if (form.checkoutMode === "external") return null;
  const window = Number(form.window);
  return !/^\d+$/.test(form.window) ||
    !Number.isInteger(window) ||
    (window !== 0 && (window < 30 || window > 10080))
    ? {
        step: "next",
        field: "Follow-up window",
        message:
          "The follow-up window must be 0 (no timer), or 30–10,080 minutes.",
      }
    : null;
}
function publishedIssues(form: Form): Issue[] {
  if (form.status !== "published") return [];
  const issues: Issue[] = [];
  if (!form.summary.trim())
    issues.push({
      step: "pages",
      field: "Short promise",
      message: "A published offer needs a summary (the short promise).",
    });
  if (form.checkoutMode === "external") {
    if (!form.externalUrl)
      issues.push({
        step: "delivery",
        field: "Destination URL",
        message:
          "A published external offer needs a valid HTTPS destination URL.",
      });
  } else if (!form.assetPath || !form.assetName)
    issues.push({
      step: "delivery",
      field: "Download file",
      message: "A published offer needs an uploaded download file.",
    });
  return issues;
}

/**
 * Every rule `payload` enforces, collected in the same order so the first
 * issue is the error `payload` throws. Publishing uses status "published".
 */
export function formIssues(form: Form): Issue[] {
  const external = form.checkoutMode === "external";
  const issues: (Issue | null)[] = [];
  const externalUrl =
    external && form.externalUrl
      ? safeExternalOfferUrl(form.externalUrl)
      : null;
  if (external && form.externalUrl && !externalUrl)
    issues.push({
      step: "delivery",
      field: "Destination URL",
      message:
        "Use a complete HTTPS destination URL with a valid domain and no spaces, username, or password (up to 2,048 characters).",
    });
  if (external && form.externalButtonText.trim().length > 80)
    issues.push({
      step: "delivery",
      field: "Button label",
      message: "Keep the external button label to 80 characters or fewer.",
    });
  if (
    external &&
    form.isAffiliate &&
    form.affiliateDisclosure.trim().length > 1000
  )
    issues.push({
      step: "delivery",
      field: "Affiliate disclosure",
      message: "Keep the affiliate disclosure to 1,000 characters or fewer.",
    });
  if (!form.title.trim())
    issues.push({
      step: "pages",
      field: "Title",
      message: "Add an offer title before saving.",
    });
  if (!Object.hasOwn(shopCategories, form.shopCategory))
    issues.push({
      step: "review",
      field: "Shop category",
      message:
        "Choose Training, Resource, Tool, or Course for the Shop category.",
    });
  if (!external && form.showInShop && form.funnelOnly)
    issues.push({
      step: "review",
      field: "Show in Shop",
      message:
        "Follow-up-only offers cannot appear in the Shop. Turn off Shop visibility or the follow-up-only setting.",
    });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim()))
    issues.push({
      step: "pages",
      field: "Page URL slug",
      message:
        "Use a URL slug with lowercase letters, numbers, and single hyphens.",
    });
  issues.push(coverIssue(form.cover), priceIssue(form), windowIssue(form));
  issues.push(...publishedIssues(form));
  return issues.filter((issue): issue is Issue => !!issue);
}

function toRow(
  form: Form,
  parts: { externalUrl: string | null; amount: number; window: number },
): TablesInsert<"offers"> {
  const external = form.checkoutMode === "external";
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    summary: form.summary.trim(),
    body: form.body.trim(),
    cover_url: form.cover.trim() || null,
    checkout_mode: external ? "external" : "native",
    price_display_mode: isProviderPrice(form) ? "provider" : "fixed",
    external_url: parts.externalUrl,
    external_button_text: external ? form.externalButtonText.trim() : "",
    is_affiliate: external && form.isAffiliate,
    affiliate_disclosure:
      external && form.isAffiliate
        ? form.affiliateDisclosure.trim() || null
        : null,
    kind: form.kind,
    amount_minor: parts.amount,
    currency: form.currency,
    status: form.status,
    asset_path: external ? null : form.assetPath || null,
    asset_name: external ? null : form.assetName || null,
    thank_you_message: external ? "" : form.thankYou.trim(),
    next_offer_id: external ? null : form.nextOffer || null,
    next_offer_window_minutes: !external && form.nextOffer ? parts.window : 0,
    funnel_only: !external && form.funnelOnly,
    show_in_shop: form.showInShop,
    shop_category: form.shopCategory,
    shop_featured: form.shopFeatured,
  };
}

/** Publish-ready values. Throws the first issue from `formIssues`. */
export function payload(form: Form): TablesInsert<"offers"> {
  const [first] = formIssues(form);
  if (first) throw new Error(first.message);
  const external = form.checkoutMode === "external";
  return toRow(form, {
    externalUrl:
      external && form.externalUrl
        ? safeExternalOfferUrl(form.externalUrl)
        : null,
    amount:
      form.kind === "paid" && !isProviderPrice(form)
        ? minorUnits(form.price)
        : 0,
    window: external ? 0 : Number(form.window),
  });
}

// Limits from public.offer_builder_document_valid: a private draft only has
// to be storable. Publishing applies every rule in `formIssues`.
const draftLimits: [keyof Form, string, number, OfferIssue["step"]][] = [
  ["title", "Title", 200, "pages"],
  ["slug", "Page URL slug", 160, "pages"],
  ["summary", "Short promise", 1000, "pages"],
  ["body", "Full description", 40000, "pages"],
  ["cover", "Cover image URL", 2048, "pages"],
  ["thankYou", "Confirmation message", 2000, "delivery"],
  ["externalUrl", "Destination URL", 2048, "delivery"],
  ["externalButtonText", "Button label", 80, "delivery"],
  ["affiliateDisclosure", "Affiliate disclosure", 1000, "delivery"],
];

/** Lenient private-draft values: types and lengths only. */
export function draftPayload(form: Form): {
  values: TablesInsert<"offers">;
  issues: Issue[];
} {
  const issues: Issue[] = [];
  for (const [key, field, limit, step] of draftLimits) {
    const value = String(form[key]).trim();
    if (Array.from(value).length > limit)
      issues.push({
        step,
        field,
        message: `Keep this to ${limit.toLocaleString("en-US")} characters or fewer.`,
      });
  }
  const external = form.checkoutMode === "external";
  const price = form.price.trim();
  let amount = 0;
  if (form.kind === "paid" && !isProviderPrice(form) && price) {
    amount = PRICE.test(price) ? minorUnits(price) : NaN;
    if (!Number.isSafeInteger(amount) || amount > 99999999)
      issues.push({
        step: "delivery",
        field: "Price",
        message:
          "Enter the price as a number, such as 19 or 19.99 (up to 999,999.99).",
      });
  }
  const window = Number(form.window);
  if (
    !external &&
    form.nextOffer &&
    (!/^\d+$/.test(form.window) || window > 99999999)
  )
    issues.push({
      step: "next",
      field: "Follow-up window",
      message: "Enter the follow-up window as a whole number of minutes.",
    });
  const values = toRow(
    { ...form, status: "draft" },
    {
      externalUrl: external ? form.externalUrl.trim() || null : null,
      amount: Number.isSafeInteger(amount) ? amount : 0,
      window: Number.isSafeInteger(window) ? window : 0,
    },
  );
  return { values, issues };
}

export type OfferHandoff = {
  notice?: string;
  step?: OfferIssue["step"];
  form?: Form;
  builder?: OfferBuilder;
};
// Carries editor context from /admin/offers/new to the saved offer's route,
// which mounts a fresh editor. In-memory only; never persisted.
const handoffs = new Map<string, OfferHandoff>();
export function saveOfferHandoff(id: string, handoff: OfferHandoff) {
  handoffs.set(id, handoff);
}
export function readOfferHandoff(id: string): OfferHandoff | null {
  return handoffs.get(id) ?? null;
}
export function clearOfferHandoff(id: string) {
  handoffs.delete(id);
}
