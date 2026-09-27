// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { empty } from "../offerEditorState";
import OfferFunnelMap from "./OfferFunnelMap";

function mount(
  overrides: Partial<
    Omit<
      React.ComponentProps<typeof OfferFunnelMap>,
      "onGo" | "onCreate" | "onEdit"
    >
  > = {},
) {
  const props = {
    form: { ...empty, title: "Main workbook", kind: "paid" as const },
    choices: [],
    onGo: vi.fn(),
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<OfferFunnelMap {...props} />) };
}
afterEach(cleanup);

describe("editable funnel map", () => {
  it("opens editable landing, checkout and thank-you steps and creates missing offers", () => {
    const { props } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit landing page" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Edit delivery & price" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Edit thank-you page" }),
    );
    expect(props.onGo.mock.calls).toEqual([
      ["pages", "landing"],
      ["delivery"],
      ["pages", "thank-you"],
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Create order bump" }));
    fireEvent.click(screen.getByRole("button", { name: "Create upsell" }));
    expect(props.onCreate.mock.calls).toEqual([["bump"], ["upsell"]]);
    expect(
      (
        screen.getByRole("button", {
          name: "Create downsell",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("shows accurate draft status, fulfillment order and usable child actions", () => {
    const { props } = mount({
      form: { ...empty, nextOffer: "up", downsellOffer: "down" },
      choices: [
        { id: "up", title: "Upgrade", status: "draft" },
        {
          id: "down",
          title: "Alternative",
          status: "published",
          hasUnpublishedDraft: true,
        },
      ],
    });
    expect(screen.getByText("Draft · not published")).toBeTruthy();
    expect(screen.getByText("Published · newer draft")).toBeTruthy();
    expect(
      screen.getByText(
        /Give customers access to their original download before/,
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Save funnel & edit Upgrade" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save funnel & edit Alternative" }),
    );
    expect(props.onEdit.mock.calls).toEqual([
      ["upsell", "up"],
      ["downsell", "down"],
    ]);
  });

  it("can create a downsell once an upsell is attached and keeps free-offer paid extras visible", () => {
    const { props } = mount({
      form: { ...empty, nextOffer: "up" },
      choices: [{ id: "up", title: "Upgrade", status: "draft" }],
    });
    expect(screen.getByRole("heading", { name: "Email signup" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create order bump" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create downsell" }));
    expect(props.onCreate).toHaveBeenCalledWith("downsell");
  });

  it("shows only real provider-owned steps for external offers", () => {
    const { props } = mount({
      form: {
        ...empty,
        checkoutMode: "external",
        nextOffer: "stale",
        bumpOffer: "stale",
      },
    });
    expect(
      screen.getByRole("heading", { name: "Provider handoff" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Provider confirmation" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create upsell" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Edit thank-you page" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit destination" }));
    expect(props.onGo).toHaveBeenCalledWith("delivery");
  });

  it("does not let an unresolved child be edited and disables actions during a save", () => {
    const { rerender, props } = mount({
      form: { ...empty, nextOffer: "missing" },
    });
    expect(screen.getByText("Selected offer unavailable")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Save funnel & edit offer",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    rerender(<OfferFunnelMap {...props} disabled />);
    for (const button of screen.getAllByRole("button"))
      expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
