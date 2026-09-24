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
    expect(html).toContain("Enable JavaScript to securely request");
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
    expect(screen.getAllByText(/destination is not available/)).toHaveLength(2);
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
    expect(button.closest("form")).toBeNull();
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
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
