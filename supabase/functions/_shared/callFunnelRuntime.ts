import { OfferError } from "./offers.ts";
import type {
  CallFunnelRequest,
  CallWebhookEvent,
} from "./callFunnelRequests.ts";

type RpcResult = { data: unknown; error: { message?: string } | null };
export type CallFunnelDatabase = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};
export function callFunnelDatabaseError(error: {
  message?: string;
}): OfferError {
  const message = error.message ?? "";
  if (/expired/.test(message))
    return new OfferError(
      410,
      "expired",
      "Your saved application session has expired. Please contact the team if you already booked.",
    );
  if (/unavailable/.test(message))
    return new OfferError(
      404,
      "unavailable",
      "This application is not currently available.",
    );
  if (/conflict|replay|mismatch/.test(message))
    return new OfferError(
      409,
      "conflict",
      "This application request changed. Reload your saved application before trying again.",
    );
  if (
    /Invalid|missing|Unexpected|Required|predates|qualified|before attendance/.test(
      message,
    )
  )
    return new OfferError(
      400,
      "invalid_request",
      "Check your application details and try again.",
    );
  return new OfferError(
    503,
    "unavailable",
    "This application could not be saved. Your answers are still available; please retry.",
  );
}
export async function runCallFunnelRequest(
  body: CallFunnelRequest,
  database: CallFunnelDatabase,
  hashToken: (token: string) => Promise<string>,
): Promise<unknown> {
  let name: string;
  let args: Record<string, unknown>;
  if (body.action === "get") {
    name = "call_funnel_public_get";
    args = { _slug: body.slug };
  } else {
    const tokenHash = await hashToken(body.token);
    if (body.action === "state") {
      name = "call_funnel_application_view";
      args = { _token_hash: tokenHash };
    } else {
      name = "call_funnel_submit";
      // The database evaluates the pinned rules. No outcome supplied by a browser is accepted.
      args = {
        _slug: body.slug,
        _revision: body.revision,
        _token_hash: tokenHash,
        _request_id: body.requestId,
        _answers: body.answers,
        _contact: body.contact,
        _consent: true,
      };
    }
  }
  const { data, error } = await database.rpc(name, args);
  if (error) throw callFunnelDatabaseError(error);
  if (!data)
    throw new OfferError(
      404,
      "unavailable",
      "This application is not currently available.",
    );
  return data;
}
export async function runCallWebhookEvent(
  event: CallWebhookEvent,
  database: CallFunnelDatabase,
): Promise<{ accepted: true; eventId: string }> {
  const { error } = await database.rpc("call_funnel_record_event", {
    _application_id: event.applicationId,
    _event_key: event.eventId,
    _type: event.type,
    _occurred_at: event.occurredAt,
    _starts_at: event.startsAt ?? null,
    _reference: event.reference,
    _note: "",
    _source: "signed_webhook",
    _actor_id: null,
  });
  if (error) throw callFunnelDatabaseError(error);
  return { accepted: true, eventId: event.eventId };
}
