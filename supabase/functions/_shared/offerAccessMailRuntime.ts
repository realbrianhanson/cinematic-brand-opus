import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { resolveNewsletterConfig } from "./newsletterConfig.ts";
import { canonicalOfferOrigin, hashOfferToken } from "./offers.ts";
import {
  accessMailPayload,
  decryptAccessMail,
  encryptAccessMail,
  randomAccessToken,
  sendAccessMail,
} from "./offerAccessMail.ts";

export async function resolveOfferMailer(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("site_settings")
    .select(
      "site_url,site_name,author_name,newsletter_from_address,newsletter_reply_to",
    )
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Delivery settings unavailable");
  const resolved = resolveNewsletterConfig(
    data,
    Deno.env.get("RESEND_API_KEY"),
  );
  if (resolved.ok) {
    try {
      canonicalOfferOrigin(resolved.config.siteUrl);
    } catch {
      return { ok: false as const, missing: ["site_settings.site_url"] };
    }
  }
  return resolved;
}
export async function prepareOfferDelivery(
  admin: SupabaseClient,
  input: { orderId: string } | { email: string },
): Promise<string | null> {
  const { data, error } = await admin.rpc(
    "offer_prepare_access_delivery",
    "orderId" in input ? { _order_id: input.orderId } : { _email: input.email },
  );
  if (error) throw new Error("Delivery could not be prepared");
  return typeof data === "string" ? data : null;
}
export async function offerDeliveryState(
  admin: SupabaseClient,
  orderId: string,
  suppliedHash?: string,
) {
  let deliveryId: string | null = null;
  if (suppliedHash) {
    const { data: grant, error } = await admin
      .from("offer_access_grants")
      .select("delivery_id")
      .eq("token_hash", suppliedHash)
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw new Error("Delivery status unavailable");
    deliveryId = grant?.delivery_id ?? null;
  }
  const query = admin.from("offer_access_deliveries").select("status");
  const { data, error } = await (
    deliveryId
      ? query.eq("id", deliveryId)
      : query.eq("dedupe_key", `initial:${orderId}`)
  ).maybeSingle();
  if (error) throw new Error("Delivery status unavailable");
  return data?.status === "sent"
    ? "sent"
    : data?.status === "sending"
      ? "processing"
      : data?.status === "needs_review"
        ? "needs_review"
        : "not_sent";
}
export async function deliverOfferAccess(
  admin: SupabaseClient,
  deliveryId: string,
): Promise<boolean> {
  const settings = await resolveOfferMailer(admin);
  if (!settings.ok) return false;
  const { data: claimed, error: claimError } = await admin.rpc(
    "offer_claim_access_delivery",
    { _id: deliveryId },
  );
  if (claimError) throw new Error("Delivery claim failed");
  if (!claimed) {
    const { data, error } = await admin
      .from("offer_access_deliveries")
      .select("status")
      .eq("id", deliveryId)
      .maybeSingle();
    if (error) throw new Error("Delivery status unavailable");
    return data?.status === "sent";
  }
  const item = claimed as {
    id: string;
    email: string;
    order_ids: string[];
    lease_id: string;
    payload_cipher: string | null;
  };
  let providerId: string | null = null;
  let errorCode = "provider_unavailable";
  try {
    const { data: suppressed, error: suppressionError } = await admin
      .from("newsletter_subscribers")
      .select("id")
      .eq("email", item.email)
      .in("status", ["bounced", "complained"])
      .limit(1)
      .maybeSingle();
    if (suppressionError) throw new Error("Suppression check unavailable");
    if (suppressed) {
      errorCode = "recipient_suppressed";
      throw new Error("Recipient suppressed");
    }
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    let payload;
    if (item.payload_cipher) {
      errorCode = "delivery_envelope_unavailable";
      payload = await decryptAccessMail(item.payload_cipher, secret, item.id);
    } else {
      const { data: orders, error } = await admin
        .from("offer_orders")
        .select("id,title_snapshot")
        .in("id", item.order_ids);
      if (error || orders?.length !== item.order_ids.length)
        throw new Error("Delivery orders unavailable");
      const links = orders
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((order) => ({
          orderId: order.id,
          title: order.title_snapshot,
          token: randomAccessToken(),
        }));
      payload = accessMailPayload(settings.config, item.email, links);
      const grants = await Promise.all(
        links.map(async (link) => ({
          order_id: link.orderId,
          token_hash: await hashOfferToken(link.token),
        })),
      );
      const cipher = await encryptAccessMail(payload, secret, item.id);
      const { data: frozen, error: freezeError } = await admin.rpc(
        "offer_freeze_access_delivery",
        {
          _id: item.id,
          _lease_id: item.lease_id,
          _payload_cipher: cipher,
          _grants: grants,
        },
      );
      if (freezeError || frozen !== true)
        throw new Error("Delivery freeze failed");
    }
    errorCode = "provider_unavailable";
    providerId = await sendAccessMail(payload, settings.config.apiKey, item.id);
  } catch {
    /* No payloads, access links, recipients, or provider errors enter logs. */
  }
  const { data: finished, error: finishError } = await admin.rpc(
    "offer_finish_access_delivery",
    {
      _id: item.id,
      _lease_id: item.lease_id,
      _provider_id: providerId,
      _error: providerId ? null : errorCode,
    },
  );
  if (finishError || finished !== true)
    throw new Error("Delivery receipt could not be saved");
  return providerId !== null;
}
export function backgroundOfferDelivery(work: Promise<unknown>): void {
  const safe = work.catch(() => {
    console.error("Offer access delivery deferred");
  });
  const runtime = (
    globalThis as unknown as {
      EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void };
    }
  ).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(safe);
  else void safe;
}
export async function resolveOrderTokenHash(
  admin: SupabaseClient,
  hash: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("offer_resolve_access_hash", {
    _token_hash: hash,
  });
  if (error) throw new Error("Access verification unavailable");
  return typeof data === "string" ? data : null;
}
