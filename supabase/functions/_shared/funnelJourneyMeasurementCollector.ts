import { readBoundedJson } from "./boundedJson.ts";
import { conversionHash, conversionRequestAllowed } from "./conversion.ts";
import {
  parseFunnelMeasurement,
  type FunnelMeasurementEvent,
} from "./funnelJourneyMeasurement.ts";

export interface FunnelMeasurementDependencies {
  origin(): Promise<string>;
  anonKey?: string;
  rateLimit(key: string, limit: number, seconds: number): Promise<boolean>;
  record(input: {
    sessionId: string;
    tokenHash: string;
    events: FunnelMeasurementEvent[];
    attribution: Record<string, string>;
  }): Promise<boolean>;
}
export function createFunnelMeasurementCollector(
  deps: FunnelMeasurementDependencies,
) {
  return async (request: Request) => {
    let origin = "";
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, private",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          ...(origin && request.headers.get("origin") === origin
            ? {
                "Access-Control-Allow-Origin": origin,
                Vary: "Origin",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers":
                  "authorization, apikey, content-type, x-client-info",
              }
            : {}),
        },
      });
    try {
      origin = await deps.origin();
      if (request.method === "OPTIONS") return reply(200, { ok: true });
      if (request.method !== "POST")
        return reply(405, { error: "Method not allowed" });
      if (!conversionRequestAllowed(request, origin, deps.anonKey))
        return reply(200, { accepted: false });
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          request.headers.get("content-type") ?? "",
        )
      )
        return reply(415, { error: "Invalid measurement request" });
      const body = parseFunnelMeasurement(await readBoundedJson(request, 8192));
      if (!body) return reply(400, { error: "Invalid measurement request" });
      const ip =
        request.headers.get("cf-connecting-ip")?.trim() ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
      if (
        !(await deps.rateLimit(
          `funnel-measurement:ip:${await conversionHash(ip)}`,
          600,
          3600,
        )) ||
        !(await deps.rateLimit(
          `funnel-measurement:session:${body.session_id}`,
          120,
          3600,
        ))
      )
        return reply(429, { error: "Please try later" });
      const accepted = await deps.record({
        sessionId: body.session_id,
        tokenHash: await conversionHash(body.session_token),
        events: body.events,
        attribution: body.attribution,
      });
      return reply(200, { accepted });
    } catch {
      return reply(503, { error: "Measurement unavailable" });
    }
  };
}
