import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";

const mock = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mock.invoke } },
}));

import {
  BACKEND_NOT_READY,
  PUBLISH_FUNCTION,
  callManualPublish,
  checkPublishReadiness,
  heldReasonSentences,
} from "../manualPublishClient";

const POST = "10000000-0000-4000-8000-000000000001";
const httpError = (status: number, body: unknown) => ({
  data: null,
  error: new FunctionsHttpError(new Response(JSON.stringify(body), { status })),
});

beforeEach(() => mock.invoke.mockReset());

describe("manual-publish client", () => {
  it("only ever calls the v2 function, never the original manual-publish", () => {
    // The original function ignores mode and publishes on every call.
    expect(PUBLISH_FUNCTION).toBe("manual-publish-v2");
  });

  it("pauses safely when the v2 backend is not deployed yet", async () => {
    mock.invoke.mockResolvedValue(
      httpError(404, {
        code: "NOT_FOUND",
        message: "Requested function was not found",
      }),
    );
    await expect(checkPublishReadiness(POST)).rejects.toThrow(
      BACKEND_NOT_READY,
    );
    await expect(
      callManualPublish({
        postId: POST,
        mode: "schedule",
        scheduledAt: "2026-10-01T15:00:00Z",
      }),
    ).rejects.toThrow(BACKEND_NOT_READY);
    expect(mock.invoke).toHaveBeenCalledTimes(2);
    for (const call of mock.invoke.mock.calls)
      expect(call[0]).toBe("manual-publish-v2");
  });

  it("checks readiness with mode 'check' for exactly one post", async () => {
    mock.invoke.mockResolvedValue({
      data: { ok: true, decision: "ready", failures: [], reasons: [] },
      error: null,
    });
    await expect(checkPublishReadiness(POST)).resolves.toEqual({
      ready: true,
      failures: [],
      reasons: [],
    });
    expect(mock.invoke).toHaveBeenCalledWith("manual-publish-v2", {
      body: { post_id: POST, mode: "check" },
    });
  });

  it("returns plain-English failures and codes when the check is blocked", async () => {
    mock.invoke.mockResolvedValue({
      data: {
        ok: true,
        decision: "blocked",
        failures: ["Quality score 62, needs 85"],
        reasons: [
          { code: "quality_low", message: "Quality score 62, needs 85" },
        ],
      },
      error: null,
    });
    const result = await checkPublishReadiness(POST);
    expect(result.ready).toBe(false);
    expect(result.reasons).toEqual([
      { code: "quality_low", message: "Quality score 62, needs 85" },
    ]);
  });

  it("turns a 422 into a blocked outcome with the server's reason error", async () => {
    mock.invoke.mockResolvedValue(
      httpError(422, {
        ok: false,
        decision: "blocked",
        failures: ["Not fact-checked yet"],
        reasons: [
          { code: "fact_check_missing", message: "Not fact-checked yet" },
        ],
        reason_error: "Override reason must be at least 10 characters",
      }),
    );
    await expect(
      callManualPublish({ postId: POST, mode: "publish", overrideReason: "x" }),
    ).resolves.toEqual({
      kind: "blocked",
      failures: ["Not fact-checked yet"],
      reasons: [
        { code: "fact_check_missing", message: "Not fact-checked yet" },
      ],
      reasonError: "Override reason must be at least 10 characters",
    });
  });

  it("sends schedule mode with the time and a trimmed override reason", async () => {
    mock.invoke.mockResolvedValue({
      data: {
        ok: true,
        decision: "scheduled_with_override",
        updated_at: "v9",
        scheduled_at: "2026-10-01T09:00:00.000Z",
      },
      error: null,
    });
    const result = await callManualPublish({
      postId: POST,
      mode: "schedule",
      scheduledAt: "2026-10-01T09:00:00.000Z",
      overrideReason: "  Reviewed every claim by hand  ",
    });
    expect(mock.invoke).toHaveBeenCalledWith("manual-publish-v2", {
      body: {
        post_id: POST,
        mode: "schedule",
        scheduled_at: "2026-10-01T09:00:00.000Z",
        override_reason: "Reviewed every claim by hand",
      },
    });
    expect(result).toEqual({
      kind: "done",
      decision: "scheduled_with_override",
      updatedAt: "v9",
      scheduledAt: "2026-10-01T09:00:00.000Z",
    });
  });

  it("surfaces 409 and 400 messages as plain errors", async () => {
    mock.invoke.mockResolvedValue(
      httpError(409, {
        ok: false,
        error: "This article is already live, so it can't be scheduled",
      }),
    );
    await expect(
      callManualPublish({ postId: POST, mode: "schedule", scheduledAt: "x" }),
    ).rejects.toThrow("already live");
  });

  it("reports a network failure in plain English", async () => {
    mock.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsFetchError(new TypeError("Failed to fetch")),
    });
    await expect(
      callManualPublish({ postId: POST, mode: "publish" }),
    ).rejects.toThrow(/couldn't reach the publishing service/i);
  });

  it("never treats an unconfirmed response as published", async () => {
    mock.invoke.mockResolvedValue({ data: null, error: null });
    await expect(
      callManualPublish({ postId: POST, mode: "publish" }),
    ).rejects.toThrow(/not confirmed/i);
  });

  it("splits a stored held reason into sentences", () => {
    expect(
      heldReasonSentences("Quality score 62, needs 85; Not fact-checked yet"),
    ).toEqual(["Quality score 62, needs 85", "Not fact-checked yet"]);
    expect(heldReasonSentences(null)).toEqual([]);
  });
});
