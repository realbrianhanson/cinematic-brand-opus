// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://example.com/"}
import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  auth: { user: null as null | { id: string }, loading: false },
  path: "/",
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state.auth }));
vi.mock("@/lib/router-compat", () => ({
  useLocation: () => ({ pathname: state.path }),
}));
vi.mock("@/config/SiteConfigContext", () => ({
  useSiteConfig: () => ({ identity: { siteUrl: "https://example.com" } }),
}));
import PublicMeasurement, {
  MeasurementPreferencesButton,
} from "../PublicMeasurement";
import {
  MEASUREMENT_CHOICE_KEY,
  MEASUREMENT_SESSION_KEY,
  configureMeasurement,
  measurementForClaim,
  measurementAllowed,
  setMeasurementChoice,
} from "@/lib/measurement";
const send = vi.fn();
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  configureMeasurement(false, "");
  state.auth = { user: null, loading: false };
  state.path = "/";
  history.replaceState(null, "", "/");
  Object.defineProperty(navigator, "doNotTrack", {
    value: "0",
    configurable: true,
  });
  Object.defineProperty(navigator, "globalPrivacyControl", {
    value: false,
    configurable: true,
  });
  send
    .mockReset()
    .mockResolvedValue({ ok: true, json: async () => ({ accepted: true }) });
  vi.stubGlobal("fetch", send);
  vi.stubEnv("VITE_SUPABASE_URL", "https://database.example.com");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-key");
});
afterEach(() => {
  cleanup();
  configureMeasurement(false, "");
  vi.restoreAllMocks();
  setMeasurementChoice("decline");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const payloads = () =>
  send.mock.calls.map(([, options]) => JSON.parse(options.body));
describe("optional public measurement", () => {
  it("sends nothing before consent and never stores contact details or URL tokens", async () => {
    history.replaceState(
      null,
      "",
      "/?utm_source=newsletter&utm_medium=email&utm_campaign=fall&utm_term=secret@example.com#token=private",
    );
    render(<PublicMeasurement />);
    expect(
      await screen.findByRole("button", { name: "Allow measurement" }),
    ).toBeVisible();
    expect(send).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(MEASUREMENT_SESSION_KEY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Allow measurement" }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(payloads()[0]).toMatchObject({
      action: "record",
      consent: true,
      attribution: { source: "newsletter", medium: "email", campaign: "fall" },
      events: [{ type: "page_view", path: "/" }],
    });
    expect(JSON.stringify(payloads())).not.toMatch(
      /secret@example|private|utm_term/,
    );
    expect(await measurementForClaim()).toMatchObject({
      session_id: expect.any(String),
      session_token: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
  it("declining and later revoking stops events and requests session removal", async () => {
    const { rerender } = render(
      <>
        <PublicMeasurement />
        <MeasurementPreferencesButton />
      </>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "No thanks" }));
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Measurement preferences" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Allow measurement" }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    fireEvent.click(
      screen.getByRole("button", { name: "Measurement preferences" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Turn measurement off" }),
    );
    await waitFor(() => expect(payloads().at(-1).action).toBe("forget"));
    expect(sessionStorage.getItem(MEASUREMENT_SESSION_KEY)).toBeNull();
    state.path = "/shop";
    rerender(
      <>
        <PublicMeasurement />
        <MeasurementPreferencesButton />
      </>,
    );
    await act(async () => {});
    expect(send).toHaveBeenCalledTimes(2);
    expect(await measurementForClaim()).toBeUndefined();
  });
  it.each(["admin", "signed-in", "loading", "privacy", "preview", "qa"])(
    "excludes %s activity even with saved consent",
    async (mode) => {
      localStorage.setItem(MEASUREMENT_CHOICE_KEY, "allow");
      if (mode === "admin") state.path = "/admin/conversions";
      if (mode === "signed-in") state.auth.user = { id: "admin" };
      if (mode === "loading") state.auth.loading = true;
      if (mode === "privacy")
        Object.defineProperty(navigator, "globalPrivacyControl", {
          value: true,
          configurable: true,
        });
      if (mode === "preview") state.path = "/offers/preview/private";
      if (mode === "qa") history.replaceState(null, "", "/?measurement=off");
      render(<PublicMeasurement />);
      await act(async () => {});
      expect(send).not.toHaveBeenCalled();
      expect(await measurementForClaim()).toBeUndefined();
    },
  );
  it("measures resolved offers and link intent without intercepting navigation", async () => {
    localStorage.setItem(MEASUREMENT_CHOICE_KEY, "allow");
    state.path = "/offers/guide";
    const { rerender } = render(<PublicMeasurement />);
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    const offer = "10000000-0000-4000-8000-000000000001";
    rerender(
      <>
        <PublicMeasurement />
        <h1 data-conversion-offer-id={offer} data-conversion-offer-slug="guide">
          Guide
        </h1>
        <a
          href="https://provider.example.com/offer?affiliate=private"
          data-conversion-offer-id={offer}
          data-conversion-placement="offer"
          data-conversion-destination="external_offer"
        >
          View offer
        </a>
      </>,
    );
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    let intercepted: boolean | undefined;
    document.addEventListener(
      "click",
      (e) => {
        intercepted = e.defaultPrevented;
        e.preventDefault();
      },
      { once: true },
    );
    screen.getByRole("link", { name: "View offer" }).dispatchEvent(event);
    expect(intercepted).toBe(false);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(payloads()[1].events[0]).toMatchObject({
      type: "offer_view",
      offer_id: offer,
    });
    expect(payloads()[2].events[0]).toMatchObject({
      type: "outbound_click",
      destination: "external_offer",
      placement: "offer",
    });
    expect(JSON.stringify(payloads())).not.toContain("affiliate");
  });
  it("keeps withdrawal authoritative when preference storage rejects writes", async () => {
    localStorage.setItem(MEASUREMENT_CHOICE_KEY, "allow");
    const { rerender } = render(
      <>
        <PublicMeasurement />
        <MeasurementPreferencesButton />
      </>,
    );
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === MEASUREMENT_CHOICE_KEY) throw new Error("quota");
      original.call(this, key, value);
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Measurement preferences" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Turn measurement off" }),
    );
    await waitFor(() => expect(payloads().at(-1).action).toBe("forget"));
    expect(measurementAllowed()).toBe(false);
    state.path = "/shop";
    rerender(
      <>
        <PublicMeasurement />
        <MeasurementPreferencesButton />
      </>,
    );
    await act(async () => {});
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("forgets another tab's withdrawn session and creates a fresh capability on re-consent", async () => {
    localStorage.setItem(MEASUREMENT_CHOICE_KEY, "allow");
    render(
      <>
        <PublicMeasurement />
        <MeasurementPreferencesButton />
      </>,
    );
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    const old = payloads()[0].session_id;
    localStorage.setItem(MEASUREMENT_CHOICE_KEY, "decline");
    await act(async () =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: MEASUREMENT_CHOICE_KEY,
          newValue: "decline",
        }),
      ),
    );
    await waitFor(() => expect(payloads().at(-1).action).toBe("forget"));
    expect(sessionStorage.getItem(MEASUREMENT_SESSION_KEY)).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Measurement preferences" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Allow measurement" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    expect(payloads()[2].session_id).not.toBe(old);
  });
  it("revokes after an in-flight record finishes without restoring accepted attribution", async () => {
    localStorage.setItem(MEASUREMENT_CHOICE_KEY, "allow");
    let finish!: (value: unknown) => void;
    send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <>
        <PublicMeasurement />
        <MeasurementPreferencesButton />
      </>,
    );
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    fireEvent.click(
      screen.getByRole("button", { name: "Measurement preferences" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Turn measurement off" }),
    );
    finish({ ok: true, json: async () => ({ accepted: true }) });
    await waitFor(() => expect(payloads().at(-1).action).toBe("forget"));
    expect(await measurementForClaim()).toBeUndefined();
    expect(sessionStorage.getItem(MEASUREMENT_SESSION_KEY)).toBeNull();
  });
  it("collector failure leaves forms usable and attribution absent", async () => {
    localStorage.setItem(MEASUREMENT_CHOICE_KEY, "allow");
    send.mockRejectedValue(new Error("offline"));
    render(<PublicMeasurement />);
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(await measurementForClaim()).toBeUndefined();
  });
});
