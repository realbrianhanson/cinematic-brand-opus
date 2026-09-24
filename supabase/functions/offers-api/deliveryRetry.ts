import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import {
  attemptOfferAccess,
  type OfferAttemptStatus,
  requeueOfferDelivery,
  resolveOfferMailer,
} from "../_shared/offerAccessMailRuntime.ts";
import { OfferError } from "../_shared/offers.ts";
import { offerCors, offerJson } from "../_shared/offersRuntime.ts";

/** Unattended runs (every 15 minutes) may attempt more than one admin click. */
export const CRON_RETRY_BATCH = 10;
export const ADMIN_RETRY_BATCH = 3;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorizeRetry(req: Request) {
  const auth = await authorizeCronOrAdmin(req, offerCors);
  if (!(auth instanceof Response)) return auth;
  if (auth.status === 403)
    throw new OfferError(403, "forbidden", "Administrator access is required.");
  throw new OfferError(401, "unauthorized", "Sign in to the admin panel.");
}
async function requeue(
  admin: SupabaseClient,
  mode: "cron" | "admin",
  value: unknown,
): Promise<void> {
  if (mode !== "admin")
    throw new OfferError(
      403,
      "forbidden",
      "Only an administrator can requeue a stopped email.",
    );
  if (typeof value !== "string" || !UUID.test(value))
    throw new OfferError(400, "invalid_request", "Invalid delivery.");
  if (!(await requeueOfferDelivery(admin, value.toLowerCase())))
    throw new OfferError(
      409,
      "requeue_unavailable",
      "This email cannot be requeued. It was already accepted, is still retrying, or is blocked (bounced address or unreadable saved message).",
    );
}
function summarize(results: PromiseSettledResult<OfferAttemptStatus>[]) {
  const statuses = results.map((result) =>
    result.status === "fulfilled" ? result.value : "error",
  );
  const sent = statuses.filter((status) => status === "sent").length;
  return {
    sent,
    remaining: statuses.length - sent,
    stopped: statuses.filter(
      (status) => status === "failed" || status === "needs_review",
    ).length,
    errors: statuses.filter((status) => status === "error").length,
  };
}

/**
 * `{action:'retry_deliveries', requeue_id?}` for the admin button or pg_cron
 * (x-cron-secret). Attempts only due deliveries; per-delivery leases, frozen
 * payloads, and saved receipts keep overlapping runs from double-sending.
 */
export async function handleDeliveryRetry(
  req: Request,
  body: Record<string, unknown>,
  admin: SupabaseClient,
): Promise<Response> {
  const auth = await authorizeRetry(req);
  const requeued = body.requeue_id !== undefined;
  if (requeued) await requeue(admin, auth.mode, body.requeue_id);
  const mailer = await resolveOfferMailer(admin);
  if (!mailer.ok) {
    if (auth.mode === "admin")
      throw new OfferError(
        503,
        "delivery_unavailable",
        "Download email is not configured, so nothing was retried.",
      );
    return offerJson(200, {
      sent: 0,
      remaining: 0,
      stopped: 0,
      errors: 0,
      skipped: "delivery_unavailable",
    });
  }
  const { data: items, error } = await admin
    .from("offer_access_deliveries")
    .select("id")
    .in("status", ["pending", "sending"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(auth.mode === "cron" ? CRON_RETRY_BATCH : ADMIN_RETRY_BATCH);
  if (error) throw error;
  const results = await Promise.allSettled(
    (items ?? []).map((item: { id: string }) =>
      attemptOfferAccess(admin, item.id),
    ),
  );
  const summary = summarize(results);
  if (summary.errors)
    console.error("Offer access retry batch had unsaved attempts", {
      errors: summary.errors,
    });
  return offerJson(200, requeued ? { ...summary, requeued } : summary);
}
