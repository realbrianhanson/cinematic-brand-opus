import { createServerFn } from "@tanstack/react-start";
import { createPublicServerClient } from "./publicData.server";
import type { PublicOffer } from "./offers";

// Deliberately excludes private file paths, order data and funnel configuration.
export const PUBLIC_OFFER_COLUMNS =
  "id,slug,title,summary,body,cover_url,status,kind,checkout_mode,price_display_mode,external_url,external_button_text,is_affiliate,affiliate_disclosure,amount_minor,currency,thank_you_message,funnel_only,created_at,updated_at";
export const getPublishedOffer = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => ({
    slug:
      typeof input?.slug === "string" && input.slug.length <= 160
        ? input.slug
        : "",
  }))
  .handler(async ({ data }) => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) return null;
    const { data: offer, error } = await createPublicServerClient()
      .from("offers")
      .select(PUBLIC_OFFER_COLUMNS)
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error)
      throw new Error("This offer could not be loaded. Please try again.");
    return offer as PublicOffer | null;
  });
