import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { readBoundedJson } from "../_shared/boundedJson.ts";
import {
  parseSpeakingInquiry,
  speakingDatabaseError,
  SpeakingInquiryError,
  speakingHash,
} from "../_shared/speakingInquiries.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response(null, { headers: cors });
  if (request.method !== "POST")
    return json(405, { error: "Method not allowed" });
  try {
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        request.headers.get("content-type") ?? "",
      )
    )
      throw new SpeakingInquiryError(
        415,
        "invalid_input",
        "Please submit the inquiry form.",
      );
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw speakingDatabaseError("");
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    async function throttle(bucket: string, limit: number) {
      const { data, error } = await admin.rpc("newsletter_rate_limit_hit", {
        _key: `speaking:${bucket}`,
        _limit: limit,
        _window_seconds: 3600,
      });
      if (error) throw speakingDatabaseError("");
      if (data !== true)
        throw new SpeakingInquiryError(
          429,
          "rate_limited",
          "Please wait before trying again, or contact us by email below.",
        );
    }
    const ip =
      request.headers.get("cf-connecting-ip")?.trim() ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    await throttle(`ip:${await speakingHash(ip)}`, 30);
    const body = await readBoundedJson(request, 18000);
    if (!body)
      throw new SpeakingInquiryError(
        400,
        "invalid_input",
        "Please check your inquiry details and try again.",
      );
    // A filled trap receives the same acknowledgement without storing a lead.
    if (typeof body.website === "string" && body.website.trim())
      return json(200, { accepted: true });
    const inquiry = parseSpeakingInquiry(body);
    await throttle(`email:${await speakingHash(inquiry.email)}`, 8);
    const { error } = await admin.rpc("submit_speaking_inquiry", {
      _request_id: inquiry.request_id,
      _payload_hash: await speakingHash(JSON.stringify(inquiry)),
      _name: inquiry.name,
      _email: inquiry.email,
      _event_name: inquiry.event_name,
      _event_date: inquiry.event_date,
      _event_format: inquiry.event_format,
      _audience: inquiry.audience,
      _message: inquiry.message,
    });
    if (error) throw speakingDatabaseError(error.message);
    return json(200, { accepted: true });
  } catch (error) {
    if (error instanceof SpeakingInquiryError)
      return json(error.status, { error: error.message, code: error.code });
    // Never log contact details, request payloads, headers, or database errors.
    console.error("Speaking inquiry submission failed");
    return json(503, {
      error:
        "We could not confirm your inquiry. Please try again with the same details.",
      code: "unavailable",
    });
  }
});
