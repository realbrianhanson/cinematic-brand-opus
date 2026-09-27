import { createHmac, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseCallFunnelRequest,
  parseCallWebhookEvent,
  readCallWebhookBody,
  verifyCallWebhook,
} from "../../../supabase/functions/_shared/callFunnelRequests";
import {
  callFunnelDatabaseError,
  runCallFunnelRequest,
  runCallWebhookEvent,
} from "../../../supabase/functions/_shared/callFunnelRuntime";
const id = "00000000-0000-4000-8000-000000000001";
const body = () => ({
  action: "submit" as const,
  slug: "example",
  revision: 2,
  token: "a".repeat(64),
  requestId: id,
  answers: { ready: "yes", goal: "A useful goal" },
  contact: { name: "Applicant", email: "applicant@example.com" },
  consent: true as const,
});
const event = () => ({
  eventId: "provider-event-1",
  applicationId: id,
  type: "booked" as const,
  occurredAt: "2026-09-28T12:00:00.000Z",
  startsAt: "2026-09-30T12:00:00.000Z",
  reference: "appointment-123",
});
afterEach(() => vi.unstubAllGlobals());
describe("call application transport", () => {
  it("accepts only supported exact actions and does not accept client outcomes", () => {
    expect(parseCallFunnelRequest(body())).toEqual(body());
    expect(parseCallFunnelRequest({ action: "get", slug: "example" })).toEqual({
      action: "get",
      slug: "example",
    });
    expect(
      parseCallFunnelRequest({ action: "state", token: "a".repeat(64) }),
    ).toEqual({ action: "state", token: "a".repeat(64) });
    for (const extra of [
      { outcome: "qualified" },
      { booked: true },
      { consent: false },
      { revision: 0 },
      { revision: 1.5 },
      { contact: { ...body().contact, role: "admin" } },
      { answers: { goal: "x".repeat(2001) } },
      { answers: { "invalid key": "yes" } },
      { token: "short" },
      { requestId: "short" },
      { contact: { name: "Applicant", email: "not-an-email" } },
    ])
      expect(() => parseCallFunnelRequest({ ...body(), ...extra })).toThrow();
    for (const bad of [
      null,
      [],
      { action: "start" },
      { action: "get", slug: "example", scripts: true },
    ])
      expect(() => parseCallFunnelRequest(bad)).toThrow();
  });
  it("hashes the capability and lets the database evaluate the pinned revision", async () => {
    const rpc = vi.fn(async () => ({
      data: { id, outcome: "alternative" },
      error: null,
    }));
    const hash = vi.fn(async () => "b".repeat(64));
    const result = await runCallFunnelRequest(body(), { rpc }, hash);
    expect(result).toEqual({ id, outcome: "alternative" });
    expect(hash).toHaveBeenCalledWith(body().token);
    expect(rpc).toHaveBeenCalledWith("call_funnel_submit", {
      _slug: "example",
      _revision: 2,
      _token_hash: "b".repeat(64),
      _request_id: id,
      _answers: body().answers,
      _contact: body().contact,
      _consent: true,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(body().token);
  });
  it("returns safe actionable errors without database payloads or PII", async () => {
    for (const [message, status] of [
      ["Application session expired", 410],
      ["Application session unavailable", 404],
      ["Call funnel unavailable", 404],
      ["Application replay mismatch", 409],
      ["Required application answer missing", 400],
      ["private SQL error applicant@example.com", 503],
    ] as const) {
      const error = callFunnelDatabaseError({ message });
      expect(error.status).toBe(status);
      expect(error.message).not.toContain("applicant@example.com");
    }
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await expect(
      runCallFunnelRequest(
        { action: "get", slug: "missing" },
        { rpc },
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
describe("call outcome webhook", () => {
  const now = Date.parse("2026-09-28T12:00:00.000Z");
  it("requires a bounded event identity, booking time and actual provider reference", () => {
    expect(parseCallWebhookEvent(event(), now)).toEqual(event());
    for (const extra of [
      { source: "admin" },
      { eventId: "" },
      { reference: "" },
      { startsAt: undefined },
      { applicationId: "bad" },
      { type: "paid" },
      { occurredAt: "tomorrow" },
      { occurredAt: "2026-02-31T12:00:00.000Z" },
      { occurredAt: "2026-02-01T24:00:00.000Z" },
      { occurredAt: "0000-02-01T12:00:00.000Z" },
      { occurredAt: "2026-09-28T12:06:00.000Z" },
      { reference: "x".repeat(301) },
    ])
      expect(() =>
        parseCallWebhookEvent({ ...event(), ...extra }, now),
      ).toThrow();
  });
  it("verifies the raw body, secret and timestamp together and rejects replay windows", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const secret = "s".repeat(40);
    const timestamp = String(now / 1000);
    const raw = JSON.stringify(event());
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${raw}`)
      .digest("hex");
    expect(
      await verifyCallWebhook(raw, timestamp, signature, secret, now),
    ).toBe(true);
    expect(
      await verifyCallWebhook(`${raw} `, timestamp, signature, secret, now),
    ).toBe(false);
    expect(
      await verifyCallWebhook(
        raw,
        timestamp,
        signature,
        "wrong".repeat(8),
        now,
      ),
    ).toBe(false);
    expect(
      await verifyCallWebhook(raw, timestamp, signature, secret, now + 300001),
    ).toBe(false);
    expect(
      await verifyCallWebhook(raw, timestamp, signature, "short", now),
    ).toBe(false);
    expect(await verifyCallWebhook(raw, timestamp, null, secret, now)).toBe(
      false,
    );
  });
  it("bounds raw payload allocation, including when a header understates the body", async () => {
    const request = (text: string, headers = {}) =>
      new Request("https://example.com/hook", {
        method: "POST",
        body: text,
        headers,
      });
    expect(await readCallWebhookBody(request("valid"), 5)).toBe("valid");
    expect(
      await readCallWebhookBody(
        request("too big", { "content-length": "1" }),
        5,
      ),
    ).toBeNull();
    expect(
      await readCallWebhookBody(
        request("valid", { "content-length": "9000" }),
        5,
      ),
    ).toBeNull();
  });
  it("writes only signed-webhook provenance and keeps operational details out of the response", async () => {
    const rpc = vi.fn(async () => ({
      data: { private_note: "internal" },
      error: null,
    }));
    expect(await runCallWebhookEvent(event(), { rpc })).toEqual({
      accepted: true,
      eventId: "provider-event-1",
    });
    expect(rpc).toHaveBeenCalledWith("call_funnel_record_event", {
      _application_id: id,
      _event_key: "provider-event-1",
      _type: "booked",
      _occurred_at: event().occurredAt,
      _starts_at: event().startsAt,
      _reference: "appointment-123",
      _note: "",
      _source: "signed_webhook",
      _actor_id: null,
    });
  });
});
