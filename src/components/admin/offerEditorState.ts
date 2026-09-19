import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Offer = Tables<"offers">;
export type Form = {
  title: string;
  slug: string;
  summary: string;
  body: string;
  cover: string;
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
};
export const empty: Form = {
  title: "",
  slug: "",
  summary: "",
  body: "",
  cover: "",
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
};
export function toForm(offer: Offer): Form {
  return {
    title: offer.title,
    slug: offer.slug,
    summary: offer.summary,
    body: offer.body,
    cover: offer.cover_url || "",
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
  if (!title) throw new Error("Add an offer title before saving.");
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
  if (form.kind === "paid") {
    if (!/^\d+(?:\.\d{1,2})?$/.test(form.price.trim()))
      throw new Error("Enter a price with no more than two decimal places.");
    const [whole, fraction = ""] = form.price.trim().split(".");
    amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(amount) || amount < 50 || amount > 99999999)
      throw new Error(
        "The price must be between 0.50 and 999,999.99 in the selected currency.",
      );
  }
  const window = Number(form.window);
  if (
    !/^\d+$/.test(form.window) ||
    !Number.isInteger(window) ||
    (window !== 0 && (window < 30 || window > 10080))
  )
    throw new Error(
      "The follow-up window must be 0 (no timer), or 30–10,080 minutes.",
    );
  if (
    form.status === "published" &&
    (!form.summary.trim() || !form.assetPath || !form.assetName)
  )
    throw new Error(
      "A published offer needs a summary and an uploaded download file.",
    );
  return {
    title,
    slug,
    summary: form.summary.trim(),
    body: form.body.trim(),
    cover_url: form.cover.trim() || null,
    kind: form.kind,
    amount_minor: amount,
    currency: form.currency,
    status: form.status,
    asset_path: form.assetPath || null,
    asset_name: form.assetName || null,
    thank_you_message: form.thankYou.trim(),
    next_offer_id: form.nextOffer || null,
    next_offer_window_minutes: form.nextOffer ? window : 0,
    funnel_only: form.funnelOnly,
  };
}
