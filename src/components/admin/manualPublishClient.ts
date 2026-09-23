import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Client for the manual-publish edge function. Every publish, schedule or
 * readiness check for ONE article goes through here, so the gate always runs
 * and overrides are recorded one article at a time. There is deliberately no
 * multi-post variant.
 */

export type PublishMode = "publish" | "schedule";
export const MIN_OVERRIDE_REASON = 10;

export interface GateReason {
  code: string;
  message: string;
}

export type PublishDecision =
  | "published"
  | "published_with_override"
  | "scheduled"
  | "scheduled_with_override";

export type PublishOutcome =
  | {
      kind: "done";
      decision: PublishDecision;
      updatedAt: string | null;
      scheduledAt: string | null;
    }
  | {
      kind: "blocked";
      failures: string[];
      reasons: GateReason[];
      reasonError: string | null;
    };

export interface Readiness {
  ready: boolean;
  failures: string[];
  reasons: GateReason[];
}

const NETWORK_ERROR =
  "Couldn't reach the publishing service. Check your connection and try again";
const NOT_CONFIRMED =
  "Publishing was not confirmed. Reload the article to see its current status before retrying";
const DECISIONS: readonly PublishDecision[] = [
  "published",
  "published_with_override",
  "scheduled",
  "scheduled_with_override",
];

type Body = Record<string, unknown>;

function asRecord(value: unknown): Body {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Body)
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && !!v.trim())
    : [];
}

function gateReasons(value: unknown, failures: string[]): GateReason[] {
  const parsed = Array.isArray(value)
    ? value.flatMap((row) => {
        const r = asRecord(row);
        return typeof r.code === "string" && typeof r.message === "string"
          ? [{ code: r.code, message: r.message }]
          : [];
      })
    : [];
  // Older responses only carry sentences; keep them visible without a code.
  return parsed.length
    ? parsed
    : failures.map((message) => ({ code: "unknown", message }));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Plain-English message from an edge-function error body. */
function bodyMessage(body: Body): string | null {
  return text(body.error) ?? text(body.reason) ?? text(body.message);
}

interface InvokeResult {
  status: number;
  body: Body;
}

/**
 * Invoke an admin edge function and always resolve to { status, body }, so
 * callers can branch on 422 / 409 without string-matching errors. Network
 * failures throw a plain sentence.
 */
export async function invokeAdminFunction(
  name: string,
  body: Body,
): Promise<InvokeResult> {
  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    result = await supabase.functions.invoke(name, { body });
  } catch {
    throw new Error(NETWORK_ERROR);
  }
  const { data, error } = result;
  if (!error) return { status: 200, body: asRecord(data) };
  if (
    error instanceof FunctionsHttpError &&
    error.context instanceof Response
  ) {
    const status = error.context.status;
    let parsed: Body = {};
    try {
      parsed = asRecord(await error.context.clone().json());
    } catch {
      /* Non-JSON error body: fall through to a status-based message. */
    }
    return { status, body: parsed };
  }
  if (error instanceof FunctionsFetchError) throw new Error(NETWORK_ERROR);
  throw new Error(
    error instanceof Error && error.message ? error.message : NETWORK_ERROR,
  );
}

function failureFor(status: number, body: Body): Error {
  const message = bodyMessage(body);
  if (message) return new Error(message);
  if (status === 401 || status === 403)
    return new Error(
      "Your admin session may have expired. Sign in again, then retry",
    );
  if (status === 409)
    return new Error(
      "The article changed while this was running. Reload and try again",
    );
  return new Error(NOT_CONFIRMED);
}

function blocked(body: Body): PublishOutcome {
  const failures = strings(body.failures);
  return {
    kind: "blocked",
    failures,
    reasons: gateReasons(body.reasons, failures),
    reasonError: text(body.reason_error),
  };
}

/** Publish now or schedule ONE article through the publish gate. */
export async function callManualPublish(request: {
  postId: string;
  mode: PublishMode;
  scheduledAt?: string | null;
  overrideReason?: string;
}): Promise<PublishOutcome> {
  const payload: Body = { post_id: request.postId, mode: request.mode };
  if (request.mode === "schedule") payload.scheduled_at = request.scheduledAt;
  const reason = request.overrideReason?.trim();
  if (reason) payload.override_reason = reason;

  const { status, body } = await invokeAdminFunction("manual-publish", payload);
  if (status === 422 && body.decision === "blocked") return blocked(body);
  if (status !== 200 || body.ok !== true) throw failureFor(status, body);
  if (body.already_published === true)
    return {
      kind: "done",
      decision: "published",
      updatedAt: text(body.updated_at),
      scheduledAt: null,
    };
  const decision = DECISIONS.find((d) => d === body.decision);
  if (!decision) throw new Error(NOT_CONFIRMED);
  return {
    kind: "done",
    decision,
    updatedAt: text(body.updated_at),
    scheduledAt: text(body.scheduled_at),
  };
}

/** Runs the publish gate for one article without changing it. */
export async function checkPublishReadiness(
  postId: string,
): Promise<Readiness> {
  const { status, body } = await invokeAdminFunction("manual-publish", {
    post_id: postId,
    mode: "check",
  });
  if (status !== 200 || body.ok !== true) throw failureFor(status, body);
  if (body.decision !== "ready" && body.decision !== "blocked")
    throw new Error(
      "The publishing check returned an unexpected result. Try Re-check",
    );
  const failures = strings(body.failures);
  return {
    ready: body.decision === "ready" && failures.length === 0,
    failures,
    reasons: gateReasons(body.reasons, failures),
  };
}

/** posts.held_reason is stored as "; "-separated sentences. */
export function heldReasonSentences(value: string | null | undefined) {
  return (value ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isOverride(decision: PublishDecision) {
  return decision.endsWith("_with_override");
}
