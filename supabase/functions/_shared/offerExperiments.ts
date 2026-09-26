import { readBoundedJson } from "./boundedJson.ts";
import { conversionHash, conversionRequestAllowed } from "./conversion.ts";

const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function experimentRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const x = value as Record<string, unknown>;
  if (
    Object.keys(x).some(
      (k) =>
        ![
          "action",
          "offer_id",
          "session_id",
          "session_token",
          "experiment_id",
          "variant",
        ].includes(k),
    ) ||
    !["assign", "expose"].includes(String(x.action)) ||
    !uuid.test(String(x.offer_id)) ||
    !uuid.test(String(x.session_id)) ||
    typeof x.session_token !== "string" ||
    !/^[a-f0-9]{64}$/.test(x.session_token)
  )
    return null;
  if (
    x.action === "expose"
      ? !uuid.test(String(x.experiment_id)) ||
        !["a", "b"].includes(String(x.variant))
      : x.experiment_id !== undefined || x.variant !== undefined
  )
    return null;
  return {
    action: x.action as "assign" | "expose",
    offer_id: String(x.offer_id),
    session_id: String(x.session_id),
    session_token: x.session_token,
    experiment_id: x.experiment_id as string | undefined,
    variant: x.variant as "a" | "b" | undefined,
  };
}
export function createExperimentHandler(deps: {
  origin(): Promise<string>;
  anonKey?: string;
  limit(key: string): Promise<boolean>;
  decide(input: {
    offerId: string;
    sessionId: string;
    tokenHash: string;
    experimentId?: string;
    variant?: string;
  }): Promise<unknown>;
}) {
  return async (req: Request) => {
    let origin = "";
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, private",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
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
      if (req.method === "OPTIONS") return reply(200, {});
      if (req.method !== "POST")
        return reply(405, { error: "Method not allowed" });
      if (!conversionRequestAllowed(req, origin, deps.anonKey))
        return reply(200, { decision: null });
      const input = experimentRequest(await readBoundedJson(req, 2048));
      if (!input) return reply(400, { error: "Invalid experiment request" });
      const ip =
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-forwarded-for")?.split(",")[0] ||
        "unknown";
      if (
        !(await deps.limit(`experiment:ip:${await conversionHash(ip)}`)) ||
        !(await deps.limit(`experiment:session:${input.session_id}`))
      )
        return reply(429, { error: "Please try later" });
      const decision = await deps.decide({
        offerId: input.offer_id,
        sessionId: input.session_id,
        tokenHash: await conversionHash(input.session_token),
        experimentId: input.experiment_id,
        variant: input.variant,
      });
      return reply(200, { decision });
    } catch {
      return reply(503, { error: "Experiment unavailable" });
    }
  };
}
