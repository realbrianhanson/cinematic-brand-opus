// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyBuilder,
  emptyPage,
  type OfferRecipeContext,
} from "@/lib/offerBuilder";
import OfferTemplatePicker from "./OfferTemplatePicker";

const context: OfferRecipeContext = {
  strategy: {
    ...emptyBuilder().strategy,
    outcome: "My actual benefit",
    deliverables: "- The actual guide",
  },
  offer: { title: "Actual offer", summary: "My description", kind: "paid" },
};
afterEach(() => cleanup());
function mount(
  overrides: Partial<
    Omit<React.ComponentProps<typeof OfferTemplatePicker>, "onApply">
  > = {},
) {
  const props = {
    value: emptyPage(),
    context,
    stage: "landing" as const,
    onApply: vi.fn(),
    ...overrides,
  };
  return { ...render(<OfferTemplatePicker {...props} />), props };
}

describe("visual template gallery", () => {
  it("renders three actual thumbnails and an interactive example without applying example copy", () => {
    const { props, container } = mount();
    expect(container.querySelectorAll(".offer-layout-thumbnail").length).toBe(
      3,
    );
    expect(container.querySelector(".offer-layout-thumbnail ol")).toBeTruthy();
    expect(container.querySelector(".offer-layout-thumbnail ul")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Preview The clear sales argument" }),
    );
    expect(screen.getByText(/Sample copy only/)).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Make a plan for your next launch" }),
    ).toBeTruthy();
    expect(
      container.querySelector(".offer-layout-full summary")?.textContent,
    ).toContain("What is included in this example?");
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it("reviews the actual proposed page before applying the chosen real layout", () => {
    const { props } = mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Use layout The relevant next step" }),
    );
    expect(props.onApply).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "My actual benefit" }),
    ).toBeTruthy();
    expect(screen.getByText("The actual guide")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Apply layout to this page" }),
    );
    expect(props.onApply).toHaveBeenCalledOnce();
    const [page, notice] = props.onApply.mock.calls[0];
    expect(
      page.sections.map((section: { type: string }) => section.type),
    ).toEqual(["deliverables", "benefits", "proof", "faq", "cta"]);
    expect(page.headline).toBe("My actual benefit");
    expect(JSON.stringify(page)).not.toContain("sample");
    expect(notice).toContain("landing page");
  });

  it("blocks applying a preview after the selected page changes and can refresh it", () => {
    const { props, rerender } = mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Use layout The useful first win" }),
    );
    rerender(
      <OfferTemplatePicker
        {...props}
        value={{ ...props.value, headline: "Keep my new title" }}
      />,
    );
    const apply = screen.getByRole("button", {
      name: "Apply layout to this page",
    }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(apply);
    expect(props.onApply).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh layout preview" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply layout to this page" }),
    );
    expect(props.onApply.mock.calls[0][0].headline).toBe("Keep my new title");
  });

  it("does not allow mutation while the editor is locked", () => {
    const { props, rerender } = mount();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Use layout The clear sales argument",
      }),
    );
    rerender(<OfferTemplatePicker {...props} disabled />);
    expect(
      (
        screen.getByRole("button", {
          name: "Apply layout to this page",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Apply layout to this page" }),
    );
    expect(props.onApply).not.toHaveBeenCalled();
  });
});
