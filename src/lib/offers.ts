import { supabase } from "@/integrations/supabase/client";

export type OfferKind = "free" | "paid";
export type OfferCurrency = "usd" | "cad" | "eur" | "gbp" | "aud";
export interface PublicOffer {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  cover_url: string | null;
  status: "draft" | "published" | "archived";
  kind: OfferKind;
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
  const { data, error } = await supabase.functions.invoke("offers-api", {
    body,
  });
  if (error) {
    let payload: { error?: string; message?: string; code?: string } = {};
    const response =
      error.context instanceof Response ? error.context : undefined;
    if (response)
      payload = await response
        .clone()
        .json()
        .catch(() => ({}));
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
}
export function offerPrice(
  offer: Pick<PublicOffer, "kind" | "amount_minor" | "currency">,
): string {
  if (offer.kind === "free") return "Free";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: offer.currency.toUpperCase(),
    currencyDisplay: "code",
  }).format(offer.amount_minor / 100);
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
