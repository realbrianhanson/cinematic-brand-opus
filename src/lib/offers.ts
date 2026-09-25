import { supabase } from "@/integrations/supabase/client";
import { validOfferUrl, type OfferPresentation } from "./offerBuilder";
import { withTimeout } from "./withTimeout";

export type OfferKind = "free" | "paid";
export type OfferCheckoutMode = "native" | "external";
export type OfferPriceDisplayMode = "fixed" | "provider";
export type OfferCurrency = "usd" | "cad" | "eur" | "gbp" | "aud";
export interface PublicOffer {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  cover_url: string | null;
  presentation?: OfferPresentation | null;
  status: "draft" | "published" | "archived";
  kind: OfferKind;
  checkout_mode: OfferCheckoutMode;
  price_display_mode: OfferPriceDisplayMode;
  external_url: string | null;
  external_button_text: string;
  is_affiliate: boolean;
  affiliate_disclosure: string | null;
  amount_minor: number;
  currency: string;
  thank_you_message: string;
  funnel_only: boolean;
  created_at: string;
  updated_at: string;
}
export interface OfferHealth {
  secret_configured: boolean;
  webhook_configured: boolean;
  payments_ready: boolean;
  mode: "test" | "live" | "unconfigured";
  webhook_url: string;
  delivery_ready?: boolean;
  delivery_missing?: string[];
  delivery_pending?: number;
  delivery_needs_review?: number;
}
export interface OfferAccess {
  order: {
    id: string;
    title: string;
    status: "pending" | "fulfilled" | "failed" | "expired" | "refunded";
    kind: OfferKind;
    amount_minor: number;
    currency: string;
    asset_name: string;
    fulfilled_at: string | null;
  };
  next_offer: PublicOffer | null;
  next_offer_deadline: string | null;
  checkout_url: string | null;
  access_url: string;
  payments_ready: boolean;
  thank_you_message?: string;
  presentation?: OfferPresentation | null;
  delivery_state?: "sent" | "processing" | "not_sent" | "needs_review";
  delivery_ready?: boolean;
}
export interface OfferClaim {
  status: "pending" | "fulfilled" | "expired" | "failed" | "refunded";
  access_url: string;
  checkout_url?: string;
}
export class OfferApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
  ) {
    super(message);
    this.name = "OfferApiError";
  }
}
export async function invokeOfferApi<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  // Bound both the request and any session refresh before transport starts.
  // A timeout is uncertain: callers retain their original idempotency token.
  return withTimeout(
    (async () => {
      const { data, error } = await supabase.functions.invoke("offers-api", {
        body,
        signal: controller.signal,
      });
      if (error) {
        let payload: { error?: string; message?: string; code?: string } = {};
        const response =
          error.context instanceof Response ? error.context : undefined;
        if (response) {
          try {
            // Non-2xx SDK responses still have an unread body. Keep the
            // transport alive until its error details have been consumed.
            const decoded: unknown = await response.clone().json();
            if (decoded && typeof decoded === "object") {
              const fields = decoded as Record<string, unknown>;
              payload = {
                message:
                  typeof fields.message === "string"
                    ? fields.message
                    : undefined,
                error:
                  typeof fields.error === "string" ? fields.error : undefined,
                code: typeof fields.code === "string" ? fields.code : undefined,
              };
            }
          } catch {
            // A missing/unreadable body still retains the response status.
          }
        }
        throw new OfferApiError(
          payload.message ||
            payload.error ||
            "We couldn't complete that request. Please try again.",
          payload.code,
          response?.status,
        );
      }
      if (data?.error) throw new OfferApiError(data.error, data.code);
      return data as T;
    })(),
    20000,
  ).finally(() => controller.abort());
}
export function offerPrice(
  offer: Pick<PublicOffer, "kind" | "amount_minor" | "currency"> &
    Partial<Pick<PublicOffer, "checkout_mode" | "price_display_mode">>,
): string {
  if (
    offer.checkout_mode === "external" &&
    offer.price_display_mode === "provider"
  )
    return "View current pricing";
  if (offer.kind === "free") return "Free";
  const currency = offer.currency.toUpperCase();
  const amount = offer.amount_minor / 100;
  // USD reads as "$7" (cents only when present); other currencies keep the
  // unambiguous ISO code because "$" alone could mean CAD, AUD, etc.
  if (currency === "USD")
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(amount);
}

/** Outbound destinations are public links; never fetch them or create access tokens. */
export function safeExternalOfferUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !validOfferUrl(raw)) return null;
  try {
    const href = new URL(raw).href;
    // Normalisation must not produce a value the database would reject.
    return validOfferUrl(href) ? href : null;
  } catch {
    return null;
  }
}

export function affiliateDisclosure(
  offer: Pick<PublicOffer, "is_affiliate" | "affiliate_disclosure">,
): string | null {
  if (!offer.is_affiliate) return null;
  return (
    offer.affiliate_disclosure?.trim() ||
    "Affiliate link: I may earn a commission if you purchase through this link."
  );
}
export const isOfferToken = (token: unknown): token is string =>
  typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
export function newOfferToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
// Tokens are bearer access links. Keep them out of query strings, analytics and API logs.
export function persistOfferToken(token: string): void {
  if (!isOfferToken(token)) return;
  try {
    sessionStorage.setItem("offer-access-token", token);
  } catch {
    /* The fragment still carries access across Checkout. */
  }
}
export function restoreOfferToken(): string {
  try {
    const token = sessionStorage.getItem("offer-access-token");
    return isOfferToken(token) ? token : "";
  } catch {
    return "";
  }
}
export function retryToken(offerId: string, identity: string): string {
  const key = `offer-attempt:${offerId}:${identity}`;
  try {
    const saved = sessionStorage.getItem(key);
    if (isOfferToken(saved)) return saved;
    const token = newOfferToken();
    sessionStorage.setItem(key, token);
    return token;
  } catch {
    return newOfferToken();
  }
}
export function clearOfferAttempt(offerId: string, identity: string): void {
  try {
    sessionStorage.removeItem(`offer-attempt:${offerId}:${identity}`);
  } catch {
    /* The caller also resets its in-memory retry token. */
  }
}
export function safeOfferRedirect(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new Error("The destination could not be verified. Please try again.");
  return parsed.href;
}
