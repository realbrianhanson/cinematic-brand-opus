import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyCallFunnelConfig } from "@/lib/callFunnels";
import {
  getCallApplicationState,
  getCallPublication,
  isCallMutationRejected,
  saveCallFunnel,
  saveCallOutcome,
  submitCallApplication,
  type CallSave,
} from "@/lib/callFunnelsClient";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
}));
const save = (): CallSave => ({
  id: "id",
  slug: "example",
  title: " Example ",
  config: emptyCallFunnelConfig(),
  expectedVersion: 3,
  publish: false,
  active: false,
  requestId: "save-id",
});
beforeEach(() => vi.clearAllMocks());
describe("call funnel client mutation contracts", () => {
  it("preserves exact save identity and optimistic version", async () => {
    const input = save();
    mocks.rpc.mockResolvedValue({
      data: { id: input.id, draft_config: input.config },
      error: null,
    });
    await saveCallFunnel(input);
    expect(mocks.rpc).toHaveBeenCalledWith("call_funnel_save", {
      _id: "id",
      _slug: "example",
      _title: "Example",
      _config: input.config,
      _expected_version: 3,
      _publish: false,
      _active: false,
      _request_id: "save-id",
    });
  });
  it("rejects incomplete publication before a server mutation and identifies conflicts", async () => {
    await expect(saveCallFunnel({ ...save(), publish: true })).rejects.toThrow(
      /calendar/,
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Call funnel version conflict" },
    });
    await expect(saveCallFunnel(save())).rejects.toThrow(
      /Another administrator/,
    );
  });
  it("sends outcomes with one explicit identity and no fabricated verification", async () => {
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    await saveCallOutcome({
      applicationId: "app",
      requestId: "stable",
      type: "sale",
      occurredAt: "2026-09-27T12:00:00Z",
      startsAt: null,
      reference: "CRM-1",
      note: "Reviewed by team",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("call_funnel_admin_event", {
      _application_id: "app",
      _request_id: "stable",
      _type: "sale",
      _occurred_at: "2026-09-27T12:00:00Z",
      _starts_at: null,
      _reference: "CRM-1",
      _note: "Reviewed by team",
    });
  });
  it("keeps access tokens in POST bodies and retains actionable HTTP error status", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { id: "app" }, error: null });
    await getCallApplicationState("secret-token");
    expect(mocks.invoke).toHaveBeenCalledWith("call-funnel-api", {
      body: { action: "state", token: "secret-token" },
    });
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({ error: "Application session expired" }),
          { status: 410 },
        ),
      },
    });
    await expect(getCallApplicationState("expired")).rejects.toMatchObject({
      status: 410,
      message: "Application session expired",
    });
  });
  it("does not send client-computed qualification or booking status", async () => {
    mocks.invoke.mockResolvedValue({ data: { id: "app" }, error: null });
    const input = {
      slug: "example",
      revision: 2,
      token: "token",
      requestId: "request",
      answers: { ready: "yes" },
      contact: { name: "Example", email: "example@example.com" },
      consent: true as const,
    };
    await submitCallApplication(input);
    expect(mocks.invoke).toHaveBeenCalledWith("call-funnel-api", {
      body: { action: "submit", ...input },
    });
  });
  it("distinguishes rolled-back validation and slug failures from uncertain transport errors", async () => {
    for (const code of ["P0001", "23505", "23514", "42501", "PGRST202"]) {
      mocks.rpc.mockResolvedValueOnce({
        data: null,
        error: { code, message: "Rejected" },
      });
      let caught: unknown;
      try {
        await saveCallFunnel(save());
      } catch (error) {
        caught = error;
      }
      expect(isCallMutationRejected(caught)).toBe(true);
      if (code === "23505")
        expect((caught as Error).message).toContain("different address");
    }
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Failed to fetch" },
    });
    await expect(saveCallFunnel(save())).rejects.toMatchObject({
      rejected: false,
    });
    mocks.rpc.mockRejectedValueOnce(new Error("Network error"));
    let unknown: unknown;
    try {
      await saveCallFunnel(save());
    } catch (error) {
      unknown = error;
    }
    expect(isCallMutationRejected(unknown)).toBe(false);
  });
  it("classifies an outcome rejected for missing booking as editable", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "P0001",
        message: "Record an active booking before attendance",
      },
    });
    await expect(
      saveCallOutcome({
        applicationId: "app",
        requestId: "request",
        type: "attended",
        occurredAt: "2026-09-27T12:00:00Z",
        startsAt: null,
        reference: "CRM",
        note: "Check",
      }),
    ).rejects.toMatchObject({
      rejected: true,
      message: expect.stringContaining("active booking"),
    });
  });
  it("returns unavailable for a missing public funnel while preserving server failures", async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
        }),
      },
    });
    await expect(getCallPublication("missing")).resolves.toBeNull();
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "Try again" }), {
          status: 503,
        }),
      },
    });
    await expect(
      getCallPublication("temporarily-unavailable"),
    ).rejects.toMatchObject({ status: 503 });
  });
});
