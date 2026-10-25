// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyBuilder,
  newSection,
  type OfferRecipeContext,
} from "@/lib/offerBuilder";
import OfferDraftStarter from "./OfferDraftStarter";

const context: OfferRecipeContext = {
  strategy: {
    ...emptyBuilder().strategy,
    outcome: "My useful result",
    mechanism: "- First step\n- Second step",
    deliverables: "- Actual workbook\n- Actual checklist",
    evidence: "PRIVATE SOURCE",
    objections: "PRIVATE OBJECTION",
    adMessage: "PRIVATE AD",
  },
  offer: { title: "My offer", summary: "A genuine resource", kind: "paid" },
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount(
  overrides: Partial<
    Omit<
      React.ComponentProps<typeof OfferDraftStarter>,
      "onApply" | "onEditBrief"
    >
  > = {},
) {
  const props = {
    value: emptyBuilder(),
    context,
    onApply: vi.fn(),
    onEditBrief: vi.fn(),
    ...overrides,
  };
  return { ...render(<OfferDraftStarter {...props} />), props };
}
const preview = () =>
  fireEvent.click(
    screen.getByRole("button", { name: "Preview my first draft" }),
  );

describe("first-draft starter", () => {
  it("defaults to the current follow-up page and resets the suggested selection when the editor stage changes", () => {
    const { props, rerender } = mount({ initialStage: "upsell" });
    expect(
      (screen.getByLabelText("Landing page") as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (screen.getByLabelText(/Follow-up presentation/) as HTMLInputElement)
        .checked,
    ).toBe(true);
    preview();
    expect(screen.queryByText("Landing page preview")).toBeNull();
    rerender(<OfferDraftStarter {...props} initialStage="landing" />);
    expect(
      (screen.getByLabelText("Landing page") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText(/Follow-up presentation/) as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(
      (
        screen.getByRole("button", {
          name: "Apply draft to selected pages",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("previews real proposed copy without mutating the parent, then applies only after review", () => {
    const { props } = mount();
    preview();
    expect(props.onApply).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "My useful result" }),
    ).toBeTruthy();
    expect(screen.getByText("First step")).toBeTruthy();
    expect(screen.getByText("Actual workbook")).toBeTruthy();
    expect(screen.queryByText(/PRIVATE/)).toBeNull();
    expect(
      screen
        .getAllByRole("button", { name: "Continue to checkout" })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Apply draft to selected pages" }),
    );
    expect(props.onApply).toHaveBeenCalledOnce();
    expect(props.onApply.mock.calls[0][0].presentation.upsell).toEqual(
      emptyBuilder().presentation.upsell,
    );
  });

  it("allows choosing only the follow-up presentation and keeps existing edits", () => {
    const value = emptyBuilder();
    value.presentation.upsell.headline = "My edited pitch";
    value.presentation.upsell.sections = [
      { ...newSection("proof"), body: "Exact quotation", caption: "Author" },
    ];
    const { props } = mount({ value });
    fireEvent.click(screen.getByLabelText("Landing page"));
    fireEvent.click(screen.getByLabelText(/Follow-up presentation/));
    preview();
    expect(screen.queryByText("Landing page preview")).toBeNull();
    expect(
      screen.getByRole("heading", { name: "My edited pitch" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Apply draft to selected pages" }),
    );
    const result = props.onApply.mock.calls[0][0];
    expect(result.presentation.landing).toEqual(value.presentation.landing);
    expect(result.presentation.upsell.sections[0]).toEqual(
      value.presentation.upsell.sections[0],
    );
  });

  it("blocks stale proposals and refreshes from newer edits", () => {
    const { props, rerender } = mount();
    preview();
    const edited = emptyBuilder();
    edited.presentation.landing.headline = "A newer manual edit";
    rerender(<OfferDraftStarter {...props} value={edited} />);
    const apply = screen.getByRole("button", {
      name: "Apply draft to selected pages",
    }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(props.onApply).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh draft preview" }),
    );
    expect(
      screen.getByRole("heading", { name: "A newer manual edit" }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Apply draft to selected pages" }),
    );
    expect(props.onApply.mock.calls[0][0].presentation.landing.headline).toBe(
      "A newer manual edit",
    );
  });

  it("requires supplied facts, opens the brief and limits external offers to their landing page", () => {
    const { props } = mount({
      context: {
        strategy: emptyBuilder().strategy,
        offer: {
          title: "",
          summary: "",
          kind: "paid",
          checkout_mode: "external",
        },
      },
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Preview my first draft",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.queryByLabelText(/Follow-up presentation/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit my brief" }));
    expect(props.onEditBrief).toHaveBeenCalledOnce();
  });
});
