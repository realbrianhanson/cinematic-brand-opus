// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBuilder, newSection } from "@/lib/offerBuilder";
import type {
  OfferBuilderDocument,
  OfferBuilderSaveInput,
} from "@/lib/offerBuilderClient";

const mock = vi.hoisted(() => ({
  save: vi.fn(),
  load: vi.fn(),
  upload: vi.fn(),
  navigate: vi.fn(),
  read: vi.fn(),
  blocker: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: unknown) => mock.blocker(options),
}));
vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mock.navigate,
}));
vi.mock("@/config/SiteConfigContext", () => ({
  useSiteConfig: () => ({ identity: { siteUrl: "https://example.com" } }),
}));
vi.mock("@/lib/offerBuilderClient", () => ({
  loadOfferBuilder: (...args: unknown[]) => mock.load(...args),
  saveOfferBuilder: (...args: unknown[]) => mock.save(...args),
}));
vi.mock("../offers/OfferCopyAssistant", () => ({ default: () => null }));
vi.mock("../offers/OfferProofLibrary", () => ({ default: () => null }));
vi.mock("@/components/offers/OfferBuilderPreview", () => ({
  default: ({
    builder,
    stage,
  }: {
    builder: ReturnType<typeof emptyBuilder>;
    stage: string;
  }) => (
    <div data-testid="preview">
      {stage === "thank-you"
        ? builder.presentation.thankYou.headline
        : builder.presentation[stage as "landing" | "upsell"].headline}
    </div>
  ),
}));
vi.mock("@/lib/offers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offers")>()),
  invokeOfferApi: async () => ({
    payments_ready: false,
    secret_configured: false,
    webhook_configured: false,
    mode: "unconfigured",
    webhook_url: "https://backend.example.com/webhook",
  }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const readQuery = () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      abortSignal: () => query,
      maybeSingle: () => mock.read(),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  };
  return {
    supabase: {
      from: readQuery,
      storage: { from: () => ({ upload: mock.upload }) },
    },
  };
});
import OfferEditor from "../OfferEditor";

const row = {
  id: "00000000-0000-4000-a000-000000000001",
  title: "Useful guide",
  slug: "useful-guide",
  summary: "A useful guide",
  body: "",
  cover_url: null,
  status: "draft",
  kind: "free",
  amount_minor: 0,
  currency: "usd",
  checkout_mode: "native",
  price_display_mode: "fixed",
  external_url: null,
  external_button_text: "",
  is_affiliate: false,
  affiliate_disclosure: null,
  asset_path: null,
  asset_name: null,
  thank_you_message: "Thank you",
  next_offer_id: null,
  next_offer_window_minutes: 0,
  funnel_only: false,
  show_in_shop: false,
  shop_category: "resource",
  shop_featured: false,
  created_at: "2026-09-19T00:00:00Z",
  updated_at: "2026-09-19T00:00:00Z",
  presentation: null,
};
function mount(id?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OfferEditor id={id} />
    </QueryClientProvider>,
  );
}
function navigateStep(name: string) {
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Offer builder steps" }),
    ).getByRole("button", { name: new RegExp(name) }),
  );
}
async function loaded() {
  await screen.findByLabelText("Title");
}
function edit(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function draft() {
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
}
function publish() {
  navigateStep("Review");
  fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
}
function saveUsing(initial: Record<string, unknown> = row) {
  mock.save.mockImplementation(async (input: OfferBuilderSaveInput) => {
    const live = input.publish
      ? {
          ...initial,
          ...input.document.offer,
          status: "published",
          updated_at: "2026-09-19T00:01:00Z",
        }
      : initial;
    return {
      offer: live,
      draft: {
        offer_id: row.id,
        document: input.document,
        version: (input.expectedDraftVersion ?? 0) + 1,
        updated_at: "2026-09-19T00:01:00Z",
        base_offer_updated_at: live.updated_at,
      },
      revision_id: `revision-${(input.expectedDraftVersion ?? 0) + 1}`,
      published: input.publish,
    };
  });
}
function existing(initial: Record<string, unknown> = row) {
  mock.read.mockResolvedValue({ data: initial, error: null });
  saveUsing(initial);
  mount(row.id);
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: vi.fn(() => row.id),
  });
  mock.read.mockResolvedValue({ data: null, error: null });
  mock.load.mockResolvedValue({ draft: null, history: [] });
  mock.save.mockRejectedValue(new Error("Network unavailable"));
  mock.upload.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("offer builder save and upload safety", () => {
  it.each(["native", "external"] as const)(
    "inserts an image at the selection and saves only on request for %s offers",
    async (checkoutMode) => {
      const initial = {
        ...row,
        checkout_mode: checkoutMode,
        external_url:
          checkoutMode === "external" ? "https://example.com/offer" : null,
        body: "BeforeREPLACEAfter",
        cover_url: "https://images.example.com/cover.webp",
      };
      existing(initial);
      const body = (await screen.findByLabelText(
        /Full description/,
      )) as HTMLTextAreaElement;
      body.focus();
      body.setSelectionRange(6, 13);
      fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
      edit("Image URL", "https://images.example.com/detail.webp");
      edit("Image description (alt text)", "A clear process diagram");
      edit("Image caption (optional)", "The process in three steps.");
      fireEvent.click(
        screen.getByRole("button", { name: "Add to description" }),
      );
      const expected =
        'Before\n\n![A clear process diagram](https://images.example.com/detail.webp "The process in three steps.")\n\nAfter';
      expect(body.value).toBe(expected);
      expect(screen.queryByLabelText("Image URL")).toBeNull();
      await waitFor(() => {
        expect(document.activeElement).toBe(body);
        expect(body.selectionStart).toBe(expected.indexOf("After"));
        expect(body.selectionEnd).toBe(body.selectionStart);
      });
      expect(mock.save).not.toHaveBeenCalled();
      expect(mock.upload).not.toHaveBeenCalled();
      expect(
        (screen.getByLabelText(/Cover image URL/) as HTMLInputElement).value,
      ).toBe(initial.cover_url);
      draft();
      await screen.findByText(/Draft saved privately/);
      expect(mock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          publish: false,
          document: expect.objectContaining({
            offer: expect.objectContaining({
              body: expected,
              cover_url: initial.cover_url,
              checkout_mode: checkoutMode,
            }),
          }),
        }),
      );
    },
  );
  it("rejects unsafe image fields and cancels without changing or saving the description", () => {
    mount();
    navigateStep("Pages");
    edit(/Full description/, "Keep this text.");
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    edit("Image URL", "https://user:secret@example.com/image.webp");
    fireEvent.click(screen.getByRole("button", { name: "Add to description" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "full HTTPS image URL",
    );
    edit("Image URL", "https://images.example.com/detail.webp");
    fireEvent.click(screen.getByRole("button", { name: "Add to description" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Describe the image",
    );
    edit("Image description (alt text)", "A process diagram");
    edit("Image caption (optional)", 'A "quoted" caption');
    fireEvent.click(screen.getByRole("button", { name: "Add to description" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "without double quotes",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel image" }));
    expect(
      (screen.getByLabelText(/Full description/) as HTMLTextAreaElement).value,
    ).toBe("Keep this text.");
    expect(screen.queryByLabelText("Image URL")).toBeNull();
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("handles Enter in image fields without submitting the offer", () => {
    mount();
    navigateStep("Pages");
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    edit("Image URL", "https://images.example.com/detail.webp");
    edit("Image description (alt text)", "A process diagram");
    expect(
      fireEvent.keyDown(screen.getByLabelText("Image description (alt text)"), {
        key: "Enter",
        code: "Enter",
      }),
    ).toBe(false);
    expect(
      (screen.getByLabelText(/Full description/) as HTMLTextAreaElement).value,
    ).toBe("![A process diagram](https://images.example.com/detail.webp)\n\n");
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("refuses image insertion beyond the description limit without losing text", () => {
    mount();
    navigateStep("Pages");
    edit(/Full description/, "a".repeat(20000));
    const body = screen.getByLabelText(
      /Full description/,
    ) as HTMLTextAreaElement;
    body.setSelectionRange(20000, 20000);
    fireEvent.click(screen.getByRole("button", { name: "Insert image" }));
    edit("Image URL", "https://images.example.com/detail.webp");
    edit("Image description (alt text)", "A process diagram");
    fireEvent.click(screen.getByRole("button", { name: "Add to description" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "exceed 20,000 characters",
    );
    expect(body.value).toBe("a".repeat(20000));
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("publishes an external affiliate offer with provider pricing and no native requirements", async () => {
    existing();
    await loaded();
    navigateStep("Delivery");
    edit("Checkout or delivery method", "external");
    edit(/Destination URL/, "https://example.com/product?affiliate=brian");
    edit("Offer type", "paid");
    edit(/Price shown in Shop/, "provider");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /This is an affiliate link/ }),
    );
    expect(screen.queryByText("Private download")).toBeNull();
    expect(screen.queryByLabelText("Follow-up offer")).toBeNull();
    expect(screen.queryByLabelText("Price")).toBeNull();
    navigateStep("Review");
    fireEvent.click(screen.getByRole("checkbox", { name: "Show in Shop" }));
    publish();
    await screen.findByText(/Offer published. Your new copy/);
    expect(mock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        publish: true,
        expectedOfferUpdatedAt: row.updated_at,
        expectedDraftVersion: null,
        document: expect.objectContaining({
          offer: expect.objectContaining({
            checkout_mode: "external",
            price_display_mode: "provider",
            amount_minor: 0,
            external_url: "https://example.com/product?affiliate=brian",
            is_affiliate: true,
            affiliate_disclosure: null,
            asset_path: null,
            asset_name: null,
            show_in_shop: true,
            next_offer_id: null,
            next_offer_window_minutes: 0,
            funnel_only: false,
          }),
        }),
      }),
    );
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("restores native price and file requirements after switching away from external checkout", async () => {
    existing({
      ...row,
      checkout_mode: "external",
      kind: "paid",
      price_display_mode: "provider",
      external_url: "https://example.com/product",
    });
    await loaded();
    navigateStep("Delivery");
    edit("Checkout or delivery method", "native");
    expect(screen.getByText("Private download")).toBeTruthy();
    expect(screen.getByLabelText("Price")).toBeTruthy();
    expect(screen.queryByLabelText(/Destination URL/)).toBeNull();
    publish();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Enter a price"),
    );
    navigateStep("Delivery");
    edit("Price", "7");
    publish();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "uploaded download file",
      ),
    );
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("keeps the public Shop link after a draft change and removes it only when published", async () => {
    existing({
      ...row,
      status: "published",
      show_in_shop: true,
      asset_path: "offer/version.pdf",
      asset_name: "Guide.pdf",
    });
    await loaded();
    navigateStep("Review");
    expect(
      screen.getByRole("link", { name: "View Shop" }).getAttribute("href"),
    ).toBe("https://example.com/shop");
    fireEvent.click(screen.getByRole("checkbox", { name: "Show in Shop" }));
    draft();
    await screen.findByText(/Draft saved privately/);
    expect(screen.getByRole("link", { name: "View Shop" })).toBeTruthy();
    expect(mock.save.mock.calls[0][0].publish).toBe(false);
    publish();
    await screen.findByText(/Offer published/);
    expect(screen.queryByRole("link", { name: "View Shop" })).toBeNull();
    expect(mock.save.mock.calls[1][0].expectedDraftVersion).toBe(1);
  });
  it("keeps Shop category and featured settings in a private draft", async () => {
    existing();
    await loaded();
    navigateStep("Review");
    fireEvent.click(screen.getByRole("checkbox", { name: "Show in Shop" }));
    edit("Shop category", "training");
    fireEvent.click(screen.getByRole("checkbox", { name: "Feature in Shop" }));
    draft();
    await screen.findByText(/Draft saved privately/);
    expect(mock.save.mock.calls[0][0].document.offer).toEqual(
      expect.objectContaining({
        show_in_shop: true,
        shop_category: "training",
        shop_featured: true,
        status: "draft",
      }),
    );
    expect(
      (screen.getByLabelText("Shop category") as HTMLSelectElement).value,
    ).toBe("training");
    expect(screen.queryByRole("link", { name: "View Shop" })).toBeNull();
  });
  it("clears and disables Shop placement when an offer becomes follow-up only", async () => {
    existing({
      ...row,
      show_in_shop: true,
      shop_category: "course",
      shop_featured: true,
    });
    await loaded();
    navigateStep("Next step");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Make this offer available only as a follow-up/,
      }),
    );
    navigateStep("Review");
    for (const name of ["Show in Shop", "Feature in Shop"]) {
      const input = screen.getByRole("checkbox", { name }) as HTMLInputElement;
      expect(input.checked).toBe(false);
      expect(input.disabled).toBe(true);
    }
    draft();
    await screen.findByText(/Draft saved privately/);
    expect(mock.save.mock.calls[0][0].document.offer).toEqual(
      expect.objectContaining({
        funnel_only: true,
        show_in_shop: false,
        shop_featured: false,
        shop_category: "course",
        status: "draft",
      }),
    );
  });
  it("reuses the complete request after an uncertain save so retry cannot create a duplicate", async () => {
    mount();
    navigateStep("Pages");
    edit("Title", row.title);
    draft();
    await screen.findByText("Network unavailable");
    const first = mock.save.mock.calls[0][0];
    saveUsing();
    draft();
    await screen.findByText(/Draft saved privately/);
    expect(mock.save).toHaveBeenCalledTimes(2);
    expect(mock.save.mock.calls[1][0]).toEqual(first);
    expect(first.offerId).toBe(row.id);
    expect(first.requestId).toBe(row.id);
    expect(mock.navigate).toHaveBeenCalledWith(`/admin/offers/${row.id}/edit`, {
      replace: true,
    });
  });
  it("reports a concurrency conflict while preserving unsaved copy and product edits", async () => {
    existing();
    await loaded();
    mock.save.mockRejectedValue(
      new Error("This offer changed in another tab. Reload before saving."),
    );
    edit("Title", "Changed title");
    edit("Page headline", "A stronger promise");
    draft();
    await screen.findByText(/This offer changed in another tab/);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Changed title",
    );
    expect(
      (screen.getByLabelText("Page headline") as HTMLTextAreaElement).value,
    ).toBe("A stronger promise");
    expect(screen.getByTestId("preview").textContent).toBe(
      "A stronger promise",
    );
    expect(mock.navigate).not.toHaveBeenCalled();
  });
  it("rejects unsupported and oversized files before private storage calls", async () => {
    mount();
    navigateStep("Delivery");
    const input = screen.getByLabelText(/Upload the resource/);
    fireEvent.change(input, {
      target: {
        files: [new File(["<html>"], "page.html", { type: "text/html" })],
      },
    });
    await screen.findByText(/Choose a PDF/);
    const file = new File(["pdf"], "guide.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 25 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText(/no larger than 25 MB/);
    expect(mock.upload).not.toHaveBeenCalled();
    fireEvent.change(input, {
      target: {
        files: [new File(["pdf"], "guide.pdf", { type: "application/pdf" })],
      },
    });
    await waitFor(() => expect(mock.upload).toHaveBeenCalledTimes(1));
    expect(mock.upload.mock.calls[0][0]).toBe(`${row.id}/${row.id}.pdf`);
    expect(mock.upload.mock.calls[0][2]).toEqual({
      contentType: "application/pdf",
      upsert: false,
    });
    await screen.findByText(/File uploaded privately/);
    expect(mock.save).not.toHaveBeenCalled();
  });
});

describe("private drafts, revisions and page building", () => {
  it("loads the private draft over the published offer and sends both current versions on save", async () => {
    const builder = emptyBuilder();
    builder.presentation.landing.headline = "Private headline";
    mock.load.mockResolvedValue({
      draft: {
        document: {
          offer: { title: "Private title", amount_minor: 1200, kind: "paid" },
          builder,
        },
        version: 7,
        updated_at: row.updated_at,
        base_offer_updated_at: row.updated_at,
      },
      history: [],
    });
    existing({ ...row, title: "Live title", status: "published" });
    await loaded();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Private title",
    );
    expect(screen.getByTestId("preview").textContent).toBe("Private headline");
    draft();
    await screen.findByText(/Draft saved privately/);
    expect(mock.save.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        expectedOfferUpdatedAt: row.updated_at,
        expectedDraftVersion: 7,
        publish: false,
      }),
    );
    expect(mock.save.mock.calls[0][0].document.offer.amount_minor).toBe(1200);
  });
  it("restores a revision into the working copy without writing and uses current CAS when saved", async () => {
    const old = emptyBuilder();
    old.presentation.landing.headline = "Earlier headline";
    const document: OfferBuilderDocument = {
      offer: {
        title: "Earlier offer",
        slug: "earlier-offer",
        body: "Earlier copy",
      },
      builder: old,
    };
    mock.load.mockResolvedValue({
      draft: {
        document: { offer: {}, builder: emptyBuilder() },
        version: 9,
        updated_at: row.updated_at,
        base_offer_updated_at: row.updated_at,
      },
      history: [
        {
          id: "older",
          document,
          version: 2,
          published: true,
          created_at: row.created_at,
        },
      ],
    });
    existing();
    await loaded();
    navigateStep("Review");
    fireEvent.click(screen.getByRole("button", { name: "Restore revision 2" }));
    expect(mock.save).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Earlier offer",
    );
    expect(screen.getByTestId("preview").textContent).toBe("Earlier headline");
    draft();
    await screen.findByText(/Draft saved privately/);
    expect(mock.save.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        expectedDraftVersion: 9,
        expectedOfferUpdatedAt: row.updated_at,
        publish: false,
      }),
    );
  });
  it("requires a choice for a draft based on an older public offer", async () => {
    mock.load.mockResolvedValue({
      draft: {
        document: { offer: { title: "Older draft" }, builder: emptyBuilder() },
        version: 4,
        updated_at: row.updated_at,
        base_offer_updated_at: "2026-09-18T00:00:00Z",
      },
      history: [],
    });
    existing({ ...row, status: "published" });
    await loaded();
    draft();
    expect(mock.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep this draft" }));
    draft();
    await screen.findByText(/Draft saved privately/);
    expect(mock.save.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        expectedOfferUpdatedAt: row.updated_at,
        expectedDraftVersion: 4,
      }),
    );
    expect(mock.save.mock.calls[0][0].document.offer.title).toBe("Older draft");
  });
  it("can start with only a strategy brief and save an incomplete paid offer privately", async () => {
    saveUsing();
    mount();
    edit(/Who is this for/, "New consultants finding their first client");
    navigateStep("Delivery");
    edit("Offer type", "paid");
    draft();
    await screen.findByText(/Draft saved privately/);
    const input = mock.save.mock.calls[0][0];
    expect(input.publish).toBe(false);
    expect(input.document.offer).toEqual(
      expect.objectContaining({
        title: "",
        slug: "",
        amount_minor: 0,
        kind: "paid",
      }),
    );
    expect(input.document.builder.strategy.audience).toContain(
      "New consultants",
    );
  });
  it("keeps landing, upsell and thank-you copy distinct in the draft and live preview", async () => {
    existing();
    await loaded();
    edit("Page headline", "Get your first result");
    edit("Presentation", "upsell");
    edit("Page headline", "Implement it faster");
    edit("Presentation", "thank-you");
    edit("Thank-you headline", "Your next action is ready");
    expect(screen.getByTestId("preview").textContent).toBe(
      "Your next action is ready",
    );
    draft();
    await screen.findByText(/Draft saved privately/);
    const { presentation } = mock.save.mock.calls[0][0].document.builder;
    expect(presentation.landing.headline).toBe("Get your first result");
    expect(presentation.upsell.headline).toBe("Implement it faster");
    expect(presentation.thankYou.headline).toBe("Your next action is ready");
  });
  it("reorders structured sections without changing their copy", async () => {
    const builder = emptyBuilder();
    builder.presentation.landing.sections = [
      {
        ...newSection("benefits"),
        id: "first",
        heading: "First",
        body: "First content",
      },
      {
        ...newSection("proof"),
        id: "second",
        heading: "Second",
        body: "Actual proof",
      },
    ];
    mock.load.mockResolvedValue({
      draft: {
        document: { offer: {}, builder },
        version: 3,
        updated_at: row.updated_at,
        base_offer_updated_at: row.updated_at,
      },
      history: [],
    });
    existing();
    await loaded();
    fireEvent.click(screen.getByText("2. Second"));
    // Details are opened explicitly so the move control is available to keyboard and pointer users.
    const details = screen.getByText("2. Second").closest("details")!;
    details.open = true;
    fireEvent.click(screen.getByRole("button", { name: "Move section 2 up" }));
    draft();
    await screen.findByText(/Draft saved privately/);
    const sections =
      mock.save.mock.calls[0][0].document.builder.presentation.landing.sections;
    expect(sections.map((section: { id: string }) => section.id)).toEqual([
      "second",
      "first",
    ]);
    expect(sections[0].body).toBe("Actual proof");
  });
  it("does not open a partial editor when the saved draft fails to load", async () => {
    mock.read.mockResolvedValue({ data: row, error: null });
    mock.load.mockRejectedValue(new Error("Draft access unavailable"));
    mount(row.id);
    await screen.findByText(/This information could not be loaded/);
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(mock.save).not.toHaveBeenCalled();
  });
});
