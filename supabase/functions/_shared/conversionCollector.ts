import { readBoundedJson } from "./boundedJson.ts";
import {
  conversionHash,
  conversionRequestAllowed,
  parseConversionRequest,
} from "./conversion.ts";

export type ConversionCollectorDependencies = {
  origin(): Promise<string>;
  anonKey?: string;
  rateLimit(key: string, limit: number, seconds: number): Promise<boolean>;
  record(input: {
    sessionId: string;
    tokenHash: string;
    events: unknown[];
    attribution: Record<string, string>;
  }): Promise<boolean>;
  forget(sessionId: string, tokenHash: string): Promise<void>;
};
export function createConversionCollector(
  deps: ConversionCollectorDependencies,
) {
  return async (req: Request): Promise<Response> => {
    let origin = "";
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, private",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          ...(origin && req.headers.get("origin") === origin
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
      if (req.method === "OPTIONS") return reply(200, { ok: true });
      if (req.method !== "POST")
        return reply(405, { error: "Method not allowed" });
      // Refusal and invalid capabilities reveal no tracking or customer information.
      const body = parseConversionRequest(await readBoundedJson(req, 8192));
      if (!body) return reply(400, { error: "Invalid measurement request" });
      if (
        !conversionRequestAllowed(
          req,
          origin,
          deps.anonKey,
          body.action === "forget",
        )
      )
        return reply(200, { accepted: false });
      const ip =
        req.headers.get("cf-connecting-ip")?.trim() ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
      const ipHash = await conversionHash(ip);
      const quota = body.action === "forget" ? "forget" : "ip";
      if (!(await deps.rateLimit(`conversion:${quota}:${ipHash}`, 600, 3600)))
        return reply(429, { error: "Please try later" });
      const tokenHash = await conversionHash(body.session_token);
      if (body.action === "forget") {
        await deps.forget(body.session_id, tokenHash);
        return reply(200, { accepted: true });
      }
      if (
        !(await deps.rateLimit(
          `conversion:session:${body.session_id}`,
          120,
          3600,
        ))
      )
        return reply(429, { error: "Please try later" });
      const accepted = await deps.record({
        sessionId: body.session_id,
        tokenHash,
        events: body.events,
        attribution: body.attribution,
      });
      return reply(200, { accepted });
    } catch {
      // No request bodies, token, IP, user agent or provider error text in logs.
      return reply(503, { error: "Measurement unavailable" });
    }
  };
}
