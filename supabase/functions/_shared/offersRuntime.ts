import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.97.0";
import Stripe from "npm:stripe@22.6.0";
import { canonicalOfferOrigin, hashOfferToken, OfferError } from "./offers.ts";

export { Stripe };
export const offerCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export function offerJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...offerCors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function offerFailure(error: unknown): Response {
  if (error instanceof OfferError) {
    return offerJson(error.status, { error: error.message, code: error.code });
  }
  // Do not log request bodies, access tokens, checkout URLs or provider errors containing PII.
  console.error(
    "Offer operation failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return offerJson(503, {
    error: "This request could not be completed. Please try again.",
    code: "temporarily_unavailable",
  });
}
export function offerAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key)
    throw new OfferError(503, "unavailable", "Offers are not available yet.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function offerStripe(secret: string): Stripe {
  return new Stripe(secret, {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 1,
    timeout: 15000,
  });
}
export async function requireOfferAdmin(
  req: Request,
  admin: SupabaseClient,
): Promise<void> {
  const bearer = req.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/i)?.[1];
  if (!bearer)
    throw new OfferError(401, "unauthorized", "Sign in to the admin panel.");
  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data.user)
    throw new OfferError(401, "unauthorized", "Sign in to the admin panel.");
  const { data: role, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError || !role)
    throw new OfferError(403, "forbidden", "Administrator access is required.");
}
export async function offerOrigin(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from("site_settings")
    .select("site_url")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return canonicalOfferOrigin(data?.site_url);
}
export async function offerThrottle(
  admin: SupabaseClient,
  key: string,
  limit: number,
  window = 3600,
): Promise<void> {
  const { data, error } = await admin.rpc("newsletter_rate_limit_hit", {
    _key: `offers:${key}`,
    _limit: limit,
    _window_seconds: window,
  });
  if (error)
    throw new OfferError(503, "unavailable", "Please try again shortly.");
  if (data !== true)
    throw new OfferError(
      429,
      "rate_limited",
      "Too many requests. Please wait before trying again.",
    );
}
export async function offerIpThrottle(
  admin: SupabaseClient,
  request: Request,
  action: string,
): Promise<void> {
  const ip =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  await offerThrottle(
    admin,
    `ip:${action}:${await hashOfferToken(ip)}`,
    action === "recover" ? 10 : action === "claim" ? 30 : 300,
  );
}
/** Known business rejections are safe to summarize; DB internals are never returned. */
export function offerDatabaseError(error: { message?: string }): OfferError {
  const message = error.message ?? "";
  if (/does not match token/i.test(message))
    return new OfferError(
      409,
      "request_mismatch",
      "This saved access link belongs to a different request.",
    );
  if (
    /parent|next offer|deadline|declined|funnel|chain|ancestor|child/i.test(
      message,
    )
  )
    return new OfferError(
      409,
      "offer_not_available",
      "This follow-up offer is no longer available. Your existing download is unaffected.",
    );
  if (/published|asset|offer (?:is|file is|not)|not found/i.test(message))
    return new OfferError(
      409,
      "offer_not_available",
      "This offer is not currently available.",
    );
  return new OfferError(
    409,
    "request_not_available",
    "This request could not be completed. Check your access page or try again.",
  );
}
