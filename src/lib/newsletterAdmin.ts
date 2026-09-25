// Admin-side newsletter operations: audience reads, confirmation resends and
// failed-delivery retries. Every provider/database failure becomes a string.
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { pendingBackendUpdate } from "@/lib/adminBackendUpdate";

type RpcResult = Promise<{
  data: unknown;
  error: { message?: string } | null;
}>;
// These RPCs ship in 20260923140000_newsletter_truth.sql and are not yet in
// the generated types; call through the client so `this` stays bound.
const untyped = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => RpcResult;
};

type Payload = Record<string, unknown>;

/** Body of an edge-function call, including non-2xx responses. */
export async function functionPayload(
  data: unknown,
  error: unknown,
): Promise<{ status: number; payload: Payload }> {
  if (!error)
    return {
      status: 200,
      payload: data && typeof data === "object" ? (data as Payload) : {},
    };
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    const payload = await context
      .clone()
      .json()
      .catch(() => ({}));
    return {
      status: context.status,
      payload: payload && typeof payload === "object" ? payload : {},
    };
  }
  return {
    status: 0,
    payload: {
      error:
        error instanceof Error ? error.message : "The request did not finish.",
    },
  };
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

function unavailableMessage(payload: Payload): string | null {
  const missing = Array.isArray(payload.missing)
    ? payload.missing.filter((m): m is string => typeof m === "string")
    : [];
  return missing.length
    ? `Email isn't configured: ${missing.join(", ")}`
    : null;
}

// ---- Delivery retry ---------------------------------------------------------

const RETRY_REASONS: Record<string, (r: Payload) => string> = {
  no_receipts: () =>
    "This issue was sent before delivery receipts existed, so it can't be resent safely.",
  uncertain_attempts: (r) =>
    `Resend's result is unknown for ${num(r.uncertain)} recipients. Check Resend before doing anything; retry stays locked to avoid double sends.`,
  nothing_to_retry: () => "There are no failed recipients to retry.",
  not_retryable: (r) =>
    `This issue is ${text(r.state) ?? "finished"} and can't be retried.`,
};

export interface DeliveryRunResult {
  state: string;
  sent: number;
  recipients: number;
  lastError: string | null;
  lastErrorStatus: number | null;
  message: string | null;
}

async function runDelivery(sendId: string): Promise<DeliveryRunResult> {
  const { data, error } = await supabase.functions.invoke(
    "send-weekly-newsletter",
    { body: { send_id: sendId } },
  );
  const { payload } = await functionPayload(data, error);
  const prerequisiteError = new Error(
    text(payload.error) ?? text(payload.last_error) ?? "",
  );
  if (pendingBackendUpdate(prerequisiteError, "newsletter"))
    throw prerequisiteError;
  return {
    state: text(payload.state) ?? "unknown",
    sent: num(payload.sent),
    recipients: num(payload.recipients),
    lastError: text(payload.last_error),
    lastErrorStatus:
      typeof payload.last_error_status === "number"
        ? payload.last_error_status
        : null,
    message: unavailableMessage(payload) ?? text(payload.error),
  };
}

/** Resets definitively rejected recipients, then delivers to them once. */
export async function retryFailedDelivery(
  sendId: string,
): Promise<DeliveryRunResult> {
  const { data, error } = await untyped.rpc(
    "newsletter_retry_failed_delivery",
    { _send_id: sendId },
  );
  if (error) throw new Error(error.message || "Retry could not start.");
  const result = (data ?? {}) as Payload;
  if (result.ok !== true) {
    const reason = RETRY_REASONS[String(result.reason)];
    throw new Error(reason ? reason(result) : "Retry could not start.");
  }
  return runDelivery(sendId);
}

/** Continues a queued send whose previous run stopped before finishing. */
export function resumeDelivery(sendId: string): Promise<DeliveryRunResult> {
  return runDelivery(sendId);
}

// ---- Audience -----------------------------------------------------------------

export const AUDIENCE_PAGE_SIZE = 25;
export const audienceStatuses = [
  "confirmed",
  "pending",
  "unsubscribed",
  "bounced",
  "complained",
] as const;
export type AudienceStatus = (typeof audienceStatuses)[number];

const subscriberSchema = z.object({
  id: z.string(),
  email: z.string(),
  status: z.string(),
  source: z.string().nullable(),
  created_at: z.string(),
  confirmed_at: z.string().nullable(),
  unsubscribed_at: z.string().nullable(),
  last_confirmation_sent_at: z.string().nullable(),
  confirmation_send_count: z.number(),
});
const audienceSchema = z.object({
  counts: z.object({
    total: z.number(),
    confirmed: z.number(),
    pending: z.number(),
    unsubscribed: z.number(),
    bounced: z.number(),
    complained: z.number(),
    pending_not_emailed: z.number(),
  }),
  matching: z.number(),
  rows: z.array(subscriberSchema),
});
export type Audience = z.infer<typeof audienceSchema>;
export type Subscriber = z.infer<typeof subscriberSchema>;

export async function loadAudience(params: {
  search: string;
  status: AudienceStatus | "all";
  page: number;
}): Promise<Audience> {
  const search = params.search.trim().slice(0, 254);
  const { data, error } = await untyped.rpc("admin_newsletter_audience", {
    _search: search || null,
    _status: params.status === "all" ? null : params.status,
    _limit: AUDIENCE_PAGE_SIZE,
    _offset: Math.max(0, Math.floor(params.page)) * AUDIENCE_PAGE_SIZE,
  });
  if (error) throw new Error(error.message || "Audience could not load.");
  return audienceSchema.parse(data);
}

export interface ResendSummary {
  ok: boolean;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
  error: string | null;
  providerStatus: number | null;
}

/** Calls newsletter-subscribe's admin-only resend_pending action. */
export async function resendPendingConfirmations(): Promise<ResendSummary> {
  const { data, error } = await supabase.functions.invoke(
    "newsletter-subscribe",
    { body: { resend_pending: true } },
  );
  const { status, payload } = await functionPayload(data, error);
  const ok = status >= 200 && status < 300 && payload.ok === true;
  return {
    ok,
    pending: num(payload.pending),
    sent: num(payload.sent),
    failed: num(payload.failed),
    skipped: num(payload.skipped),
    remaining: num(payload.remaining),
    error: ok
      ? null
      : (unavailableMessage(payload) ??
        text(payload.error) ??
        "Confirmation emails could not be sent."),
    providerStatus:
      typeof payload.provider_status === "number"
        ? payload.provider_status
        : null,
  };
}

// ---- Send history and receipts --------------------------------------------------

export interface SendHistoryRow {
  id: string;
  week_key: string;
  status: string;
  sent_count: number;
  recipient_count: number;
  last_error: string | null;
  last_error_status: number | null;
}

export const HISTORY_WEEKS = 8;

export async function loadSendHistory(): Promise<SendHistoryRow[]> {
  const { data, error } = await supabase
    .from("newsletter_sends")
    .select(
      "id, week_key, status, sent_count, recipient_count, last_error, last_error_status",
    )
    .order("week_key", { ascending: false })
    .limit(HISTORY_WEEKS);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SendHistoryRow[];
}

export interface DeliveryBreakdown {
  failed: number;
  uncertain: number;
  attempting: number;
  skipped: number;
}

/** Receipt counts per state (admin SELECT policy on newsletter_deliveries). */
export async function loadDeliveryBreakdown(
  sendId: string,
): Promise<DeliveryBreakdown> {
  const states = ["failed", "uncertain", "attempting", "skipped"] as const;
  const counts = await Promise.all(
    states.map(async (state) => {
      const { count, error } = await supabase
        .from("newsletter_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("send_id", sendId)
        .eq("status", state);
      if (error) throw new Error(error.message);
      return count ?? 0;
    }),
  );
  return {
    failed: counts[0],
    uncertain: counts[1],
    attempting: counts[2],
    skipped: counts[3],
  };
}
