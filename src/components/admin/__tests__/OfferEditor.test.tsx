// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBuilder, newSection } from "@/lib/offerBuilder";
import { type OfferStarter } from "@/lib/offerStarters";
import {
  draftPayload,
  saveOfferHandoff,
  toForm,
  type Offer,
} from "../offerEditorState";
import type {
  OfferBuilderDocument,
  OfferBuilderSaveInput,
} from "@/lib/offerBuilderClient";

const mock = vi.hoisted(() => ({
  save: vi.fn(),
  load: vi.fn(),
  connections: vi.fn(),
  upload: vi.fn(),
  navigate: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
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
  loadConnectedOffers: (...args: unknown[]) => mock.connections(...args),
  saveOfferBuilder: (...args: unknown[]) => mock.save(...args),
}));
vi.mock("../offers/OfferCopyAssistant", () => ({ default: () => null }));
vi.mock("../offers/OfferProofLibrary", () => ({
  default: ({
    onStateChange,
  }: {
    onStateChange: (state: { dirty: boolean; busy: boolean }) => void;
  }) => (
    <div>
      <label>
        Evidence title
        <input onChange={() => onStateChange({ dirty: true, busy: false })} />
      </label>
    </div>
  ),
}));
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
    let update: unknown = null;
    const filters: unknown[][] = [];
    const query = {
      select: () => query,
      update: (values: unknown) => {
        update = values;
        return query;
      },
      eq: (...args: unknown[]) => {
        filters.push(args);
        return query;
      },
      order: () => query,
      limit: () => query,
      abortSignal: () => query,
      maybeSingle: () =>
        update ? mock.write(update, filters) : mock.read(filters),
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
  bump_offer_id: null,
  downsell_offer_id: null,
  next_offer_window_minutes: 0,
  funnel_only: false,
  show_in_shop: false,
  shop_category: "resource",
  shop_featured: false,
  created_at: "2026-09-19T00:00:00Z",
  updated_at: "2026-09-19T00:00:00Z",
  presentation: null,
};
function mount(id?: string, starter?: OfferStarter) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const editor = (selectedStarter?: OfferStarter) => (
    <QueryClientProvider client={client}>
      <OfferEditor id={id} starter={selectedStarter} />
    </QueryClientProvider>
  );
  const result = render(editor(starter));
  return {
    ...result,
    changeStarter: (next?: OfferStarter) => result.rerender(editor(next)),
  };
}
function navigateStep(name: string) {
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Offer builder steps" }),
    ).getByRole("button", { name: new RegExp(name) }),
  );
}
function openBlueprint() {
  fireEvent.click(
    screen.getByText("Advanced: standalone pages for an external call funnel"),
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
  const confirm = screen.queryByRole("button", {
    name: /^Publish (now|archived offer)$/,
  });
  if (confirm) fireEvent.click(confirm);
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
  mock.connections.mockResolvedValue([]);
  mock.save.mockRejectedValue(new Error("Network unavailable"));
  mock.upload.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("guided funnel workflow", () => {
  beforeEach(() => {
    let id = 100;
    vi.mocked(crypto.randomUUID).mockImplementation(
      () => `33333333-3333-4333-a333-${String(++id).padStart(12, "0")}`,
    );
  });

  it("requires authored facts and builds the first draft from the brief", async () => {
    mount(undefined, "lead-magnet");
    const preview = screen.getByRole("button", {
      name: "Preview my first draft",
    });
    expect((preview as HTMLButtonElement).disabled).toBe(true);
    edit("Offer name", "Planning workbook");
    edit("Short offer description", "A workbook for your next launch.");
    edit(/^What will they be able to do\?/, "Plan your next launch");
    edit(/^Why does your approach work\?/, "Follow the five planning prompts.");
    edit(
      /^What exactly do they receive\?/,
      "- Planning worksheet\n- Launch checklist",
    );
    fireEvent.click(preview);
    fireEvent.click(
      screen.getByRole("button", { name: "Apply draft to selected pages" }),
    );
    expect(
      (screen.getByLabelText("Page headline") as HTMLTextAreaElement).value,
    ).toBe("Plan your next launch");
    expect(screen.getByTestId("preview").textContent).toBe(
      "Plan your next launch",
    );
    expect(mock.save).not.toHaveBeenCalled();
  });

  it("creates a private paid bump, preserves its draft details, then saves the parent before opening it", async () => {
    mock.read.mockResolvedValue({
      data: { ...row, currency: "cad" },
      error: null,
    });
    mock.save.mockImplementation(async (input: OfferBuilderSaveInput) => ({
      // New draft rows deliberately remain free/USD shells until publication.
      offer: { ...row, id: input.offerId, title: input.document.offer.title },
      draft: {
        offer_id: input.offerId,
        document: input.document,
        version: 1,
        updated_at: row.updated_at,
        base_offer_updated_at: row.updated_at,
      },
      revision_id: `revision-${input.offerId}`,
      published: false,
    }));
    mount(row.id);
    await loaded();
    navigateStep("Order bump");
    fireEvent.click(screen.getByRole("button", { name: "Create order bump" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Offer name"), {
      target: { value: "Bonus pack" },
    });
    fireEvent.change(
      within(dialog).getByLabelText("What will this help them do?"),
      { target: { value: "Use a launch checklist." } },
    );
    fireEvent.change(within(dialog).getByLabelText("Price (CAD)"), {
      target: { value: "19.99" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create draft & attach" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const child = mock.save.mock.calls[0][0] as OfferBuilderSaveInput;
    expect(child.publish).toBe(false);
    expect(child.document.offer).toMatchObject({
      title: "Bonus pack",
      kind: "paid",
      currency: "cad",
      amount_minor: 1999,
      show_in_shop: false,
    });
    expect(
      (screen.getByLabelText("Checkout extra") as HTMLSelectElement).value,
    ).toBe(child.offerId);
    expect(
      within(screen.getByLabelText("Checkout extra")).getByRole("option", {
        name: "Bonus pack (draft)",
      }),
    ).toBeTruthy();
    expect(mock.navigate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Save funnel & edit Bonus pack" }),
    );
    await waitFor(() => expect(mock.navigate).toHaveBeenCalled());
    expect(mock.save.mock.calls[1][0]).toMatchObject({
      offerId: row.id,
      publish: false,
      document: { offer: { bump_offer_id: child.offerId, currency: "cad" } },
    });
    expect(mock.navigate).toHaveBeenCalledWith(
      `/admin/offers/${child.offerId}/edit?parent=${row.id}&relation=bump`,
    );
  });

  it("keeps the parent open when its save fails before editing a connected step", async () => {
    const childId = "55555555-5555-4555-a555-555555555555";
    const child = { ...row, id: childId, title: "Follow-up pack" };
    mock.read.mockResolvedValue({
      data: { ...row, next_offer_id: childId },
      error: null,
    });
    mock.connections.mockResolvedValue([{ offer: child, document: null }]);
    mount(row.id);
    await loaded();
    navigateStep("Order bump");
    const open = await screen.findByRole("button", {
      name: "Save funnel & edit Follow-up pack",
    });
    fireEvent.click(open);
    await screen.findByRole("alert");
    expect(mock.navigate).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("Follow-up offer") as HTMLSelectElement).value,
    ).toBe(childId);
  });

  it("blocks leaving while a connected draft save is uncertain", async () => {
    existing();
    await loaded();
    navigateStep("Order bump");
    mock.save.mockRejectedValueOnce(new Error("Connection interrupted"));
    fireEvent.click(screen.getByRole("button", { name: "Create upsell" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Offer name"), {
      target: { value: "Next step" },
    });
    fireEvent.change(
      within(dialog).getByLabelText("What will this help them do?"),
      { target: { value: "Apply the plan." } },
    );
    fireEvent.change(within(dialog).getByLabelText("Price (USD)"), {
      target: { value: "29" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create draft & attach" }),
    );
    await within(dialog).findByRole("button", { name: "Retry the same save" });
    const guard = mock.blocker.mock.lastCall?.[0] as {
      shouldBlockFn: () => boolean;
      enableBeforeUnload: () => boolean;
    };
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    expect(guard.shouldBlockFn()).toBe(true);
    expect(guard.enableBeforeUnload()).toBe(true);
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Cancel",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(mock.navigate).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});

describe("offer starter initialization", () => {
  function uniqueSections() {
    let sectionId = 0;
    vi.mocked(crypto.randomUUID).mockImplementation(
      () => `22222222-2222-4222-a222-${String(++sectionId).padStart(12, "0")}`,
    );
  }

  it("starts a paid sales page and protects edits when the URL starter changes", async () => {
    uniqueSections();
    const editor = mount(undefined, "sales");
    expect(
      screen.getByRole("heading", { name: "Product sales funnel" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Choose another funnel type" })
        .getAttribute("href"),
    ).toBe("/admin/funnel-builder");
    expect(
      screen
        .getByRole("button", { name: "Use this page layout" })
        .closest("details")?.open,
    ).toBe(false);
    navigateStep("Pages");
    edit("Title", "My edited product");
    editor.changeStarter("lead-magnet");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "My edited product",
    );
    expect(
      screen.getByRole("heading", { name: "Product sales funnel" }),
    ).toBeTruthy();
    draft();
    await waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
    const document = mock.save.mock.calls[0][0].document;
    expect(document.offer.kind).toBe("paid");
    expect(document.offer.checkout_mode).toBe("native");
    expect(document.builder.presentation.landing.sections).toHaveLength(7);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const blocker = mock.blocker.mock.calls.at(-1)?.[0];
    expect(blocker.shouldBlockFn()).toBe(true);
    expect(confirm).toHaveBeenCalledWith(
      "Leave this offer? Your unsaved changes will be lost.",
    );
    confirm.mockRestore();
  });

  it("keeps a saved draft authoritative even when a starter is supplied", async () => {
    uniqueSections();
    const builder = emptyBuilder();
    builder.presentation.landing.headline = "My saved draft headline";
    const document = {
      offer: draftPayload(toForm(row as Offer)).values,
      builder,
    };
    mock.read.mockResolvedValue({ data: row, error: null });
    mock.load.mockResolvedValue({
      draft: { document, version: 2, base_offer_updated_at: row.updated_at },
      history: [],
    });
    mount(row.id, "upsell");
    await loaded();
    expect(screen.getByTestId("preview").textContent).toBe(
      "My saved draft headline",
    );
    expect(
      screen.queryByRole("heading", { name: "Upsell or downsell offer" }),
    ).toBeNull();
    draft();
    await waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
    expect(mock.save.mock.calls[0][0].document).toEqual(document);
  });

  it("opens the actual upsell pitch for a follow-up starter and saves edits there", async () => {
    uniqueSections();
    mount(undefined, "upsell");
    navigateStep("Pages");
    expect(
      (screen.getByLabelText("Presentation") as HTMLSelectElement).value,
    ).toBe("upsell");
    edit("Title", "Implementation toolkit");
    edit("Page headline", "Put your original purchase to work faster");
    expect(screen.getByTestId("preview").textContent).toBe(
      "Put your original purchase to work faster",
    );
    draft();
    await waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
    const { presentation } = mock.save.mock.calls[0][0].document.builder;
    expect(presentation.upsell.headline).toBe(
      "Put your original purchase to work faster",
    );
    expect(presentation.landing.headline).toBe("");
    expect(mock.save.mock.calls[0][0].document.offer.funnel_only).toBe(true);
  });

  it("keeps recovered unsaved copy and its step ahead of starter defaults", async () => {
    uniqueSections();
    const builder = emptyBuilder();
    builder.presentation.landing.headline = "Recovered unsaved headline";
    const form = { ...toForm(row as Offer), title: "Recovered unsaved title" };
    saveOfferHandoff(row.id, { form, builder, step: "strategy" });
    mock.read.mockResolvedValue({ data: row, error: null });
    mount(row.id, "external");
    await loaded();
    const strategy = within(
      screen.getByRole("navigation", { name: "Offer builder steps" }),
    ).getByRole("button", { name: /Strategy/ });
    expect(strategy.getAttribute("aria-current")).toBe("step");
    expect(screen.getByTestId("preview").textContent).toBe(
      "Recovered unsaved headline",
    );
    draft();
    await waitFor(() => expect(mock.save).toHaveBeenCalledOnce());
    expect(mock.save.mock.calls[0][0].document).toEqual({
      offer: draftPayload(form).values,
      builder,
    });
  });
});

describe("offer builder save and upload safety", () => {
  it("opens external delivery setup from the blueprint without switching fulfillment", async () => {
    existing();
    await loaded();
    navigateStep("Strategy");
    openBlueprint();
    expect(
      (
        screen.getByRole("button", {
          name: "Use this page layout",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Configure external delivery" }),
    );
    const delivery = within(
      screen.getByRole("navigation", { name: "Offer builder steps" }),
    ).getByRole("button", { name: /Delivery/ });
    expect(delivery.getAttribute("aria-current")).toBe("step");
    expect(document.activeElement).toBe(delivery);
    expect(
      (
        screen.getByLabelText(
          "Checkout or delivery method",
        ) as HTMLSelectElement
      ).value,
    ).toBe("native");
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("saves an applied blueprint through the normal private draft flow while preserving every other field", async () => {
    let sectionId = 0;
    vi.mocked(crypto.randomUUID).mockImplementation(
      () => `22222222-2222-4222-a222-${String(++sectionId).padStart(12, "0")}`,
    );
    const builder = emptyBuilder();
    builder.strategy.audience = "Independent consultants";
    builder.strategy.outcome = "Choose a useful next step";
    builder.strategy.evidence = "Private notes remain private";
    builder.strategy.adMessage = "Original campaign promise";
    builder.proofIds = ["11111111-1111-4111-a111-111111111111"];
    builder.presentation.landing = {
      ...builder.presentation.landing,
      headline: "Original invitation",
      ctaText: "Original page action",
      sections: [
        {
          ...newSection("proof"),
          body: "Original approved proof",
          proofId: builder.proofIds[0],
        },
      ],
    };
    builder.presentation.upsell.headline = "Existing upsell";
    builder.presentation.thankYou.body = "Existing thank-you";
    const initial = {
      ...row,
      checkout_mode: "external",
      external_url: "https://example.com/application?source=campaign",
      external_button_text: "Existing destination label",
      kind: "paid",
      amount_minor: 4900,
      body: "Original source description",
      is_affiliate: true,
      affiliate_disclosure: "Existing disclosure",
      cover_url: "https://example.com/original.webp",
      show_in_shop: true,
      shop_category: "training",
      presentation: builder.presentation,
    };
    const expectedOffer = draftPayload(toForm(initial as Offer)).values;
    mock.load.mockResolvedValue({
      draft: {
        document: { offer: expectedOffer, builder },
        version: 3,
        base_offer_updated_at: initial.updated_at,
      },
      history: [],
    });
    existing(initial);
    await loaded();
    navigateStep("Strategy");
    openBlueprint();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.change(
      screen.getByLabelText("Page to build from this blueprint"),
      { target: { value: "membership" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Use this page layout" }),
    );
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
    expect(mock.save).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("Presentation") as HTMLSelectElement).value,
    ).toBe("landing");
    expect(
      (screen.getByLabelText("Page headline") as HTMLTextAreaElement).value,
    ).toBe(initial.title);
    const pages = within(
      screen.getByRole("navigation", { name: "Offer builder steps" }),
    ).getByRole("button", { name: /Pages/ });
    expect(document.activeElement).toBe(pages);
    expect(
      screen.getByText(
        /Membership alternative page layout added to your working copy/,
      ),
    ).toBeTruthy();
    draft();
    await screen.findByText(/Draft saved privately/);
    const input = mock.save.mock.calls[0][0] as OfferBuilderSaveInput;
    expect(input.publish).toBe(false);
    expect(input.expectedDraftVersion).toBe(3);
    expect(input.document.offer).toEqual(expectedOffer);
    expect(input.document.builder.strategy).toEqual(builder.strategy);
    expect(input.document.builder.proofIds).toEqual(builder.proofIds);
    expect(input.document.builder.presentation.upsell).toEqual(
      builder.presentation.upsell,
    );
    expect(input.document.builder.presentation.thankYou).toEqual(
      builder.presentation.thankYou,
    );
    expect(input.document.builder.presentation.landing).not.toEqual(
      builder.presentation.landing,
    );
    expect(input.document.builder.presentation.landing.ctaText).not.toBe(
      "Original page action",
    );
  });
  it("keeps the original landing page when blueprint replacement is cancelled", async () => {
    const builder = emptyBuilder();
    builder.presentation.landing.headline = "Keep this landing page";
    existing({
      ...row,
      checkout_mode: "external",
      external_url: "https://example.com/application",
      presentation: builder.presentation,
    });
    await loaded();
    navigateStep("Strategy");
    openBlueprint();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Use this page layout" }),
    );
    confirm.mockRestore();
    expect(screen.getByTestId("preview").textContent).toBe(
      "Keep this landing page",
    );
    expect(mock.save).not.toHaveBeenCalled();
    draft();
    await screen.findByText(/Draft saved privately/);
    expect(
      mock.save.mock.calls[0][0].document.builder.presentation.landing,
    ).toEqual(builder.presentation.landing);
  });
  it("saves a blueprint with no provider URL privately and still prevents publishing", async () => {
    let sectionId = 0;
    vi.mocked(crypto.randomUUID).mockImplementation(
      () => `22222222-2222-4222-a222-${String(++sectionId).padStart(12, "0")}`,
    );
    existing({ ...row, checkout_mode: "external", external_url: null });
    await loaded();
    navigateStep("Strategy");
    openBlueprint();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Use this page layout" }),
    );
    confirm.mockRestore();
    expect(
      screen.getByText(
        /Before publishing, connect the destination in Delivery to/,
      ),
    ).toBeTruthy();
    draft();
    await screen.findByText(/Draft saved privately/);
    expect(mock.save.mock.calls[0][0].publish).toBe(false);
    expect(mock.save.mock.calls[0][0].document.offer.external_url).toBeNull();
    publish();
    expect(screen.getByRole("alert").textContent).toContain(
      "valid HTTPS destination URL",
    );
    expect(mock.save).toHaveBeenCalledOnce();
  });
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
    navigateStep("Order bump, upsell & downsell");
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
  it("includes unsaved evidence in navigation protection and refuses to navigate after saving the offer alone", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mount();
    fireEvent.change(screen.getByLabelText("Evidence title"), {
      target: { value: "A draft quote" },
    });
    const guard = mock.blocker.mock.lastCall![0];
    expect(guard.shouldBlockFn()).toBe(true);
    expect(guard.enableBeforeUnload()).toBe(true);
    draft();
    expect(screen.getByText(/Evidence is saved separately/)).toBeTruthy();
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("releases the editor after a stalled upload and ignores its late completion", async () => {
    let finish: (value: { error: null }) => void = () => {};
    mock.upload.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    mount();
    navigateStep("Delivery");
    vi.useFakeTimers();
    try {
      fireEvent.change(screen.getByLabelText(/Upload the resource/), {
        target: {
          files: [new File(["pdf"], "late.pdf", { type: "application/pdf" })],
        },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(61000);
      });
      expect(screen.getByText(/upload.*timed out/i)).toBeTruthy();
      expect(
        screen
          .getByRole("button", { name: "Save draft" })
          .hasAttribute("disabled"),
      ).toBe(false);
      const guard = mock.blocker.mock.lastCall![0];
      expect(guard.shouldBlockFn()).toBe(false);
      await act(async () => {
        finish({ error: null });
      });
      expect(screen.queryByText(/File uploaded privately/)).toBeNull();
      expect(mock.upload).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
  it("lets the owner cancel waiting for an upload without accepting a late file", async () => {
    let finish: (value: { error: null }) => void = () => {};
    mock.upload.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    mount();
    navigateStep("Delivery");
    fireEvent.change(screen.getByLabelText(/Upload the resource/), {
      target: {
        files: [new File(["pdf"], "late.pdf", { type: "application/pdf" })],
      },
    });
    const cancel = screen.getByRole("button", { name: "Cancel upload" });
    expect(cancel.matches(":disabled")).toBe(false);
    expect(
      screen.getByLabelText(/Upload the resource/).matches(":disabled"),
    ).toBe(true);
    fireEvent.click(cancel);
    await screen.findByText(/may still finish in storage/);
    await act(async () => {
      finish({ error: null });
    });
    expect(screen.queryByText(/File uploaded privately/)).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Save draft" })
        .hasAttribute("disabled"),
    ).toBe(false);
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
    fireEvent.click(
      screen.getByRole("button", { name: "Restore this revision" }),
    );
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
  it("edits the effective external CTA from Delivery and preserves it in the saved page", async () => {
    const builder = emptyBuilder();
    builder.presentation.landing.ctaText = "Original page action";
    existing({
      ...row,
      checkout_mode: "external",
      external_url: "https://provider.example/offer",
      external_button_text: "Old fallback",
      presentation: builder.presentation,
    });
    await loaded();
    navigateStep("Delivery");
    expect(
      (screen.getByLabelText(/Button label/) as HTMLInputElement).value,
    ).toBe("Original page action");
    edit(/Button label/, "See the program");
    navigateStep("Pages");
    expect(
      (screen.getByLabelText("Primary button text") as HTMLTextAreaElement)
        .value,
    ).toBe("See the program");
    draft();
    await screen.findByText(/Draft saved privately/);
    const saved = mock.save.mock.calls[0][0].document;
    expect(saved.builder.presentation.landing.ctaText).toBe("See the program");
    expect(saved.offer.external_button_text).toBe("See the program");
  });
  it("does not revive a stale fallback after the page button is explicitly cleared", async () => {
    const builder = emptyBuilder();
    builder.presentation.landing.ctaText = "Original page action";
    existing({
      ...row,
      checkout_mode: "external",
      external_url: "https://provider.example/offer",
      external_button_text: "Stale fallback",
      presentation: builder.presentation,
    });
    await loaded();
    navigateStep("Pages");
    edit("Primary button text", "");
    navigateStep("Delivery");
    expect(
      (screen.getByLabelText(/Button label/) as HTMLInputElement).value,
    ).toBe("");
    draft();
    await screen.findByText(/Draft saved privately/);
    const saved = mock.save.mock.calls[0][0].document;
    expect(saved.builder.presentation.landing.ctaText).toBe("");
    expect(saved.offer.external_button_text).toBe("");
  });
  it("edits the landing presentation after switching an old thank-you page to external delivery", async () => {
    existing();
    await loaded();
    edit("Presentation", "thank-you");
    edit("Thank-you headline", "Old native confirmation");
    navigateStep("Delivery");
    edit("Checkout or delivery method", "external");
    navigateStep("Pages");
    expect(
      screen.queryByRole("option", { name: "Thank-you & first step" }),
    ).toBeNull();
    expect(screen.queryByLabelText("Thank-you headline")).toBeNull();
    edit("Page headline", "The external offer");
    draft();
    await screen.findByText(/Draft saved privately/);
    const pages = mock.save.mock.calls[0][0].document.builder.presentation;
    expect(pages.landing.headline).toBe("The external offer");
    expect(pages.thankYou.headline).toBe("Old native confirmation");
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

const publishedRow = {
  ...row,
  status: "published",
  kind: "paid",
  amount_minor: 1900,
  asset_path: `${row.id}/v1.pdf`,
  asset_name: "Guide.pdf",
};
function alertText() {
  return screen.getByRole("alert").textContent || "";
}

describe("offer builder defect regressions", () => {
  it("never submits or saves the offer when Enter is pressed in a single-line field", async () => {
    existing();
    await loaded();
    expect(document.querySelector("form")).toBeNull();
    for (const label of ["Title", /Page URL slug/, /Cover image URL/]) {
      const input = screen.getByLabelText(label);
      fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    }
    navigateStep("Strategy");
    const evidence = screen.getByLabelText("Evidence title");
    expect(evidence.closest("form")).toBeNull();
    fireEvent.keyDown(evidence, { key: "Enter", code: "Enter" });
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("saves an unfinished draft leniently but lists every publish problem with a link to its step", async () => {
    existing();
    await loaded();
    edit(/Page URL slug/, "Not Final Yet");
    edit(/Cover image URL/, "http://images.example.com/cover.png");
    draft();
    await screen.findByText(/Draft saved privately/);
    expect(mock.save.mock.calls[0][0].document.offer).toEqual(
      expect.objectContaining({
        slug: "Not Final Yet",
        cover_url: "http://images.example.com/cover.png",
        status: "draft",
      }),
    );
    navigateStep("Review");
    fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Page URL slug:");
    expect(alert.textContent).toContain("Cover image URL:");
    expect(alert.textContent).toContain("Download file:");
    expect(mock.save).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(alert).getAllByRole("button", { name: /Go to Delivery/ })[0],
    );
    expect(
      screen
        .getByRole("button", { name: /Delivery/, current: "step" })
        .getAttribute("aria-current"),
    ).toBe("step");
  });
  it("blocks a draft only for values that cannot be stored, and names the field", async () => {
    existing();
    await loaded();
    navigateStep("Delivery");
    edit("Offer type", "paid");
    edit("Price", "nineteen");
    draft();
    expect(alertText()).toContain("Price:");
    expect(
      within(screen.getByRole("alert")).getByRole("button", {
        name: /Go to Delivery/,
      }),
    ).toBeTruthy();
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("confirms publishing with the price, URL and file changes compared with the live offer", async () => {
    existing(publishedRow);
    await loaded();
    edit(/Page URL slug/, "better-guide");
    navigateStep("Delivery");
    edit("Price", "29");
    navigateStep("Review");
    fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("/offers/useful-guide");
    expect(dialog.textContent).toContain("/offers/better-guide");
    expect(dialog.textContent).toContain("USD 19.00");
    expect(dialog.textContent).toContain("USD 29.00");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mock.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));
    await screen.findByText(/Offer published/);
    expect(mock.save.mock.calls[0][0].publish).toBe(true);
  });
  it("warns before publishing an archived offer back to visitors", async () => {
    existing({ ...publishedRow, status: "archived" });
    await loaded();
    navigateStep("Review");
    fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("This offer is archived");
    expect(dialog.textContent).toMatch(/Archived\s*→\s*Published/);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Publish archived offer" }),
    );
    await screen.findByText(/Offer published/);
  });
  it("shows the old price, URL, file and follow-up before restoring a revision", async () => {
    const document: OfferBuilderDocument = {
      offer: {
        slug: "old-guide",
        kind: "paid",
        amount_minor: 900,
        asset_path: `${row.id}/v0.pdf`,
        asset_name: "Old guide.pdf",
      },
      builder: emptyBuilder(),
    };
    mock.load.mockResolvedValue({
      draft: null,
      history: [
        {
          id: "old",
          document,
          version: 1,
          published: true,
          created_at: row.created_at,
        },
      ],
    });
    existing(publishedRow);
    await loaded();
    navigateStep("Review");
    fireEvent.click(screen.getByRole("button", { name: "Restore revision 1" }));
    const dialog = screen.getByRole("alertdialog");
    for (const text of [
      "/offers/old-guide",
      "USD 9.00",
      "Old guide.pdf",
      "Page URL",
      "Price",
      "Download file",
    ])
      expect(dialog.textContent).toContain(text);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(
      (screen.getByLabelText(/Page URL slug/) as HTMLInputElement).value,
    ).toBe("useful-guide");
    fireEvent.click(screen.getByRole("button", { name: "Restore revision 1" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Restore this revision" }),
    );
    expect(
      (screen.getByLabelText(/Page URL slug/) as HTMLInputElement).value,
    ).toBe("old-guide");
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("opens the created offer with the local copy when a lost first save returns 40001", async () => {
    mount();
    navigateStep("Pages");
    edit("Title", "First try");
    draft();
    await screen.findByText("Network unavailable");
    edit("Title", "Edited after the lost response");
    mock.save.mockRejectedValue({
      code: "40001",
      message: "Offer changed elsewhere. Reload before saving.",
    });
    mock.read.mockResolvedValue({ data: { id: row.id }, error: null });
    draft();
    await waitFor(() =>
      expect(mock.navigate).toHaveBeenCalledWith(
        `/admin/offers/${row.id}/edit`,
        { replace: true },
      ),
    );
    expect(mock.read.mock.calls.at(-1)?.[0]).toContainEqual(["id", row.id]);
    cleanup();
    existing();
    await loaded();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Edited after the lost response",
    );
    expect(screen.getByText(/confirmation was lost/)).toBeTruthy();
    expect(screen.getByText("You have unsaved changes.")).toBeTruthy();
    draft();
    await screen.findByText(/Draft saved privately/);
    expect(mock.save.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({
        offerId: row.id,
        expectedOfferUpdatedAt: row.updated_at,
      }),
    );
  });
  it("explains a 40001 for a new offer when no row was created", async () => {
    mount();
    mock.save.mockRejectedValue({
      code: "40001",
      message: "Offer changed elsewhere. Reload before saving.",
    });
    draft();
    await waitFor(() => expect(alertText()).toMatch(/changed in another tab/));
    expect(mock.navigate).not.toHaveBeenCalled();
  });
  it("keeps the notice and step after the first save of a new offer", async () => {
    saveUsing();
    mount();
    navigateStep("Delivery");
    draft();
    await waitFor(() => expect(mock.navigate).toHaveBeenCalled());
    cleanup();
    existing();
    await loaded();
    expect(screen.getByText(/Draft saved privately/)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /Delivery/, current: "step" })
        .getAttribute("aria-current"),
    ).toBe("step");
  });
  it("names a duplicate URL and links to the page step", async () => {
    existing(publishedRow);
    await loaded();
    mock.save.mockRejectedValue({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "offers_slug_key"',
    });
    publish();
    await waitFor(() =>
      expect(alertText()).toContain(
        "That URL is already used by another offer",
      ),
    );
    expect(alertText()).not.toContain("duplicate key");
    expect(
      within(screen.getByRole("alert")).getByRole("button", {
        name: /Go to Pages/,
      }),
    ).toBeTruthy();
  });
  it("marks unpublished draft changes in the header until they are published", async () => {
    mock.load.mockResolvedValue({
      draft: {
        document: { offer: {}, builder: emptyBuilder() },
        version: 3,
        updated_at: row.updated_at,
        base_offer_updated_at: row.updated_at,
      },
      history: [
        {
          id: "r3",
          document: { offer: {}, builder: emptyBuilder() },
          version: 3,
          published: false,
          created_at: row.created_at,
        },
      ],
    });
    existing(publishedRow);
    await loaded();
    expect(screen.getByText("Draft changes not published")).toBeTruthy();
    publish();
    await screen.findByText(/Offer published/);
    expect(screen.queryByText("Draft changes not published")).toBeNull();
  });
  it("unpublishes from the Review step through a confirmed, version-checked status update", async () => {
    existing(publishedRow);
    await loaded();
    mock.write.mockResolvedValue({
      data: { id: row.id, status: "draft", updated_at: "2026-09-20T00:00:00Z" },
      error: null,
    });
    navigateStep("Review");
    expect(
      screen.queryByText(/Archiving is available from All offers/),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Unpublish: Useful guide" }),
    );
    expect(screen.getByRole("alertdialog").textContent).toContain(
      "Unpublish this offer?",
    );
    fireEvent.click(screen.getByRole("button", { name: "Unpublish offer" }));
    await screen.findByText(/Offer unpublished/);
    expect(mock.write).toHaveBeenCalledWith({ status: "draft" }, [
      ["id", row.id],
      ["updated_at", row.updated_at],
    ]);
    expect(
      screen.getByText(/Draft · private, not visible to visitors/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Archive: Useful guide" }),
    ).toBeTruthy();
    draft();
    await screen.findByText(/Draft saved privately/);
    expect(mock.save.mock.calls[0][0].expectedOfferUpdatedAt).toBe(
      "2026-09-20T00:00:00Z",
    );
  });
  it("does not flag a draft as stale when only the status changed since it was saved", async () => {
    const liveNow = {
      ...publishedRow,
      status: "archived",
      updated_at: "2026-09-21T00:00:00Z",
    };
    mock.load.mockResolvedValue({
      draft: {
        document: { offer: { title: "Draft title" }, builder: emptyBuilder() },
        version: 2,
        updated_at: row.updated_at,
        base_offer_updated_at: row.updated_at,
        base_offer: { ...publishedRow },
      },
      history: [],
    });
    existing(liveNow);
    await loaded();
    expect(screen.queryByText(/This draft was started before/)).toBeNull();
    cleanup();
    mock.load.mockResolvedValue({
      draft: {
        document: { offer: { title: "Draft title" }, builder: emptyBuilder() },
        version: 2,
        updated_at: row.updated_at,
        base_offer_updated_at: row.updated_at,
        base_offer: { ...publishedRow, amount_minor: 900 },
      },
      history: [],
    });
    existing(liveNow);
    await loaded();
    expect(screen.getByText(/This draft was started before/)).toBeTruthy();
  });
  it("says free downloads also send an access email", async () => {
    existing();
    await loaded();
    navigateStep("Delivery");
    expect(screen.getByText(/including free downloads/).textContent).toMatch(
      /email with a private access link/,
    );
  });
  it("opens and focuses a newly added section", async () => {
    const builder = emptyBuilder();
    builder.presentation.landing.sections = [
      { ...newSection("benefits"), id: "first", heading: "First" },
    ];
    mock.load.mockResolvedValue({
      draft: {
        document: { offer: {}, builder },
        version: 1,
        updated_at: row.updated_at,
        base_offer_updated_at: row.updated_at,
      },
      history: [],
    });
    existing();
    await loaded();
    edit("New section type", "faq");
    fireEvent.click(screen.getByRole("button", { name: /Add section/ }));
    const added = screen
      .getByText("2. Questions & objections")
      .closest("details")!;
    expect(added.open).toBe(true);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(added).getByLabelText("Section heading"),
      ),
    );
  });
});

describe("lost first-save recovery failures", () => {
  it("keeps the edits and says so when the created offer cannot be checked", async () => {
    mount();
    mock.save.mockRejectedValue({
      code: "40001",
      message: "Offer changed elsewhere. Reload before saving.",
    });
    mock.read.mockResolvedValue({
      data: null,
      error: { message: "Network unavailable" },
    });
    navigateStep("Pages");
    edit("Title", "Keep me");
    draft();
    await waitFor(() =>
      expect(alertText()).toMatch(/couldn't check whether your first save/),
    );
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Keep me",
    );
    expect(mock.navigate).not.toHaveBeenCalled();
  });
});
