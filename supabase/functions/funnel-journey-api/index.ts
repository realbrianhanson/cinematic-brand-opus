import { readBoundedJson } from "../_shared/boundedJson.ts";
import {
  offerAdminClient,
  offerFailure,
  offerIpThrottle,
  offerJson,
} from "../_shared/offersRuntime.ts";
import { hashOfferToken, OfferError } from "../_shared/offers.ts";
import { parseFunnelRequest } from "../_shared/funnelJourneyRequests.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return offerJson(200, {});
  try {
    if (req.method !== "POST") throw new OfferError(405, "method", "Use POST.");
    const raw = await readBoundedJson(req, 4096);
    let body;
    try {
      body = parseFunnelRequest(raw);
    } catch {
      throw new OfferError(400, "invalid_request", "Invalid journey request.");
    }
    const admin = offerAdminClient();
    await offerIpThrottle(admin, req, "journey");
    let rpc: string;
    let args: Record<string, unknown>;
    if (body.action === "get") {
      rpc = "funnel_public_journey";
      args = { _slug: body.slug };
    } else {
      const tokenHash = await hashOfferToken(body.token);
      if (body.action === "start") {
        rpc = "funnel_session_start";
        args = { _slug: body.slug, _token_hash: tokenHash };
      } else if (body.action === "state") {
        rpc = "funnel_session_view";
        args = { _token_hash: tokenHash };
      } else {
        rpc = "funnel_session_advance";
        args = {
          _token_hash: tokenHash,
          _step_id: body.stepId,
          _answer: body.answer ?? null,
          _expected_version: body.expectedVersion,
          _request_id: body.requestId,
        };
      }
    }
    const { data, error } = await admin.rpc(rpc, args);
    if (error) {
      const msg = error.message ?? "";
      if (/expired/.test(msg))
        throw new OfferError(
          410,
          "session_expired",
          "This session has expired. Start again to continue.",
        );
      if (/unavailable/.test(msg))
        throw new OfferError(
          404,
          "unavailable",
          "This journey is not available.",
        );
      if (/conflict|replay|mismatch/.test(msg))
        throw new OfferError(
          409,
          "conflict",
          "Your progress changed. Reload your current step before continuing.",
        );
      if (/choice|answer|ended/.test(msg))
        throw new OfferError(
          400,
          "invalid_transition",
          "Choose an available answer or reload your current step.",
        );
      throw error;
    }
    return offerJson(200, data);
  } catch (error) {
    return offerFailure(error);
  }
});
