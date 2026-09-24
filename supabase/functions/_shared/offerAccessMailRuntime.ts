import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import {
  type NewsletterConfig,
  resolveNewsletterConfig,
} from "./newsletterConfig.ts";
import { canonicalOfferOrigin, hashOfferToken } from "./offers.ts";
import {
  accessMailPayload,
  type AccessMailPayload,
  type AccessMailResult,
  decryptAccessMail,
  encryptAccessMail,
  offerDeliveryRetryDelaySeconds,
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
      : data?.status === "needs_review" || data?.status === "failed"
        ? "needs_review"
        : "not_sent";
}
/** Result of one attempt: the delivery's status afterwards, or `skipped`. */
export type OfferAttemptStatus =
  "sent" | "pending" | "failed" | "needs_review" | "skipped" | "unavailable";
type ClaimedDelivery = {
  id: string;
  email: string;
  order_ids: string[];
  lease_id: string;
  attempts: number;
  payload_cipher: string | null;
};
type AttemptFailure = Omit<AccessMailResult, "outcome" | "providerId"> & {
  outcome: "not_sent" | "uncertain" | "blocked";
};
const internalFailure = (
  outcome: AttemptFailure["outcome"],
  error: string,
  detail: string,
): AttemptFailure => ({ outcome, error, detail, httpStatus: null });
const SUPPRESSION_UNAVAILABLE = internalFailure(
  "not_sent",
  "delivery_check_failed",
  "Not sent: the bounce/complaint check was unavailable.",
);
const RECIPIENT_SUPPRESSED = internalFailure(
  "blocked",
  "recipient_suppressed",
  "Not sent: this address previously bounced or marked mail as spam.",
);
const ENVELOPE_UNAVAILABLE = internalFailure(
  "blocked",
  "delivery_envelope_unavailable",
  "Not sent: the saved email could not be decrypted (the service key may have changed). Ask the customer to request fresh recovery links.",
);
const PREPARE_FAILED = internalFailure(
  "not_sent",
  "delivery_prepare_failed",
  "Not sent: the email could not be prepared (order lookup or link storage failed).",
);

async function currentDeliveryStatus(
  admin: SupabaseClient,
  deliveryId: string,
): Promise<OfferAttemptStatus> {
  const { data, error } = await admin
    .from("offer_access_deliveries")
    .select("status")
    .eq("id", deliveryId)
    .maybeSingle();
  if (error) throw new Error("Delivery status unavailable");
  const status = data?.status;
  return status === "sent" || status === "failed" || status === "needs_review"
    ? status
    : "skipped";
}
async function freezeDeliveryPayload(
  admin: SupabaseClient,
  item: ClaimedDelivery,
  config: NewsletterConfig,
  secret: string,
): Promise<AccessMailPayload> {
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
  const payload = accessMailPayload(config, item.email, links);
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
  if (freezeError || frozen !== true) throw new Error("Delivery freeze failed");
  return payload;
}
/** Runs the pre-send checks and one provider call. Never throws. */
async function sendClaimedDelivery(
  admin: SupabaseClient,
  item: ClaimedDelivery,
  config: NewsletterConfig,
): Promise<AccessMailResult | AttemptFailure> {
  let failure = SUPPRESSION_UNAVAILABLE;
  try {
    const { data: suppressed, error: suppressionError } = await admin
      .from("newsletter_subscribers")
      .select("id")
      .eq("email", item.email)
      .in("status", ["bounced", "complained"])
      .limit(1)
      .maybeSingle();
    if (suppressionError) throw new Error("Suppression check unavailable");
    if (suppressed) return RECIPIENT_SUPPRESSED;
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    failure = item.payload_cipher ? ENVELOPE_UNAVAILABLE : PREPARE_FAILED;
    const payload = item.payload_cipher
      ? await decryptAccessMail(item.payload_cipher, secret, item.id)
      : await freezeDeliveryPayload(admin, item, config, secret);
    return await sendAccessMail(payload, config.apiKey, item.id);
  } catch {
    /* No payloads, access links, recipients, or provider errors enter logs. */
    return failure;
  }
}
/**
 * Claims, sends, and records one delivery attempt. A saved receipt, an active
 * lease, or a future retry time all prevent a second provider call.
 */
export async function attemptOfferAccess(
  admin: SupabaseClient,
  deliveryId: string,
): Promise<OfferAttemptStatus> {
  const settings = await resolveOfferMailer(admin);
  if (!settings.ok) return "unavailable";
  const { data: claimed, error: claimError } = await admin.rpc(
    "offer_claim_access_delivery",
    { _id: deliveryId },
  );
  if (claimError) throw new Error("Delivery claim failed");
  if (!claimed) return currentDeliveryStatus(admin, deliveryId);
  const item = claimed as ClaimedDelivery;
  const result = await sendClaimedDelivery(admin, item, settings.config);
  const providerId = "providerId" in result ? result.providerId : null;
  const { data: status, error: recordError } = await admin.rpc(
    "offer_record_access_attempt",
    {
      _id: item.id,
      _lease_id: item.lease_id,
      _outcome: result.outcome,
      _provider_id: providerId,
      _error: result.error,
      _provider_status: result.httpStatus,
      _error_detail: result.detail,
      _retry_after_seconds: offerDeliveryRetryDelaySeconds(item.attempts),
    },
  );
  if (recordError || typeof status !== "string")
    throw new Error("Delivery receipt could not be saved");
  return status as OfferAttemptStatus;
}
export async function deliverOfferAccess(
  admin: SupabaseClient,
  deliveryId: string,
): Promise<boolean> {
  return (await attemptOfferAccess(admin, deliveryId)) === "sent";
}
/** Admin-only: returns a stopped, never-accepted delivery to the retry queue. */
export async function requeueOfferDelivery(
  admin: SupabaseClient,
  deliveryId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("offer_requeue_access_delivery", {
    _id: deliveryId,
  });
  if (error) throw new Error("Delivery could not be requeued");
  return data === true;
}
/** Aggregate admin view. Never includes recipients, links, or payloads. */
export async function offerDeliveryOverview(admin: SupabaseClient) {
  const [failed, next, issue] = await Promise.all([
    admin
      .from("offer_access_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    admin
      .from("offer_access_deliveries")
      .select("next_attempt_at")
      .eq("status", "pending")
      .order("next_attempt_at")
      .limit(1)
      .maybeSingle(),
    admin
      .from("offer_access_deliveries")
      .select(
        "id,status,attempts,last_provider_status,last_error_detail,last_attempt_at,next_attempt_at",
      )
      .in("status", ["pending", "sending", "failed", "needs_review"])
      .not("last_error_detail", "is", null)
      .order("last_attempt_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (failed.error || next.error || issue.error)
    throw new Error("Delivery overview unavailable");
  const row = issue.data;
  return {
    delivery_failed: failed.count ?? 0,
    delivery_next_retry_at: next.data?.next_attempt_at ?? null,
    delivery_last_issue: row
      ? {
          id: row.id,
          status: row.status,
          attempts: row.attempts,
          provider_status: row.last_provider_status,
          detail: row.last_error_detail,
          at: row.last_attempt_at,
          next_attempt_at:
            row.status === "pending" ? row.next_attempt_at : null,
        }
      : null,
  };
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
