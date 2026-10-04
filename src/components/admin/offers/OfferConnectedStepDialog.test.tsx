// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  saveOfferBuilder,
  type OfferBuilderSaveInput,
  type OfferBuilderSaveResult,
} from "@/lib/offerBuilderClient";
import OfferConnectedStepDialog from "./OfferConnectedStepDialog";

vi.mock("@/lib/offerBuilderClient", () => ({ saveOfferBuilder: vi.fn() }));
const save = vi.mocked(saveOfferBuilder);
const result = (input: OfferBuilderSaveInput): OfferBuilderSaveResult => ({
  offer: {
    id: input.offerId,
    title: "Shell",
    currency: "usd",
    kind: "free",
    status: "draft",
  } as OfferBuilderSaveResult["offer"],
  draft: {
    offer_id: input.offerId,
    version: 1,
    updated_at: "now",
    base_offer_updated_at: "now",
    document: input.document,
  },
  published: false,
  revision_id: "revision-id",
});
function mount(
  overrides: Partial<
    React.ComponentProps<typeof OfferConnectedStepDialog>
  > = {},
) {
  const props = {
    relation: "upsell" as const,
    parentCurrency: "gbp",
    parentTitle: "The original guide",
    onCreated: vi.fn(),
    onClose: vi.fn(),
    onProtectionChange: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<OfferConnectedStepDialog {...props} />) };
}
function fill() {
  fireEvent.change(screen.getByLabelText("Offer name"), {
    target: { value: "Build workbook" },
  });
  fireEvent.change(screen.getByLabelText("What will this help them do?"), {
    target: { value: "Plan a useful first build." },
  });
  fireEvent.change(screen.getByLabelText("Price (GBP)"), {
    target: { value: "19" },
  });
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  save.mockReset();
});

describe("create and attach a connected offer", () => {
  it("saves a private draft and delivers the actual result exactly once", async () => {
    let resolve!: (value: OfferBuilderSaveResult) => void;
    save.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { props } = mount();
    fill();
    const button = screen.getByRole("button", {
      name: "Create draft & attach",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(save).toHaveBeenCalledTimes(1);
    const input = save.mock.calls[0][0];
    expect(input).toMatchObject({
      expectedOfferUpdatedAt: null,
      expectedDraftVersion: null,
      publish: false,
      document: {
        offer: {
          kind: "paid",
          currency: "gbp",
          status: "draft",
          funnel_only: true,
          show_in_shop: false,
        },
      },
    });
    expect(props.onProtectionChange).toHaveBeenLastCalledWith({
      dirty: true,
      busy: true,
      pending: true,
    });
    expect(
      (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();
    const saved = result(input);
    await act(async () => resolve(saved));
    expect(props.onCreated).toHaveBeenCalledExactlyOnceWith(saved);
    expect(props.onProtectionChange).toHaveBeenLastCalledWith({
      busy: false,
      pending: false,
      dirty: false,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create draft & attach" }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("locks edits and retries the exact same input after a lost response", async () => {
    save.mockRejectedValueOnce(new Error("Lost response"));
    save.mockImplementationOnce(async (input) => result(input));
    const { props, rerender } = mount();
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Create draft & attach" }),
    );
    await screen.findByText(
      /We could not confirm whether the draft was created/,
    );
    const first = save.mock.calls[0][0];
    fireEvent.change(screen.getByLabelText("Offer name"), {
      target: { value: "Attempted new content" },
    });
    expect(
      (screen.getByLabelText("Offer name") as HTMLInputElement).value,
    ).toBe("Build workbook");
    rerender(<OfferConnectedStepDialog {...props} parentCurrency="usd" />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry the same save" }),
    );
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[1][0]).toBe(first);
    expect(save.mock.calls[1][0].document.offer.currency).toBe("gbp");
  });

  it("unlocks after a definite rejected save while keeping entered details", async () => {
    save.mockRejectedValueOnce({ code: "22023", message: "Invalid document" });
    save.mockImplementationOnce(async (input) => result(input));
    const { props } = mount();
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Create draft & attach" }),
    );
    await screen.findByText(/The draft was not created/);
    expect(
      (screen.getByLabelText("Offer name") as HTMLInputElement).value,
    ).toBe("Build workbook");
    expect(props.onProtectionChange).toHaveBeenLastCalledWith({
      busy: false,
      pending: false,
      dirty: true,
    });
    fireEvent.change(screen.getByLabelText("Offer name"), {
      target: { value: "Updated workbook" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create draft & attach" }),
    );
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[1][0].requestId).not.toBe(
      save.mock.calls[0][0].requestId,
    );
    expect(save.mock.calls[1][0].document.offer.title).toBe("Updated workbook");
  });

  it("supports free downsells without a price and prevents a free bump", async () => {
    save.mockImplementation(async (input) => result(input));
    const { props, unmount } = mount({ relation: "downsell" });
    fill();
    fireEvent.change(screen.getByLabelText("Offer type"), {
      target: { value: "free" },
    });
    expect(screen.queryByLabelText("Price (GBP)")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Create draft & attach" }),
    );
    await waitFor(() => expect(props.onCreated).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].document.offer).toMatchObject({
      kind: "free",
      amount_minor: 0,
    });
    unmount();
    mount({ relation: "bump" });
    expect(screen.queryByLabelText("Offer type")).toBeNull();
    expect(screen.getByLabelText("Price (GBP)")).toBeTruthy();
  });

  it("asks before dropping entered details and leaves invalid prices unsaved", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { props } = mount();
    fill();
    fireEvent.change(screen.getByLabelText("Price (GBP)"), {
      target: { value: "2.999" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create draft & attach" }),
    );
    expect(screen.getByRole("alert").textContent).toMatch(/decimal/);
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(props.onClose).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });
});
