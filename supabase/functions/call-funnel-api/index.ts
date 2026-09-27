import { readBoundedJson } from "../_shared/boundedJson.ts";
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
      body.action === "submit" ? 20 : 240,
    );
    return offerJson(
      200,
      await runCallFunnelRequest(body, database, hashOfferToken),
    );
  } catch (error) {
    return offerFailure(error);
  }
});
