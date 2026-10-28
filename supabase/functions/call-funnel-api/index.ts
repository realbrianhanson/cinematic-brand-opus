import { readBoundedJson } from "../_shared/boundedJson.ts";
import { calendlyGatewayFetch } from "../_shared/calendlyBooking.ts";
import {
  inBackground,
  processCallFunnelMail,
} from "../_shared/callFunnelMailRuntime.ts";
import {
  processCallFunnelCrm,
  processGrokBotContactCrm,
} from "../_shared/callFunnelCrm.ts";
import { parseCallFunnelRequest } from "../_shared/callFunnelRequests.ts";
import { runCallFunnelRequest } from "../_shared/callFunnelRuntime.ts";
import { hashOfferToken, OfferError } from "../_shared/offers.ts";
import {
  offerAdminClient,
  offerFailure,
  offerJson,
  offerThrottle,
} from "../_shared/offersRuntime.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return offerJson(200, {});
  try {
    if (request.method !== "POST")
      throw new OfferError(405, "method", "Use POST.");
    const raw = await readBoundedJson(request, 40000);
    let body;
    try {
      body = parseCallFunnelRequest(raw);
    } catch {
      throw new OfferError(
        400,
        "invalid_request",
        "Check your name, email, consent and application answers.",
      );
    }
    const database = offerAdminClient();
    const ip =
      request.headers.get("cf-connecting-ip")?.trim() ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    await offerThrottle(
      database,
      `call-funnel:${body.action}:${await hashOfferToken(ip)}`,
      body.action === "submit"
        ? 20
        : body.action === "calendly"
          ? 30
          : body.action === "capture"
            ? 120
            : 240,
    );
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")?.trim() ?? "";
    const calendlyKey = Deno.env.get("CALENDLY_API_KEY")?.trim() ?? "";
    const calendly =
      lovableKey && calendlyKey
        ? calendlyGatewayFetch(lovableKey, calendlyKey)
        : null;
    const result = await runCallFunnelRequest(
      body,
      database,
      hashOfferToken,
      calendly,
    );
    // Alert the owner and post the lead to the CRM right away; the 15-minute
    // worker retries any miss.
    const accepted = result as { id?: unknown; outcome?: unknown };
    const grokWebhookUrl = Deno.env.get("GROK_BOT_GHL_WEBHOOK_URL");
    if (body.action === "capture" && body.slug === "grok-bot-setup")
      inBackground(
        processGrokBotContactCrm(database, {
          tokenHash: await hashOfferToken(body.token),
          grokWebhookUrl,
        }),
        "Grok Bot contact CRM webhook deferred",
      );
    if (body.action === "submit" && typeof accepted.id === "string")
      inBackground(
        processCallFunnelCrm(database, {
          applicationId: accepted.id,
          grokWebhookUrl,
        }),
        "Call funnel CRM webhook deferred",
      );
    if (
      body.action === "submit" &&
      accepted.outcome === "qualified" &&
      typeof accepted.id === "string"
    )
      inBackground(
        processCallFunnelMail(database, Deno.env.get("RESEND_API_KEY"), {
          applicationId: accepted.id,
        }),
      );
    return offerJson(200, result);
  } catch (error) {
    return offerFailure(error);
  }
});
