import { OfferError } from "./offers.ts";
import {
  calendlyBookingEvents,
  type CalendlyFetch,
} from "./calendlyBooking.ts";
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
  calendly?: CalendlyFetch | null,
): Promise<unknown> {
  if (body.action === "calendly")
    return confirmCalendlyBooking(body, database, hashToken, calendly);
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
        _marketing: body.marketingConsent === true,
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
async function applicationView(
  database: CallFunnelDatabase,
  tokenHash: string,
): Promise<{ id: string; outcome: string }> {
  const { data, error } = await database.rpc("call_funnel_application_view", {
    _token_hash: tokenHash,
  });
  if (error) throw callFunnelDatabaseError(error);
  if (!data)
    throw new OfferError(
      404,
      "unavailable",
      "This application is not currently available.",
    );
  return data as { id: string; outcome: string };
}
/** The browser only reports which booking it made; Calendly confirms the details. */
async function confirmCalendlyBooking(
  body: Extract<CallFunnelRequest, { action: "calendly" }>,
  database: CallFunnelDatabase,
  hashToken: (token: string) => Promise<string>,
  calendly?: CalendlyFetch | null,
): Promise<unknown> {
  if (!calendly)
    throw new OfferError(
      503,
      "not_configured",
      "Booking confirmation is not configured. Your Calendly confirmation email has your call details.",
    );
  const tokenHash = await hashToken(body.token);
  const view = await applicationView(database, tokenHash);
  if (view.outcome !== "qualified")
    throw new OfferError(
      400,
      "invalid_request",
      "This application is not on the booking path.",
    );
  let events: CallWebhookEvent[];
  try {
    events = await calendlyBookingEvents(view.id, body.inviteeUri, calendly);
  } catch (error) {
    const foreign =
      error instanceof Error &&
      /another application|Invalid/.test(error.message);
    throw new OfferError(
      foreign ? 400 : 503,
      foreign ? "invalid_request" : "unavailable",
      foreign
        ? "That booking could not be matched to this application."
        : "Your booking is saved with Calendly, but we could not confirm it here yet. Please check again in a moment.",
    );
  }
  for (const event of events) await runCallWebhookEvent(event, database);
  return applicationView(database, tokenHash);
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
