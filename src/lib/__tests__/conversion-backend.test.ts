import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  conversionHash,
  parseConversionRequest,
} from "../../../supabase/functions/_shared/conversion";
import { createConversionCollector } from "../../../supabase/functions/_shared/conversionCollector";
import {
  bindOrderMeasurement,
  recordDownloadMeasurement,
  recordVerifiedPaymentMode,
} from "../../../supabase/functions/_shared/conversionOrders";

const sessionId = "12345678-1234-4123-8123-123456789012";
const sessionToken = "a".repeat(64);
const event = {
  id: "12345678-1234-4123-8123-123456789013",
  type: "page_view",
  path: "/",
};
const body = () => ({
  action: "record",
  consent: true,
  session_id: sessionId,
  session_token: sessionToken,
  events: [event],
});
const deps = {
  origin: vi.fn(async () => "https://example.com"),
  anonKey: "public-anon-key",
  rateLimit: vi.fn(
    async (_key: string, _limit: number, _seconds: number) => true,
  ),
  record: vi.fn(async () => true),
  forget: vi.fn(async () => undefined),
};
const handler = createConversionCollector(deps);
const request = (
  payload: unknown = body(),
  extra: Record<string, string> = {},
) =>
  new Request("https://backend.example.com/conversion-events", {
    method: "POST",
    headers: {
      Origin: "https://example.com",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
      ...extra,
    },
    body: JSON.stringify(payload),
  });
beforeEach(() => {
  vi.clearAllMocks();
  deps.rateLimit.mockResolvedValue(true);
  deps.record.mockResolvedValue(true);
  deps.origin.mockResolvedValue("https://example.com");
});
describe("bounded optional measurement collector", () => {
  it("accepts only fixed planner projects/actions and discards all answers and prompt text", async () => {
    const actions = [
      "build_plan_created",
      "build_prompt_copied",
      "build_plan_downloaded",
      "build_training_clicked",
    ];
    for (const type of actions) {
      const planner = {
        ...event,
        type,
        path: "/first-ai-build",
        project: "inquiries",
        ...(type === "build_training_clicked" ? { offer_id: sessionId } : {}),
      };
      const parsed = parseConversionRequest({
        ...body(),
        events: [
          {
            ...planner,
            businessType: "Private business",
            audience: "Private audience",
            buildPrompt: "Private prompt",
          },
        ],
      });
      expect(parsed?.events).toEqual([planner]);
      for (const change of [
        { project: "Private business" },
        { project: undefined },
        { path: "/shop" },
        { destination: "workshop" },
      ]) {
        expect(
          parseConversionRequest({
            ...body(),
            events: [{ ...planner, ...change }],
          }),
        ).toBeNull();
      }
    }
    expect(
      parseConversionRequest({
        ...body(),
        events: [{ ...event, project: "inquiries" }],
      }),
    ).toBeNull();
    expect(
      parseConversionRequest({
        ...body(),
        events: [
          {
            ...event,
            type: "build_training_clicked",
            path: "/first-ai-build",
            project: "inquiries",
          },
        ],
      }),
    ).toBeNull();
  });
  it("stores only whitelisted fields and hashed session/IP capabilities", async () => {
    const payload = {
      ...body(),
      email: "ignored@example.com",
      user_agent: "secret",
      events: [
        {
          ...event,
          email: "ignored@example.com",
          timestamp: "1990-01-01",
          paid: true,
        },
      ],
      attribution: {
        source: "email",
        medium: "newsletter",
        campaign: "starter",
        term: "secret",
      },
    };
    const response = await handler(
      request(payload, { "cf-connecting-ip": "203.0.113.1" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true });
    expect(deps.record).toHaveBeenCalledWith({
      sessionId,
      tokenHash: await conversionHash(sessionToken),
      events: [event],
      attribution: {
        source: "email",
        medium: "newsletter",
        campaign: "starter",
      },
    });
    expect(deps.rateLimit).toHaveBeenCalledWith(
      `conversion:ip:${await conversionHash("203.0.113.1")}`,
      600,
      3600,
    );
    expect(JSON.stringify(deps.record.mock.calls)).not.toContain(sessionToken);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://example.com",
    );
  });
  it.each<Record<string, string>>([
    { Origin: "https://preview.lovable.app" },
    { Origin: "http://localhost:8090" },
    { DNT: "1" },
    { "Sec-GPC": "1" },
    { Authorization: "Bearer signed-in-user" },
    { Authorization: "Bearer forged-token" },
    { "User-Agent": "HeadlessChrome" },
    { "User-Agent": "Googlebot" },
    { Referer: "https://example.com/admin/offers" },
    { Referer: "https://example.com/offers/preview/id" },
    { Referer: "https://example.com/?measurement=off" },
    { "x-codex-qa": "1" },
  ])(
    "excludes opt-outs, QA, admins, bots and noncanonical origins: %j",
    async (headers) => {
      const response = await handler(request(body(), headers));
      expect(await response.json()).toEqual({ accepted: false });
      expect(deps.record).not.toHaveBeenCalled();
      expect(deps.rateLimit).not.toHaveBeenCalled();
    },
  );
  it("accepts the configured public key but never arbitrary bearer values", async () => {
    expect(
      (
        await handler(
          request(body(), { Authorization: "Bearer public-anon-key" }),
        )
      ).status,
    ).toBe(200);
    expect(deps.record).toHaveBeenCalledOnce();
  });
  it("requires explicit measurement consent", async () => {
    expect((await handler(request({ ...body(), consent: false }))).status).toBe(
      400,
    );
    expect(deps.record).not.toHaveBeenCalled();
  });
  it("rejects unbounded bodies, more than ten events, private routes and client outcomes", async () => {
    for (const payload of [
      { ...body(), padding: "x".repeat(8192) },
      { ...body(), events: Array.from({ length: 11 }, () => event) },
      { ...body(), events: [{ ...event, path: "/offer-access?token=secret" }] },
      { ...body(), events: [{ ...event, type: "purchase" }] },
    ])
      expect((await handler(request(payload))).status).toBe(400);
    expect(deps.record).not.toHaveBeenCalled();
  });
  it("bounds streamed payloads even without content-length", async () => {
    const req = request({ ...body(), padding: "x".repeat(8193) });
    expect(req.headers.has("content-length")).toBe(false);
    expect((await handler(req)).status).toBe(400);
  });
  it("rate limits before inserting events and does not return raw errors", async () => {
    deps.rateLimit.mockResolvedValue(false);
    expect((await handler(request())).status).toBe(429);
    expect(deps.record).not.toHaveBeenCalled();
    deps.rateLimit.mockResolvedValue(true);
    deps.record.mockRejectedValueOnce(new Error("secret provider detail"));
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
  });
  it("forgets using capability even after opt-out/GPC/auth changes without creating a session", async () => {
    const response = await handler(
      request(
        {
          action: "forget",
          session_id: sessionId,
          session_token: sessionToken,
        },
        { "Sec-GPC": "1", Authorization: "Bearer now-signed-in" },
      ),
    );
    expect(await response.json()).toEqual({ accepted: true });
    expect(deps.forget).toHaveBeenCalledWith(
      sessionId,
      await conversionHash(sessionToken),
    );
    expect(deps.record).not.toHaveBeenCalled();
  });
  it("keeps withdrawal available when the shared recording quota is exhausted", async () => {
    deps.rateLimit.mockImplementation(async (key) =>
      key.startsWith("conversion:forget:"),
    );
    expect((await handler(request())).status).toBe(429);
    const response = await handler(
      request({
        action: "forget",
        session_id: sessionId,
        session_token: sessionToken,
      }),
    );
    expect(await response.json()).toEqual({ accepted: true });
    expect(deps.forget).toHaveBeenCalledOnce();
  });
  it("rejects cross-origin forgetting and withholds CORS allowance", async () => {
    const response = await handler(
      request(
        {
          action: "forget",
          session_id: sessionId,
          session_token: sessionToken,
        },
        { Origin: "https://elsewhere.com" },
      ),
    );
    expect(await response.json()).toEqual({ accepted: false });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(deps.forget).not.toHaveBeenCalled();
  });
  it("discard unsafe UTM values instead of storing URL, email or oversized strings", () => {
    expect(
      parseConversionRequest({
        ...body(),
        attribution: {
          source: "email@example.com",
          medium: "https://private/path",
          campaign: "x".repeat(65),
        },
      })?.attribution,
    ).toEqual({ source: "direct", medium: "none", campaign: "none" });
  });
});
describe("nonblocking server-only native order facts", () => {
  it("binds only a canonical unauthed consenting session and classifies mode server-side", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    await bindOrderMeasurement(
      { rpc },
      {
        request: request(),
        measurement: { session_id: sessionId, session_token: sessionToken },
        origin: "https://example.com",
        orderId: "order-id",
        paymentMode: "test",
      },
    );
    expect(rpc).toHaveBeenCalledWith("conversion_bind_order", {
      _order_id: "order-id",
      _payment_mode: "test",
      _session_id: sessionId,
      _token_hash: await conversionHash(sessionToken),
    });
  });
  it("keeps operational mode with no optional browser link for opt-outs/admins", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    await bindOrderMeasurement(
      { rpc },
      {
        request: request(body(), { DNT: "1" }),
        measurement: { session_id: sessionId, session_token: sessionToken },
        origin: "https://example.com",
        orderId: "order-id",
        paymentMode: "live",
      },
    );
    expect(rpc).toHaveBeenCalledWith("conversion_bind_order", {
      _order_id: "order-id",
      _payment_mode: "live",
      _session_id: null,
      _token_hash: null,
    });
  });
  it("never fails customer fulfillment if optional measurement is unavailable", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rpc = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      bindOrderMeasurement(
        { rpc },
        {
          request: request(),
          measurement: null,
          origin: "https://example.com",
          orderId: "order-id",
          paymentMode: "unconfigured",
        },
      ),
    ).resolves.toBeUndefined();
    await expect(
      recordDownloadMeasurement({ rpc }, "order-id"),
    ).resolves.toBeUndefined();
    warning.mockRestore();
  });
  it("bounds never-resolving measurement to 500ms and aborts its network request", async () => {
    vi.useFakeTimers();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const signals: AbortSignal[] = [];
    const rpc = vi.fn(() => {
      const operation = new Promise<{ error: unknown }>(() => {});
      return Object.assign(operation, {
        abortSignal(signal: AbortSignal) {
          signals.push(signal);
          return operation;
        },
      });
    });
    try {
      const results = Promise.all([
        bindOrderMeasurement(
          { rpc },
          {
            request: request(),
            measurement: null,
            origin: "https://example.com",
            orderId: "order-id",
            paymentMode: "live",
          },
        ),
        recordDownloadMeasurement({ rpc }, "order-id"),
        recordVerifiedPaymentMode({ rpc }, "order-id", "live"),
      ]);
      await vi.advanceTimersByTimeAsync(500);
      await expect(results).resolves.toEqual([undefined, undefined, undefined]);
      expect(signals).toHaveLength(3);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
    } finally {
      vi.useRealTimers();
      warning.mockRestore();
    }
  });
});

const jwt = (payload: Record<string, unknown>) =>
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")}.signature`;
// What supabase.functions.invoke sends for an anonymous visitor: the bundled
// publishable key as both the apikey and the bearer.
const bundledKey = jwt({ iss: "supabase", ref: "project", role: "anon" });
const invokeHeaders = (key = bundledKey) => ({
  Authorization: `Bearer ${key}`,
  apikey: key,
});
describe("public key recognition", () => {
  it("measures anonymous visitors whose bundled key differs from the function's anon key", async () => {
    const response = await handler(request(body(), invokeHeaders()));
    expect(await response.json()).toEqual({ accepted: true });
    expect(deps.record).toHaveBeenCalledOnce();
  });
  it("accepts new-style publishable keys sent as both apikey and bearer", async () => {
    const response = await handler(
      request(body(), invokeHeaders("sb_publishable_abc123")),
    );
    expect(await response.json()).toEqual({ accepted: true });
  });
  it("still excludes signed-in sessions, even when the apikey is forged to match", async () => {
    const user = jwt({ role: "authenticated", sub: sessionId });
    for (const headers of [
      { Authorization: `Bearer ${user}`, apikey: bundledKey },
      invokeHeaders(user),
      { Authorization: "Bearer unrelated", apikey: bundledKey },
      invokeHeaders("not-a-public-key"),
    ]) {
      const response = await handler(request(body(), headers));
      expect(await response.json()).toEqual({ accepted: false });
    }
    expect(deps.record).not.toHaveBeenCalled();
  });
});
describe("order measurement binding with real client headers", () => {
  it("links a claim sent through supabase.functions.invoke", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await bindOrderMeasurement(
      { rpc },
      {
        request: request(body(), invokeHeaders()),
        measurement: { session_id: sessionId, session_token: sessionToken },
        origin: "https://example.com",
        anonKey: "a-different-configured-anon-key",
        orderId: "order-id",
        paymentMode: "unconfigured",
      },
    );
    expect(rpc).toHaveBeenCalledWith("conversion_bind_order", {
      _order_id: "order-id",
      _payment_mode: "unknown",
      _session_id: sessionId,
      _token_hash: await conversionHash(sessionToken),
    });
  });
  it("logs why a measured claim was not linked, without identifiers", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const rpc = vi.fn(async () => ({ data: false, error: null }));
      await bindOrderMeasurement(
        { rpc },
        {
          request: request(),
          measurement: { session_id: sessionId, session_token: sessionToken },
          origin: "https://example.com",
          orderId: "order-id",
          paymentMode: "live",
        },
      );
      expect(warning).toHaveBeenLastCalledWith("Order measurement not linked", {
        reason: "session_not_eligible",
      });
      await bindOrderMeasurement(
        { rpc },
        {
          request: request(body(), {
            Authorization: "Bearer unrelated",
            apikey: bundledKey,
          }),
          measurement: { session_id: sessionId, session_token: sessionToken },
          origin: "https://example.com",
          orderId: "order-id",
          paymentMode: "live",
        },
      );
      expect(warning).toHaveBeenLastCalledWith("Order measurement not linked", {
        reason: "request_excluded",
      });
      const logged = JSON.stringify(warning.mock.calls);
      expect(logged).not.toContain(sessionId);
      expect(logged).not.toContain(sessionToken);
      warning.mockClear();
      // A visitor who declined measurement is expected, not a failure.
      await bindOrderMeasurement(
        { rpc },
        {
          request: request(),
          measurement: undefined,
          origin: "https://example.com",
          orderId: "order-id",
          paymentMode: "live",
        },
      );
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });
});
