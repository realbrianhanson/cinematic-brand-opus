// @vitest-environment jsdom
import React from "react";
import { webcrypto } from "node:crypto";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { brianPreset } from "@/config/presets/brian";
import type { LeadMagnetOffer } from "@/lib/shop.functions";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));
vi.mock("@/lib/measurement", () => ({
  measurementForClaim: async () => null,
}));
import ArticleLeadCard from "@/components/ArticleLeadCard";
import { dropTrailingPeriod } from "@/lib/copyVoice";

const kit: LeadMagnetOffer = {
  id: "e605661a-8652-4949-b20c-8ec37c4f98d6",
  slug: "ai-follow-up-starter-kit",
  title: "AI Follow-Up Starter Kit",
  summary: "Turn rough meeting notes into a clearer client follow-up.",
  kind: "free",
  checkout_mode: "native",
  cover_url: null,
};
const accessUrl = `https://brianhanson.com/offer-access#token=${"b".repeat(64)}`;
const originalLocation = window.location;
const assign = vi.fn();

function mount(node: React.ReactNode) {
  return render(
    <SiteConfigContext.Provider value={brianPreset}>
      {node}
    </SiteConfigContext.Provider>,
  );
}

beforeEach(() => {
  invoke.mockReset();
  assign.mockReset();
  sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, assign },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("article email capture", () => {
  it("offers the free kit with a pre-checked, clearly worded opt-in", () => {
    mount(<ArticleLeadCard offer={kit} placement="article-mid" />);
    expect(
      screen.getByRole("heading", { name: "AI Follow-Up Starter Kit" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Turn rough meeting notes into a clearer client follow-up",
      ),
    ).toBeTruthy();
    const consent = screen.getByRole("checkbox") as HTMLInputElement;
    expect(consent.checked).toBe(true);
    expect(screen.getByText(/weekly email from Brian Hanson/)).toBeTruthy();
    expect(screen.getByText(/Unsubscribe in one click/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Send Me the Kit/ }),
    ).toBeTruthy();
  });

  it("claims the kit, starts the double opt-in with a placement tag, then opens the download", async () => {
    invoke.mockImplementation((name: string) =>
      Promise.resolve({
        data:
          name === "offers-api"
            ? { status: "fulfilled", access_url: accessUrl }
            : { ok: true, state: "confirmation_sent" },
        error: null,
      }),
    );
    mount(<ArticleLeadCard offer={kit} placement="article-end" />);
    expect(
      screen.getByRole("heading", {
        name: "Get the free AI Follow-Up Starter Kit",
      }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "Reader@Example.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /Send Me the Kit/ }).closest("form")!,
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith(accessUrl));
    const [claim, subscribe] = invoke.mock.calls;
    expect(claim[0]).toBe("offers-api");
    expect(claim[1].body).toMatchObject({
      action: "claim",
      offer_id: kit.id,
      email: "reader@example.com",
    });
    expect(subscribe[0]).toBe("newsletter-subscribe");
    expect(subscribe[1].body).toEqual({
      email: "reader@example.com",
      source: "starter-kit-article-end",
    });
  });

  it("does not subscribe anyone who unticks the box", async () => {
    invoke.mockResolvedValue({
      data: { status: "fulfilled", access_url: accessUrl },
      error: null,
    });
    mount(<ArticleLeadCard offer={kit} placement="article-mid" />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(
      screen.getByRole("button", { name: /Send Me the Kit/ }).closest("form")!,
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith(accessUrl));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][0]).toBe("offers-api");
  });

  it("falls back to the weekly email when the site has no free download", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, state: "confirmation_sent" },
      error: null,
    });
    mount(<ArticleLeadCard offer={null} placement="article-mid" />);
    expect(screen.getByText("The weekly email")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Get the weekly email/ }),
    );
    expect(
      await screen.findByText("Check your inbox for the confirmation link"),
    ).toBeTruthy();
    expect(invoke.mock.calls[0][1].body).toEqual({
      email: "reader@example.com",
      source: "article-mid",
    });
  });

  it("drops a closing period from stored copy but keeps an ellipsis", () => {
    expect(dropTrailingPeriod("A free 7-page PDF.")).toBe("A free 7-page PDF");
    expect(dropTrailingPeriod("Wait for it...")).toBe("Wait for it...");
  });
});
