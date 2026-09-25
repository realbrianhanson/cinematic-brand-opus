// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OfferCopyAssistant from "@/components/admin/offers/OfferCopyAssistant";
import OfferProofLibrary from "@/components/admin/offers/OfferProofLibrary";
import { emptyBuilder, newSection, type OfferProof } from "../offerBuilder";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listOfferProof: vi.fn(),
  saveOfferProof: vi.fn(),
  deleteOfferProof: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/offerBuilderClient", () => ({
  listOfferProof: mocks.listOfferProof,
  saveOfferProof: mocks.saveOfferProof,
  deleteOfferProof: mocks.deleteOfferProof,
}));
const product = {
  id: "real-editor-preview",
  slug: "guide",
  status: "draft",
  checkout_mode: "native" as const,
  title: "Guide",
  summary: "Useful templates",
  body: "",
  kind: "free" as const,
  amount_minor: 0,
  currency: "usd",
};
const output = {
  suggestions: [
    {
      target: "headline",
      title: "Make it concrete",
      headline: "Turn the next task into a clear plan",
      subheadline: "Practical templates",
      explanation: "Focuses the outcome.",
      evidenceIds: [],
      missingFacts: [],
    },
  ],
  warnings: [],
};
const approved: OfferProof = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Helpful guide",
  kind: "testimonial",
  content: "This helped me get organized.",
  attribution: "Alex",
  source_url: "https://example.com/private-record",
  notes: "Private permission notes",
  approved: true,
  created_at: "2026-09-23",
  updated_at: "2026-09-23",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: "admin-token" } },
    error: null,
  });
  mocks.listOfferProof.mockResolvedValue([]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(output)),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("copy assistant user control", () => {
  it("sends the working page and saved offer identity without trusting preview-only parent facts", async () => {
    const builder = emptyBuilder();
    builder.presentation.upsell.ctaText = "Add the implementation guide";
    builder.presentation.upsell.sections = [
      { ...newSection("faq"), body: "Your previous download is still yours." },
      { ...newSection("guarantee"), body: "Our exact existing terms." },
    ];
    const savedOfferId = "11111111-1111-4111-8111-111111111111";
    render(
      <OfferCopyAssistant
        builder={builder}
        offer={product}
        savedOfferId={savedOfferId}
        stage="upsell"
        onApply={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestions" }),
    );
    await screen.findByText(output.suggestions[0].headline);
    const request = JSON.parse(
      vi.mocked(fetch).mock.calls[0][1]!.body as string,
    );
    expect(request.savedOfferId).toBe(savedOfferId);
    expect(request.currentCopy.page.ctaText).toBe(
      "Add the implementation guide",
    );
    expect(
      request.currentCopy.page.sections.map(
        (section: { body: string }) => section.body,
      ),
    ).toEqual([
      "Your previous download is still yours.",
      "Our exact existing terms.",
    ]);
    expect(request.parents).toBeUndefined();
  });
  it("makes no generation call on mount and requires an explicit apply after generation", async () => {
    const apply = vi.fn();
    render(
      <OfferCopyAssistant
        builder={emptyBuilder()}
        offer={product}
        stage="landing"
        onApply={apply}
      />,
    );
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestions" }),
    );
    await screen.findByText(output.suggestions[0].headline);
    expect(fetch).toHaveBeenCalledOnce();
    const request = JSON.parse(
      vi.mocked(fetch).mock.calls[0][1]!.body as string,
    );
    expect(Object.keys(request.offer).sort()).toEqual(
      [
        "title",
        "summary",
        "body",
        "kind",
        "amount_minor",
        "currency",
        "checkout_mode",
        "price_display_mode",
      ].sort(),
    );
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Apply this suggestion" }),
    );
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ headline: output.suggestions[0].headline }),
      "landing",
    );
    expect(apply).toHaveBeenCalledOnce();
    expect(
      screen
        .getByRole("button", { name: "Apply this suggestion" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("cannot apply a generated suggestion after the working page or stage changes", async () => {
    const apply = vi.fn();
    const builder = emptyBuilder();
    const view = render(
      <OfferCopyAssistant
        builder={builder}
        offer={product}
        stage="landing"
        onApply={apply}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestions" }),
    );
    await screen.findByText(output.suggestions[0].headline);
    view.rerender(
      <OfferCopyAssistant
        builder={builder}
        offer={product}
        stage="upsell"
        onApply={apply}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "Apply this suggestion" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });
  it("preserves the working page when a provider fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Temporarily unavailable" }, { status: 503 }),
      ),
    );
    const apply = vi.fn();
    render(
      <OfferCopyAssistant
        builder={emptyBuilder()}
        offer={product}
        stage="landing"
        onApply={apply}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestions" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Temporarily unavailable",
    );
    expect(apply).not.toHaveBeenCalled();
  });
  it("lets the author cancel a pending session lookup without starting generation later", async () => {
    let resolveSession: (value: unknown) => void = () => {};
    mocks.getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSession = resolve;
        }),
    );
    const apply = vi.fn();
    render(
      <OfferCopyAssistant
        builder={emptyBuilder()}
        offer={product}
        stage="landing"
        onApply={apply}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Generate suggestions" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel generation" }));
    await act(async () => {
      resolveSession({
        data: { session: { access_token: "admin-token" } },
        error: null,
      });
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("button", { name: "Generate suggestions" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });
  it("releases the assistant after a stalled response and aborts the request without changing copy", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const apply = vi.fn();
    render(
      <OfferCopyAssistant
        builder={emptyBuilder()}
        offer={product}
        stage="landing"
        onApply={apply}
      />,
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Generate suggestions" }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40000);
    });
    expect(screen.getByRole("alert").textContent).toMatch(/timed out/i);
    expect(
      screen
        .getByRole("button", { name: "Generate suggestions" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("proof library", () => {
  it("keeps unapproved evidence out of AI selection and page insertion", async () => {
    mocks.listOfferProof.mockResolvedValue([{ ...approved, approved: false }]);
    const insert = vi.fn();
    render(
      <OfferProofLibrary
        selectedIds={[]}
        onChange={vi.fn()}
        onInsert={insert}
      />,
    );
    await screen.findByText(approved.title);
    expect(
      screen
        .getByRole("button", { name: "Insert into page" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByRole("checkbox").hasAttribute("disabled")).toBe(true);
    expect(insert).not.toHaveBeenCalled();
  });
  it("inserts approved wording explicitly, excluding private notes and source reference", async () => {
    mocks.listOfferProof.mockResolvedValue([approved]);
    const insert = vi.fn();
    render(
      <OfferProofLibrary
        selectedIds={[]}
        onChange={vi.fn()}
        onInsert={insert}
      />,
    );
    await screen.findByText(approved.title);
    expect(insert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Insert into page" }));
    expect(insert).toHaveBeenCalledWith({
      ...approved,
      notes: "",
      source_url: "",
    });
    expect(screen.queryByText(approved.notes)).toBeNull();
  });
  it("saves a new item unapproved until the owner explicitly checks approval", async () => {
    mocks.saveOfferProof.mockImplementation(async (input) => ({
      ...approved,
      ...input,
    }));
    render(
      <OfferProofLibrary
        selectedIds={[]}
        onChange={vi.fn()}
        onInsert={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByText("Loading evidence…")).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add evidence" }));
    fireEvent.change(screen.getByLabelText("Evidence title"), {
      target: { value: "Real demonstration" },
    });
    fireEvent.change(
      screen.getByLabelText("Exact quote or documented description"),
      { target: { value: "Shows the worksheet being completed." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save evidence" }));
    await waitFor(() => expect(mocks.saveOfferProof).toHaveBeenCalledOnce());
    expect(mocks.saveOfferProof).toHaveBeenCalledWith(
      expect.objectContaining({ approved: false }),
    );
  });
});
