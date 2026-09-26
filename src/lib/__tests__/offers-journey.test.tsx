// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { webcrypto } from "node:crypto";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OfferLanding from "@/pages/OfferLanding";
import OfferAccessPage from "@/pages/OfferAccess";
import * as measurement from "@/lib/measurement";
import {
  type PublicOffer,
  type OfferAccess,
  newOfferToken,
  safeOfferRedirect,
  safeExternalOfferUrl,
  offerPrice,
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
  checkout_mode: "native",
  price_display_mode: "fixed",
  external_url: null,
  external_button_text: "",
  is_affiliate: false,
  affiliate_disclosure: null,
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
});

describe("offer visitor journey", () => {
  it.each([
    { checkoutMode: "native" as const, preview: false },
    { checkoutMode: "external" as const, preview: false },
    { checkoutMode: "native" as const, preview: true },
    { checkoutMode: "external" as const, preview: true },
  ])(
    "renders and enlarges body images for $checkoutMode offers with preview=$preview",
    async ({ checkoutMode, preview }) => {
      const alt = "A workflow from first task to finished guide";
      const caption = "Each step is visible, including the final review.";
      const src = "https://example.com/workflow-overview.webp";
      const imageOffer = {
        ...offer,
        checkout_mode: checkoutMode,
        external_url: "https://example.com/offer",
        body: `Before the image.\n![${alt}](${src} "${caption}")\nAfter the image.`,
      };
      const html = renderToStaticMarkup(
        <OfferLanding preview={preview} offer={imageOffer} />,
      );
      const initialDocument = new DOMParser().parseFromString(
        html,
        "text/html",
      );
      const initialImage = initialDocument.querySelector(
        'article[aria-label="Offer details"] img',
      );
      expect(initialImage?.getAttribute("src")).toBe(src);
      expect(initialImage?.getAttribute("alt")).toBe(alt);
      expect(initialImage?.getAttribute("loading")).toBe("lazy");
      expect(initialImage?.getAttribute("decoding")).toBe("async");

      render(<OfferLanding preview={preview} offer={imageOffer} />);
      const details = screen.getByRole("article", { name: "Offer details" });
      const image = within(details).getByRole("img", { name: alt });
      const figure = image.closest("figure")!;
      expect(figure.querySelector("figcaption")?.textContent).toBe(caption);
      expect(
        within(details)
          .getByText("Before the image.")
          .compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        figure.compareDocumentPosition(
          within(details).getByText("After the image."),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      const trigger = within(details).getByRole("button", {
        name: `Enlarge image: ${alt}`,
      });
      expect(trigger.getAttribute("type")).toBe("button");
      trigger.focus();
      fireEvent.click(trigger);

      const dialog = await screen.findByRole("dialog", { name: alt });
      expect(
        within(dialog).getByRole("img", { name: alt }).getAttribute("src"),
      ).toBe(src);
      const descriptionIds =
        dialog.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
      expect(
        descriptionIds
          .map((id) => document.getElementById(id)?.textContent)
          .join(" "),
      ).toContain(caption);
      expect(
        within(dialog).getByRole("button", { name: "Close" }),
      ).toBeTruthy();
      fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(trigger));
      expect(invoke).not.toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();
    },
  );
  it("opens an uncaptioned body image and closes it with the visible Close control", async () => {
    render(
      <OfferLanding
        preview
        offer={{
          ...offer,
          body: "![Guide preview](https://example.com/guide.webp)",
        }}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Enlarge image: Guide preview",
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Guide preview" });
    expect(
      within(dialog).getByRole("img", { name: "Guide preview" }),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("escapes image alt text and captions in the body and enlarged view", async () => {
    const alt = "<img src=x onerror=alert(1)>";
    const caption = "<script>alert(1)</script> & details";
    render(
      <OfferLanding
        preview
        offer={{
          ...offer,
          body: `![${alt}](https://example.com/image.webp "${caption}")`,
        }}
      />,
    );
    const details = screen.getByRole("article", { name: "Offer details" });
    expect(details.querySelectorAll("img")).toHaveLength(1);
    expect(details.querySelector("script, [onerror]")).toBeNull();
    expect(details.querySelector("figcaption")?.textContent).toBe(caption);
    fireEvent.click(
      screen.getByRole("button", { name: `Enlarge image: ${alt}` }),
    );
    const dialog = await screen.findByRole("dialog", { name: alt });
    expect(within(dialog).getByRole("img", { name: alt })).toBeTruthy();
    expect(within(dialog).getByText(caption)).toBeTruthy();
    expect(dialog.querySelector("script, [onerror]")).toBeNull();
  });
  it("keeps unsafe, inline, and quoted image syntax visible as text", () => {
    const unsafe = "![Unsafe](javascript:alert(1))";
    const inline =
      "Look at ![Guide](https://example.com/guide.webp) for context.";
    const quoted = "![Quoted guide](https://example.com/guide.webp)";
    render(
      <OfferLanding
        preview
        offer={{ ...offer, body: `${unsafe}\n\n${inline}\n\n> ${quoted}` }}
      />,
    );
    const details = screen.getByRole("article", { name: "Offer details" });
    expect(within(details).getByText(unsafe)).toBeTruthy();
    expect(within(details).getByText(inline)).toBeTruthy();
    expect(details.querySelector("blockquote p")?.textContent).toBe(quoted);
    expect(details.querySelector("img, a, button")).toBeNull();
  });
  it.each([
    { checkoutMode: "native" as const, preview: false },
    { checkoutMode: "external" as const, preview: false },
    { checkoutMode: "native" as const, preview: true },
    { checkoutMode: "external" as const, preview: true },
  ])(
    "renders complete semantic quotes for $checkoutMode offers with preview=$preview",
    ({ checkoutMode, preview }) => {
      const first = "It’s useful — and practical.\nEvery word stays here!";
      const second = "“Keep going,” she said.";
      render(
        <OfferLanding
          preview={preview}
          offer={{
            ...offer,
            checkout_mode: checkoutMode,
            external_url: "https://example.com/offer",
            body: `## What clients say\n\n> ${first.replaceAll("\n", "\n> ")}\n>\n> ${second}\n>\n> — Lynn Hutchison\n\nContinue here.`,
          }}
        />,
      );
      const details = screen.getByRole("article", { name: "Offer details" });
      const figure = details.querySelector("figure")!;
      const quote = figure.querySelector("blockquote")!;
      expect(
        Array.from(quote.querySelectorAll("p"), (p) => p.textContent),
      ).toEqual([first, second]);
      expect(figure.querySelector("figcaption")?.textContent).toBe(
        "Lynn Hutchison",
      );
      expect(quote.querySelector("figcaption")).toBeNull();
      expect(figure.querySelector('[aria-hidden="true"]')?.textContent).toBe(
        "“",
      );
      expect(details.querySelector("details")).toBeNull();
      expect(details.textContent).toContain("Continue here.");
    },
  );
  it("escapes quote prose and attribution without creating HTML or Markdown links", () => {
    const unsafeQuote =
      '<img src=x onerror="alert(1)"> [Open](javascript:alert(1))';
    const unsafeAuthor = '<script>alert("author")</script>';
    render(
      <OfferLanding
        preview
        offer={{
          ...offer,
          body: `> ${unsafeQuote}\n>\n> — ${unsafeAuthor}`,
        }}
      />,
    );
    const details = screen.getByRole("article", { name: "Offer details" });
    expect(details.querySelector("blockquote p")?.textContent).toBe(
      unsafeQuote,
    );
    expect(details.querySelector("figcaption")?.textContent).toBe(unsafeAuthor);
    expect(details.querySelector("img, script, a")).toBeNull();
  });
  it("keeps personal details out of URLs before checkout hydration", () => {
    const html = renderToStaticMarkup(<OfferLanding offer={offer} />);
    expect(html).toContain('method="post"');
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(
      document.querySelector<HTMLInputElement>('input[name="email"]')?.disabled,
    ).toBe(true);
    expect(html).toContain("Enable JavaScript to request");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("repeats the external paid offer link after the details without starting checkout", () => {
    render(
      <OfferLanding
        offer={{
          ...offer,
          checkout_mode: "external",
          kind: "paid",
          price_display_mode: "provider",
          external_url: "https://go.example.com/offer?_go=member60&source=shop",
          external_button_text: "Explore the program",
        }}
      />,
    );
    const links = screen.getAllByRole("link", { name: "Explore the program" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe(
        "https://go.example.com/offer?_go=member60&source=shop",
      );
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("data-conversion-destination")).toBe(
        "external_offer",
      );
      expect(link.getAttribute("data-conversion-offer-id")).toBe(offer.id);
    }
    const details = screen.getByRole("article", { name: "Offer details" });
    expect(
      links[0].compareDocumentPosition(details) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      details.compareDocumentPosition(links[1]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "View current pricing" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(document.querySelector("form")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByText(/Payment is handled by Stripe/)).toBeNull();
    expect(screen.queryByText(/download on the next page/)).toBeNull();
  });
  it("shows an explicit affiliate disclosure before each outbound link", () => {
    render(
      <OfferLanding
        offer={{
          ...offer,
          checkout_mode: "external",
          kind: "paid",
          amount_minor: 700,
          external_url: "https://example.com/workshop?_go=member60",
          external_button_text: "View workshop",
          is_affiliate: true,
        }}
      />,
    );
    const disclosures = screen.getAllByText(
      /Affiliate link: I may earn a commission/,
    );
    const links = screen.getAllByRole("link", { name: "View workshop" });
    expect(disclosures).toHaveLength(2);
    expect(links).toHaveLength(2);
    links.forEach((link, index) => {
      expect(link.getAttribute("href")).toBe(
        "https://example.com/workshop?_go=member60",
      );
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("sponsored noopener noreferrer");
      expect(
        disclosures[index].compareDocumentPosition(link) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
    expect(screen.getByRole("heading", { name: "$7" })).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });
  it("renders custom affiliate text safely and disables outbound navigation in previews", () => {
    const custom = '<img src=x onerror="alert(1)"> Partner disclosure';
    render(
      <OfferLanding
        preview
        offer={{
          ...offer,
          checkout_mode: "external",
          external_url: "https://example.com/offer",
          is_affiliate: true,
          affiliate_disclosure: custom,
        }}
      />,
    );
    expect(screen.getAllByText(custom)).toHaveLength(2);
    expect(document.querySelector("img")).toBeNull();
    expect(
      document.querySelector('a[href="https://example.com/offer"]'),
    ).toBeNull();
    const buttons = screen.getAllByRole("button", { name: "Preview only" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons)
      expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
  });
  it("keeps malformed external destinations unavailable instead of starting native checkout", () => {
    render(
      <OfferLanding
        offer={{
          ...offer,
          checkout_mode: "external",
          external_url: "javascript:alert(1)",
        }}
      />,
    );
    expect(screen.getAllByText(/link isn’t available right now/)).toHaveLength(
      2,
    );
    expect(screen.queryByRole("link", { name: "Visit website" })).toBeNull();
    expect(document.querySelector("form")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
  it.each([
    "http://example.com/offer",
    "https:example.com/offer",
    "https:///example.com/offer",
    "//example.com/offer",
    "/offer",
    "javascript:alert(1)",
    "https://name:password@example.com/offer",
    "https://example.com/offer\n",
    "https://example.com\\offer",
    `https://example.com/${"x".repeat(2048)}`,
  ])("rejects unsafe external offer destination %s", (url) => {
    expect(safeExternalOfferUrl(url)).toBeNull();
  });
  it("shows provider pricing only for external offers and preserves native order prices", () => {
    expect(
      offerPrice({
        ...offer,
        checkout_mode: "external",
        kind: "paid",
        price_display_mode: "provider",
      }),
    ).toBe("View current pricing");
    expect(offerPrice({ ...offer, kind: "paid", amount_minor: 700 })).toBe(
      "$7",
    );
    expect(offerPrice({ ...offer, kind: "paid", amount_minor: 750 })).toBe(
      "$7.50",
    );
    expect(offerPrice({ ...offer, kind: "paid", amount_minor: 1234567 })).toBe(
      "$12,345.67",
    );
    // Other currencies keep the unambiguous ISO code.
    expect(
      offerPrice({
        ...offer,
        kind: "paid",
        amount_minor: 700,
        currency: "cad",
      }),
    ).toMatch(/CAD.*7\.00/);
    expect(offerPrice(access.order)).toBe("Free");
  });
  it("creates unpredictable access tokens and rejects unsafe redirects", () => {
    const first = newOfferToken();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(newOfferToken()).not.toBe(first);
    expect(() => safeOfferRedirect("javascript:alert(1)")).toThrow();
    expect(() =>
      safeOfferRedirect("https://owner:secret@example.com"),
    ).toThrow();
  });
  it("free download retries reuse the same token, then start the opted-in newsletter confirmation", async () => {
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
      .getByRole("button", { name: /Send Me the Free Download/ })
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
    const consent = screen.getByRole("checkbox", {
      name: /weekly email/,
    }) as HTMLInputElement;
    expect(consent.checked).toBe(true);
    expect(screen.getByText(/Unsubscribe in one click/)).toBeTruthy();
    expect(screen.queryByText(/does not sign you up/)).toBeNull();
    const subscribe = invoke.mock.calls.filter(
      (call) => call[0] === "newsletter-subscribe",
    );
    expect(subscribe).toHaveLength(1);
    expect(subscribe[0][1].body).toEqual({
      email: "person@example.com",
      source: "starter-kit",
    });
  });
  it("respects an unchecked opt-in: the download opens and nothing is subscribed", async () => {
    invoke.mockResolvedValue(
      respond({ status: "fulfilled", access_url: access.access_url }),
    );
    render(<OfferLanding offer={offer} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "person@example.com" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /weekly email/ }));
    const form = screen
      .getByRole("button", { name: /Send Me the Free Download/ })
      .closest("form")!;
    fireEvent.submit(form);
    await waitFor(() => expect(assign).toHaveBeenCalledWith(access.access_url));
    expect(
      invoke.mock.calls.some((call) => call[0] === "newsletter-subscribe"),
    ).toBe(false);
  });
  it("still opens the download when the newsletter confirmation fails", async () => {
    invoke.mockImplementation((name: string) =>
      name === "newsletter-subscribe"
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(
            respond({ status: "fulfilled", access_url: access.access_url }),
          ),
    );
    render(<OfferLanding offer={offer} />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "person@example.com" },
    });
    fireEvent.submit(
      screen
        .getByRole("button", { name: /Send Me the Free Download/ })
        .closest("form")!,
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith(access.access_url));
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
    expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
  });
  it("lets a buyer retry a failed availability read without losing details or starting checkout", async () => {
    invoke.mockRejectedValueOnce(new Error("offline"));
    let finishCheck: (value: ReturnType<typeof respond>) => void = () => {};
    invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCheck = resolve;
        }),
    );
    render(
      <OfferLanding offer={{ ...offer, kind: "paid", amount_minor: 2700 }} />,
    );
    fireEvent.change(screen.getByLabelText("Your name (optional)"), {
      target: { value: "Buyer Name" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "buyer@example.com" },
    });
    await screen.findByText(/couldn’t check checkout availability/);
    const retry = screen.getByRole("button", { name: "Check again" });
    fireEvent.click(retry);
    fireEvent.click(retry);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(
      (
        screen.getByRole("button", {
          name: /Continue to checkout/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () =>
      finishCheck(respond({ offer, payments_ready: true })),
    );
    expect(
      (
        screen.getByRole("button", {
          name: /Continue to checkout/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(
      (screen.getByLabelText("Email address") as HTMLInputElement).value,
    ).toBe("buyer@example.com");
    expect(
      (screen.getByLabelText("Your name (optional)") as HTMLInputElement).value,
    ).toBe("Buyer Name");
    expect(
      invoke.mock.calls.every((call) => call[1].body.action === "get"),
    ).toBe(true);
    expect(assign).not.toHaveBeenCalled();
  });
  it("keeps an unreadable readiness response retryable rather than asserting checkout is unconfigured", async () => {
    invoke.mockResolvedValue(respond({}));
    render(
      <OfferLanding offer={{ ...offer, kind: "paid", amount_minor: 2700 }} />,
    );
    await screen.findByRole("button", { name: "Check again" });
    expect(screen.queryByText(/Purchases are not available yet/)).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: /Continue to checkout/,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("times out a stalled availability read without creating an order", async () => {
    vi.useFakeTimers();
    try {
      invoke.mockImplementation(() => new Promise(() => {}));
      render(
        <OfferLanding offer={{ ...offer, kind: "paid", amount_minor: 2700 }} />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15001);
      });
      expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
      expect(invoke).toHaveBeenCalledOnce();
      expect(invoke.mock.calls[0][1].body.action).toBe("get");
      expect(assign).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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
      .getByRole("button", { name: /Send Me the Free Download/ })
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
    expect(button.closest("form")).toBeNull();
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(invoke).not.toHaveBeenCalled();
    rerender(<OfferLanding offer={{ ...offer, funnel_only: true }} />);
    expect(
      screen.queryByRole("button", { name: /Send Me the Free Download/ }),
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
  it.each(["expired", "failed", "refunded"])(
    "preserves the existing child access and offers support after a verified %s follow-up",
    async (status) => {
      openAccess();
      const next = {
        ...offer,
        id: "22222222-2222-4222-8222-222222222222",
        kind: "paid" as const,
        amount_minor: 2700,
        title: "Workflow toolkit",
      };
      invoke.mockImplementation((_name, { body }) =>
        Promise.resolve(
          respond(
            body.action === "claim"
              ? { status, access_url: access.access_url }
              : { ...access, next_offer: next, payments_ready: true },
          ),
        ),
      );
      render(<OfferAccessPage />);
      const button = await screen.findByRole("button", {
        name: /Continue to checkout/,
      });
      fireEvent.click(button);
      expect((await screen.findByRole("alert")).textContent).toContain(
        `follow-up order is ${status}`,
      );
      expect(assign).not.toHaveBeenCalled();
      expect(sessionStorage.getItem("offer-access-token")).toBe(token);
      const requests = invoke.mock.calls
        .filter((call) => call[1].body.action === "claim")
        .map((call) => call[1].body);
      expect(requests).toHaveLength(1);
      expect(requests[0].parent_token).toBe(token);
      expect(sessionStorage.getItem(`offer-attempt:${next.id}:${token}`)).toBe(
        requests[0].token,
      );
      expect(
        screen
          .getByRole("link", { name: "Check follow-up access" })
          .getAttribute("href"),
      ).toBe(`/offer-access#token=${requests[0].token}`);
      expect(
        screen
          .getByRole("link", { name: "Contact support about this follow-up" })
          .getAttribute("href"),
      ).toBe("/support");
      expect(
        screen.queryByRole("button", { name: /Continue to checkout/ }),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: "Download file" }),
      ).toBeTruthy();
    },
  );
  it("records Continue as intent and waits for optional measurement before reserving the child", async () => {
    openAccess();
    const next = {
      ...offer,
      id: "22222222-2222-4222-8222-222222222222",
      title: "Next resource",
    };
    const record = vi
      .spyOn(measurement, "recordMeasurement")
      .mockImplementation(() => {});
    let finish!: (value: measurement.MeasurementContext) => void;
    vi.spyOn(measurement, "measurementForClaim").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    invoke.mockImplementation((_name, { body }) =>
      Promise.resolve(
        respond(
          body.action === "claim"
            ? { status: "fulfilled", access_url: access.access_url }
            : {
                ...access,
                order: { ...access.order, offer_id: offer.id },
                next_offer: next,
              },
        ),
      ),
    );
    render(<OfferAccessPage />);
    const button = await screen.findByRole("button", {
      name: "Get this free resource",
    });
    const section = screen.getByRole("region", {
      name: "Optional follow-up offer",
    });
    expect(section.getAttribute("data-conversion-parent-offer-id")).toBe(
      offer.id,
    );
    expect(section.getAttribute("data-conversion-upsell-id")).toBe(next.id);
    fireEvent.click(button);
    await waitFor(() =>
      expect(record).toHaveBeenCalledWith([
        {
          type: "upsell_accept",
          path: "/offer-access",
          offer_id: next.id,
          parent_offer_id: offer.id,
        },
      ]),
    );
    expect(
      invoke.mock.calls.filter((call) => call[1].body.action === "claim"),
    ).toHaveLength(0);
    const identity = {
      session_id: "33333333-3333-4333-8333-333333333333",
      session_token: "b".repeat(64),
    };
    await act(async () => finish(identity));
    await waitFor(() => expect(assign).toHaveBeenCalledOnce());
    const claim = invoke.mock.calls.find(
      (call) => call[1].body.action === "claim",
    )![1].body;
    expect(claim.measurement).toEqual(identity);
    expect(JSON.stringify(record.mock.calls)).not.toContain(token);
  });
  it("records a decline only after its save succeeds", async () => {
    openAccess();
    const next = { ...offer, id: "22222222-2222-4222-8222-222222222222" };
    const record = vi
      .spyOn(measurement, "recordMeasurement")
      .mockImplementation(() => {});
    let succeed = false;
    invoke.mockImplementation((_name, { body }) =>
      body.action === "decline" && !succeed
        ? Promise.reject(new Error("Offline"))
        : Promise.resolve(
            respond({
              ...access,
              order: { ...access.order, offer_id: offer.id },
              next_offer: next,
            }),
          ),
    );
    render(<OfferAccessPage />);
    fireEvent.click(await screen.findByRole("button", { name: "No thanks" }));
    await screen.findByRole("alert");
    expect(record).not.toHaveBeenCalled();
    succeed = true;
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    await waitFor(() =>
      expect(record).toHaveBeenCalledWith([
        {
          type: "upsell_decline",
          path: "/offer-access",
          offer_id: next.id,
          parent_offer_id: offer.id,
        },
      ]),
    );
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
  it("keeps newly confirmed access when an older automatic status read arrives late", async () => {
    vi.useFakeTimers();
    openAccess();
    let resolveOld: (value: unknown) => void = () => {};
    const pending = {
      ...access,
      order: { ...access.order, status: "pending" },
    };
    invoke.mockResolvedValueOnce(respond(pending));
    invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    invoke.mockResolvedValueOnce(respond(access));
    render(<OfferAccessPage />);
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Check payment status" }),
      );
    });
    expect(screen.getByRole("button", { name: "Download file" })).toBeTruthy();
    await act(async () => {
      resolveOld(respond(pending));
    });
    expect(screen.getByRole("button", { name: "Download file" })).toBeTruthy();
    expect(screen.queryByText("Waiting for payment confirmation")).toBeNull();
  });
  it("locks an access action before a rapid repeat can issue another download request", async () => {
    openAccess();
    invoke.mockImplementation((_name, { body }) =>
      body.action === "download"
        ? new Promise(() => {})
        : Promise.resolve(respond(access)),
    );
    render(<OfferAccessPage />);
    const button = await screen.findByRole("button", { name: "Download file" });
    act(() => {
      button.click();
      button.click();
    });
    expect(
      invoke.mock.calls.filter((call) => call[1].body.action === "download"),
    ).toHaveLength(1);
  });
  it("resumes automatic payment checks after a failed initial read is retried", async () => {
    vi.useFakeTimers();
    openAccess();
    invoke.mockRejectedValueOnce(new Error("Temporary network error"));
    invoke.mockResolvedValueOnce(
      respond({ ...access, order: { ...access.order, status: "pending" } }),
    );
    invoke.mockResolvedValueOnce(respond(access));
    render(<OfferAccessPage />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(screen.getByText("Waiting for payment confirmation")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByRole("button", { name: "Download file" })).toBeTruthy();
    expect(invoke).toHaveBeenCalledTimes(3);
  });
});

describe("explicit follow-up checkout restart", () => {
  function recovering(
    status: "expired" | "failed" | "refunded" = "expired",
    available = true,
  ): OfferAccess {
    return {
      ...access,
      order: { ...access.order, status, kind: "paid", amount_minor: 2700 },
      payments_ready: true,
      checkout_recovery: {
        available,
        reason: available
          ? "We will verify the previous checkout is closed and unpaid."
          : "This checkout needs support review.",
      },
    };
  }
  it("does not restart automatically and makes the separate payment and original price explicit", async () => {
    openAccess();
    invoke.mockImplementation((_name, { body }) =>
      Promise.resolve(
        respond(
          body.action === "retry_checkout"
            ? {
                status: "pending",
                checkout_url: "https://checkout.stripe.com/retry",
                access_url: access.access_url,
              }
            : recovering(),
        ),
      ),
    );
    render(<OfferAccessPage />);
    const restart = await screen.findByRole("button", {
      name: "Restart checkout · $27",
    });
    expect(
      screen.getByText(/review and confirm a separate payment/),
    ).toBeTruthy();
    expect(invoke.mock.calls.map((call) => call[1].body.action)).toEqual([
      "status",
    ]);
    fireEvent.click(restart);
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/retry"),
    );
    expect(invoke).toHaveBeenCalledWith(
      "offers-api",
      expect.objectContaining({ body: { action: "retry_checkout", token } }),
    );
  });
  it("locks a pending retry and preserves private access when provider verification fails", async () => {
    openAccess();
    let fail!: (value: unknown) => void;
    invoke.mockImplementation((_name, { body }) =>
      body.action === "retry_checkout"
        ? new Promise((resolve) => {
            fail = resolve;
          })
        : Promise.resolve(respond(recovering())),
    );
    render(<OfferAccessPage />);
    const restart = await screen.findByRole("button", {
      name: /Restart checkout/,
    });
    fireEvent.click(restart);
    fireEvent.click(restart);
    expect(
      screen
        .getByRole("button", { name: "Checking previous checkout…" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      invoke.mock.calls.filter(
        (call) => call[1].body.action === "retry_checkout",
      ),
    ).toHaveLength(1);
    await act(async () =>
      fail({
        data: {
          error: "The previous payment is not confirmed closed and unpaid.",
          code: "checkout_not_safe_to_retry",
        },
        error: null,
      }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "not confirmed closed and unpaid",
    );
    expect(assign).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("offer-access-token")).toBe(token);
  });
  it.each(["expired", "failed", "refunded"] as const)(
    "does not offer retry for blocked %s orders",
    async (status) => {
      openAccess();
      invoke.mockResolvedValue(respond(recovering(status, false)));
      render(<OfferAccessPage />);
      await screen.findByRole("button", { name: "Refresh status" });
      expect(
        screen.queryByRole("button", { name: /Restart checkout/ }),
      ).toBeNull();
      if (status !== "refunded")
        expect(
          screen
            .getByRole("link", { name: "Contact support about this checkout" })
            .getAttribute("href"),
        ).toBe("/support");
    },
  );
});

describe("optional checkout extras and alternative follow-ups", () => {
  const bump = {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "templates",
    title: "Extra templates",
    summary: "A second private download.",
    cover_url: null,
    kind: "paid" as const,
    amount_minor: 500,
    currency: "usd",
  };
  it("requires an explicit extra selection and sends the selected offer with the existing retry token", async () => {
    invoke.mockImplementation(async (_name, { body }) =>
      respond(
        body.action === "get"
          ? { offer: { ...offer, bump_offer: bump }, payments_ready: true }
          : {
              status: "pending",
              checkout_url: "https://checkout.stripe.com/c/pay/test",
            },
      ),
    );
    render(<OfferLanding offer={{ ...offer, bump_offer: bump }} />);
    const extra = screen.getByRole("checkbox", { name: /Add Extra templates/ });
    expect((extra as HTMLInputElement).checked).toBe(false);
    await waitFor(() =>
      expect((extra as HTMLInputElement).disabled).toBe(false),
    );
    fireEvent.click(extra);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "buyer@example.com" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Also send me/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Continue to checkout · \$5/ }),
    );
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(invoke).toHaveBeenCalledWith(
      "offers-api",
      expect.objectContaining({
        body: expect.objectContaining({
          action: "claim",
          bump_offer_id: bump.id,
          email: "buyer@example.com",
        }),
      }),
    );
  });
  it("reveals the downsell after a target-bound decline while keeping both purchased downloads", async () => {
    openAccess();
    const upsell = {
      ...offer,
      id: "33333333-3333-4333-8333-333333333333",
      title: "Implementation course",
    };
    const downsell = {
      ...offer,
      id: "44444444-4444-4444-8444-444444444444",
      title: "Quick reference",
    };
    const items = [
      {
        id: "primary-item",
        offer_id: offer.id,
        role: "primary" as const,
        title: offer.title,
        asset_name: "guide.pdf",
        amount_minor: 0,
        currency: "usd",
      },
      {
        id: "bump-item",
        offer_id: bump.id,
        role: "bump" as const,
        title: bump.title,
        asset_name: "extras.pdf",
        amount_minor: 500,
        currency: "usd",
      },
    ];
    let declined = false;
    invoke.mockImplementation(async (_name, { body }) => {
      if (body.action === "decline") {
        declined = true;
        return respond({ ok: true });
      }
      return respond({
        ...access,
        items,
        next_offer: declined ? downsell : upsell,
        follow_up_stage: declined ? "downsell" : "upsell",
      });
    });
    render(<OfferAccessPage />);
    await screen.findByText("Implementation course");
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    await screen.findByText("Quick reference");
    expect(invoke).toHaveBeenCalledWith(
      "offers-api",
      expect.objectContaining({
        body: { action: "decline", token, offer_id: upsell.id },
      }),
    );
    expect(
      screen.getByRole("button", { name: `Download ${offer.title}` }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: `Download ${bump.title}` }),
    ).toBeTruthy();
    expect(screen.getByText("An optional alternative")).toBeTruthy();
  });
});

it("keeps the local preview extra in sync when an author adds, edits or removes it", () => {
  const extra = {
    id: "extra",
    slug: "extra",
    title: "First extra",
    summary: "Extra files",
    cover_url: null,
    kind: "paid" as const,
    amount_minor: 500,
    currency: "usd",
  };
  const { rerender } = render(<OfferLanding offer={offer} preview />);
  expect(
    screen.queryByRole("checkbox", { name: /Add First extra/ }),
  ).toBeNull();
  rerender(<OfferLanding offer={{ ...offer, bump_offer: extra }} preview />);
  expect(
    (
      screen.getByRole("checkbox", {
        name: /Add First extra/,
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true);
  rerender(
    <OfferLanding
      offer={{
        ...offer,
        bump_offer: { ...extra, title: "Replacement extra", amount_minor: 900 },
      }}
      preview
    />,
  );
  expect(
    screen.queryByRole("checkbox", { name: /Add First extra/ }),
  ).toBeNull();
  expect(
    screen.getByRole("checkbox", { name: /Add Replacement extra · \$9/ }),
  ).toBeTruthy();
  rerender(<OfferLanding offer={{ ...offer, bump_offer: null }} preview />);
  expect(
    screen.queryByRole("checkbox", { name: /Add Replacement extra/ }),
  ).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
});
