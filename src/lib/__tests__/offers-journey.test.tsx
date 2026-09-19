// @vitest-environment jsdom
import React from "react";
import { webcrypto } from "node:crypto";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OfferLanding from "@/pages/OfferLanding";
import OfferAccessPage from "@/pages/OfferAccess";
import {
  type PublicOffer,
  type OfferAccess,
  newOfferToken,
  safeOfferRedirect,
} from "@/lib/offers";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));
const originalLocation = window.location;
const assign = vi.fn();
const token = "a".repeat(64);
const offer: PublicOffer = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "workflow-guide",
  title: "Build your first workflow",
  summary: "A practical guide with reusable templates.",
  body: "Pick one task.\n\nBuild a repeatable process.",
  cover_url: null,
  status: "published",
  kind: "free",
  amount_minor: 0,
  currency: "usd",
  thank_you_message: "Enjoy your guide.",
  funnel_only: false,
  created_at: "2026-09-19T00:00:00Z",
  updated_at: "2026-09-19T00:00:00Z",
};
const access: OfferAccess = {
  order: {
    id: "order-1",
    title: offer.title,
    status: "fulfilled",
    kind: "free",
    amount_minor: 0,
    currency: "usd",
    asset_name: "guide.pdf",
    fulfilled_at: "2026-09-19T00:00:00Z",
  },
  next_offer: null,
  next_offer_deadline: null,
  checkout_url: null,
  access_url: `https://example.com/offer-access#token=${token}`,
  payments_ready: false,
  thank_you_message: "Enjoy your guide.",
};
function respond(data: unknown) {
  return { data, error: null };
}
function openAccess(fragment = `#token=${token}`) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      hash: fragment,
      pathname: "/offer-access",
      assign,
      reload: vi.fn(),
    },
  });
}
beforeEach(() => {
  invoke.mockReset();
  assign.mockReset();
  sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...originalLocation,
      hash: "",
      pathname: "/offers/workflow-guide",
      assign,
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("offer visitor journey", () => {
  it("creates unpredictable access tokens and rejects unsafe redirects", () => {
    const first = newOfferToken();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(newOfferToken()).not.toBe(first);
    expect(() => safeOfferRedirect("javascript:alert(1)")).toThrow();
    expect(() =>
      safeOfferRedirect("https://owner:secret@example.com"),
    ).toThrow();
  });
  it("free download retries reuse the same token without subscribing to a newsletter", async () => {
    invoke
      .mockRejectedValueOnce(new Error("Temporary connection issue"))
      .mockResolvedValueOnce(
        respond({ status: "fulfilled", access_url: access.access_url }),
      );
    render(<OfferLanding offer={offer} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "PERSON@example.com" },
    });
    const form = screen
      .getByRole("button", { name: /Get my free download/ })
      .closest("form")!;
    fireEvent.submit(form);
    await screen.findByRole("alert");
    fireEvent.submit(form);
    await waitFor(() => expect(assign).toHaveBeenCalledWith(access.access_url));
    const requests = invoke.mock.calls.map((call) => call[1].body);
    expect(requests[0]).toMatchObject({
      action: "claim",
      offer_id: offer.id,
      email: "person@example.com",
    });
    expect(requests[1].token).toBe(requests[0].token);
    expect(requests[0].token).toMatch(/^[a-f0-9]{64}$/);
    expect(sessionStorage.getItem("offer-access-token")).toBe(
      requests[0].token,
    );
    expect(
      screen.getByText(/does not sign you up for a newsletter/),
    ).toBeTruthy();
  });
  it("keeps paid checkout disabled without payment configuration", async () => {
    invoke.mockResolvedValue(respond({ offer, payments_ready: false }));
    render(
      <OfferLanding offer={{ ...offer, kind: "paid", amount_minor: 2700 }} />,
    );
    await screen.findByText(/Purchases are not available yet/);
    expect(
      (
        screen.getByRole("button", {
          name: /Continue to checkout/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      invoke.mock.calls.every((call) => call[1].body.action === "get"),
    ).toBe(true);
  });
  it("allows an explicit fresh checkout after a verified terminal attempt", async () => {
    invoke
      .mockResolvedValueOnce(
        respond({ status: "expired", access_url: access.access_url }),
      )
      .mockResolvedValueOnce(
        respond({ status: "fulfilled", access_url: access.access_url }),
      );
    render(<OfferLanding offer={offer} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "person@example.com" },
    });
    const form = screen
      .getByRole("button", { name: /Get my free download/ })
      .closest("form")!;
    fireEvent.submit(form);
    await screen.findByText(/previous checkout is closed/);
    expect(assign).not.toHaveBeenCalled();
    fireEvent.submit(form);
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(invoke.mock.calls[1][1].body.token).not.toBe(
      invoke.mock.calls[0][1].body.token,
    );
  });
  it("never creates orders from preview or a funnel-only landing page", () => {
    const { rerender } = render(<OfferLanding offer={offer} preview />);
    const button = screen.getByRole("button", { name: "Preview only" });
    fireEvent.submit(button.closest("form")!);
    expect(invoke).not.toHaveBeenCalled();
    rerender(<OfferLanding offer={{ ...offer, funnel_only: true }} />);
    expect(
      screen.queryByRole("button", { name: /Get my free download/ }),
    ).toBeNull();
  });
  it("removes the bearer fragment, uses POST data and keeps original access after declining", async () => {
    openAccess();
    const next = {
      ...offer,
      id: "22222222-2222-4222-8222-222222222222",
      title: "Workflow toolkit",
    };
    invoke.mockImplementation((_name, { body }) =>
      Promise.resolve(
        respond(
          body.action === "decline"
            ? { ok: true }
            : {
                ...access,
                next_offer: invoke.mock.calls.some(
                  (call) => call[1].body.action === "decline",
                )
                  ? null
                  : next,
              },
        ),
      ),
    );
    render(<OfferAccessPage />);
    await screen.findByRole("button", { name: "Download file" });
    expect(window.history.replaceState).toHaveBeenCalledWith(
      window.history.state,
      "",
      "/offer-access",
    );
    expect(invoke.mock.calls[0][1].body).toEqual({ action: "status", token });
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    await screen.findByText(/Follow-up offer declined/);
    expect(screen.getByRole("button", { name: "Download file" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Get this free resource" }),
    ).toBeNull();
  });
  it("passes a new token and original access proof for explicit upsell retries", async () => {
    openAccess();
    let claims = 0;
    const next = {
      ...offer,
      id: "22222222-2222-4222-8222-222222222222",
      kind: "paid" as const,
      amount_minor: 2700,
      title: "Workflow toolkit",
    };
    invoke.mockImplementation((_name, { body }) => {
      if (body.action === "claim") {
        if (++claims === 1) return Promise.reject(new Error("Retry safely"));
        return Promise.resolve(
          respond({
            status: "pending",
            checkout_url: "https://checkout.stripe.com/c/pay/test",
            access_url: access.access_url,
          }),
        );
      }
      return Promise.resolve(
        respond({ ...access, next_offer: next, payments_ready: true }),
      );
    });
    render(<OfferAccessPage />);
    const button = await screen.findByRole("button", {
      name: /Continue to checkout/,
    });
    expect(
      invoke.mock.calls.filter((call) => call[1].body.action === "claim"),
    ).toHaveLength(0);
    fireEvent.click(button);
    await screen.findByRole("alert");
    fireEvent.click(button);
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        "https://checkout.stripe.com/c/pay/test",
      ),
    );
    const requests = invoke.mock.calls
      .filter((call) => call[1].body.action === "claim")
      .map((call) => call[1].body);
    expect(requests[0]).toMatchObject({
      parent_token: token,
      offer_id: next.id,
    });
    expect(requests[0].token).not.toBe(token);
    expect(requests[1].token).toBe(requests[0].token);
    expect(requests[0]).not.toHaveProperty("email");
  });
  it("does not expose download controls for pending or refunded orders", async () => {
    openAccess();
    invoke.mockResolvedValue(
      respond({ ...access, order: { ...access.order, status: "refunded" } }),
    );
    render(<OfferAccessPage />);
    await screen.findByText("This purchase was refunded");
    expect(screen.queryByRole("button", { name: "Download file" })).toBeNull();
  });
  it("opens a free follow-up when only the access fragment changes", async () => {
    openAccess();
    const next = {
      ...offer,
      id: "22222222-2222-4222-8222-222222222222",
      title: "Second resource",
    };
    invoke.mockImplementation((_name, { body }) =>
      Promise.resolve(
        respond(
          body.action === "claim"
            ? {
                status: "fulfilled",
                access_url: `https://example.com/offer-access#token=${body.token}`,
              }
            : {
                ...access,
                order:
                  body.token === token
                    ? access.order
                    : { ...access.order, title: next.title },
                next_offer: body.token === token ? next : null,
              },
        ),
      ),
    );
    render(<OfferAccessPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Get this free resource" }),
    );
    await waitFor(() => expect(assign).toHaveBeenCalled());
    const destination = new URL(assign.mock.calls[0][0]);
    openAccess(destination.hash);
    fireEvent(window, new Event("hashchange"));
    await screen.findByRole("heading", { name: "Second resource", level: 1 });
    expect(
      screen
        .getByRole("link", { name: "Back to your previous resource" })
        .getAttribute("href"),
    ).toBe(`/offer-access#token=${token}`);
    expect(window.history.replaceState).toHaveBeenCalledTimes(2);
  });
  it("recovers the child after a lost response and reload without losing the parent", async () => {
    openAccess();
    let nextToken = "";
    invoke.mockImplementation((_name, { body }) => {
      if (body.action === "claim") {
        nextToken = body.token;
        return Promise.reject(new Error("Connection interrupted"));
      }
      return Promise.resolve(
        respond({
          ...access,
          order:
            body.token === token
              ? access.order
              : { ...access.order, title: "Recovered resource" },
          next_offer:
            body.token === token
              ? { ...offer, id: "22222222-2222-4222-8222-222222222222" }
              : null,
        }),
      );
    });
    const first = render(<OfferAccessPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Get this free resource" }),
    );
    await screen.findByRole("alert");
    expect(sessionStorage.getItem("offer-access-token")).toBe(nextToken);
    expect(
      screen.getByRole("link", { name: "Check follow-up access" }),
    ).toBeTruthy();
    first.unmount();
    openAccess("");
    render(<OfferAccessPage />);
    await screen.findByRole("heading", {
      name: "Recovered resource",
      level: 1,
    });
    expect(
      screen.getByRole("link", { name: "Back to your previous resource" }),
    ).toBeTruthy();
  });
  it("rejects an invalid supplied token instead of reopening an unrelated saved order", async () => {
    sessionStorage.setItem("offer-access-token", token);
    openAccess("#token=invalid");
    render(<OfferAccessPage />);
    await screen.findByText(/Open the complete access link/);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("keeps access visible when the same private link is opened again", async () => {
    openAccess();
    invoke.mockResolvedValue(respond(access));
    render(<OfferAccessPage />);
    await screen.findByRole("button", { name: "Download file" });
    openAccess();
    fireEvent(window, new Event("hashchange"));
    expect(screen.getByRole("button", { name: "Download file" })).toBeTruthy();
    expect(screen.queryByText("Loading your access…")).toBeNull();
  });
  it("ignores a manual refresh that resolves after navigation to another resource", async () => {
    openAccess();
    let resolveOld: (value: unknown) => void = () => {};
    let calls = 0;
    invoke.mockImplementation((_name, { body }) => {
      if (body.token === token && ++calls === 2)
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      return Promise.resolve(
        respond(
          body.token === token
            ? { ...access, order: { ...access.order, status: "pending" } }
            : {
                ...access,
                order: { ...access.order, title: "Parent resource" },
              },
        ),
      );
    });
    render(<OfferAccessPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Check payment status" }),
    );
    await waitFor(() => expect(calls).toBe(2));
    openAccess(`#token=${"b".repeat(64)}`);
    fireEvent(window, new Event("hashchange"));
    await screen.findByRole("heading", { name: "Parent resource", level: 1 });
    await act(async () => {
      resolveOld(
        respond({
          ...access,
          order: { ...access.order, title: "Stale child" },
        }),
      );
    });
    expect(
      screen.getByRole("heading", { name: "Parent resource", level: 1 }),
    ).toBeTruthy();
    expect(screen.queryByText("Stale child")).toBeNull();
  });
});
