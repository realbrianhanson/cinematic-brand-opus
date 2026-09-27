import {
  parseCallWebhookEvent,
  readCallWebhookBody,
  verifyCallWebhook,
} from "../_shared/callFunnelRequests.ts";
import { runCallWebhookEvent } from "../_shared/callFunnelRuntime.ts";
import { OfferError } from "../_shared/offers.ts";
import {
  offerAdminClient,
  offerFailure,
  offerJson,
} from "../_shared/offersRuntime.ts";

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST")
      throw new OfferError(405, "method", "Use POST.");
    const secret = Deno.env.get("CALL_FUNNEL_WEBHOOK_SECRET")?.trim() ?? "";
    if (secret.length < 32)
      throw new OfferError(
        503,
        "not_configured",
        "Call outcome synchronization is not configured.",
      );
    const raw = await readCallWebhookBody(request);
    if (raw === null)
      throw new OfferError(400, "invalid_request", "Invalid event body.");
    if (
      !(await verifyCallWebhook(
        raw,
        request.headers.get("x-call-timestamp"),
        request.headers.get("x-call-signature"),
        secret,
      ))
    )
      throw new OfferError(
        401,
        "invalid_signature",
        "Invalid event signature.",
      );
    let event;
    try {
      event = parseCallWebhookEvent(JSON.parse(raw));
    } catch {
      throw new OfferError(
        400,
        "invalid_request",
        "Invalid call outcome event.",
      );
    }
    return offerJson(200, await runCallWebhookEvent(event, offerAdminClient()));
  } catch (error) {
    return offerFailure(error);
  }
});
