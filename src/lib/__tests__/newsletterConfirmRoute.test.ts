import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  type FakeState,
} from "../../components/admin/__tests__/fakeSupabaseQuery";

const state = vi.hoisted(() => ({
  ops: [],
  respond: () => ({ data: null, error: null }),
})) as FakeState;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: createFakeSupabase(state),
}));

import { Route } from "../../routes/api/public/newsletter/confirm";

const handler = (
  Route.options as unknown as {
    server: {
      handlers: { GET: (args: { request: Request }) => Promise<Response> };
    };
  }
).server.handlers.GET;

const request = (query = "?token=test-token") =>
  handler({
    request: new Request(
      `https://preview.example.com/api/public/newsletter/confirm${query}`,
    ),
  });

beforeEach(() => {
  state.ops = [];
  state.respond = (op) => {
    if (op.table === "site_settings")
      return { data: { site_url: "https://example.com/" }, error: null };
    if (op.action === "update") return { data: { id: "s1" }, error: null };
    return { data: { id: "s1", status: "pending" }, error: null };
  };
});

describe("public newsletter confirmation route", () => {
  it("confirms only the pending record matching the token and redirects to the configured site", async () => {
    const response = await request();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://example.com/newsletter/confirmed",
    );
    const update = state.ops.find((op) => op.action === "update");
    expect(update?.filters).toEqual(
      expect.arrayContaining([
        ["eq", "id", "s1"],
        ["eq", "confirm_token", "test-token"],
        ["eq", "status", "pending"],
      ]),
    );
    expect(update?.payload).toMatchObject({ status: "confirmed" });
  });

  it("does not look up a subscriber without a token", async () => {
    expect((await request("")).headers.get("location")).toMatch(/\/invalid$/);
    expect(state.ops.every((op) => op.table === "site_settings")).toBe(true);
  });

  it.each(["unsubscribed", "bounced", "complained"])(
    "does not reactivate a %s subscriber",
    async (status) => {
      const defaultRespond = state.respond;
      state.respond = (op) =>
        op.table === "newsletter_subscribers"
          ? { data: { id: "s1", status }, error: null }
          : defaultRespond(op);
      expect((await request()).headers.get("location")).toMatch(/\/invalid$/);
      expect(state.ops.some((op) => op.action === "update")).toBe(false);
    },
  );

  it("allows reopening an already confirmed token without writing again", async () => {
    const defaultRespond = state.respond;
    state.respond = (op) =>
      op.table === "newsletter_subscribers"
        ? { data: { id: "s1", status: "confirmed" }, error: null }
        : defaultRespond(op);
    expect((await request()).headers.get("location")).toMatch(/\/confirmed$/);
    expect(state.ops.some((op) => op.action === "update")).toBe(false);
  });

  it.each(["select", "update"])(
    "reports a failed subscriber %s as unavailable, not confirmed",
    async (action) => {
      const defaultRespond = state.respond;
      state.respond = (op) =>
        op.table === "newsletter_subscribers" && op.action === action
          ? { data: null, error: { message: "unavailable" } }
          : defaultRespond(op);
      const response = await request();
      expect(response.status).toBe(503);
      expect(response.headers.has("location")).toBe(false);
    },
  );

  it("does not claim success when a concurrent unsubscribe prevents the pending update", async () => {
    const defaultRespond = state.respond;
    state.respond = (op) =>
      op.action === "update" ? { data: null, error: null } : defaultRespond(op);
    expect((await request()).headers.get("location")).toMatch(/\/invalid$/);
  });

  it("fails closed when the configured site URL is absent", async () => {
    state.respond = () => ({ data: null, error: null });
    expect((await request()).status).toBe(503);
    expect(state.ops.some((op) => op.table === "newsletter_subscribers")).toBe(
      false,
    );
  });
});
