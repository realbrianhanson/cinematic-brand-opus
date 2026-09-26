// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBuilder, emptyPage, newSection } from "@/lib/offerBuilder";
import {
  blueprintWorkbook,
  qualifiedCallBlueprint,
} from "@/lib/offerBlueprints";
import OfferBlueprintPicker from "./OfferBlueprintPicker";

const context = {
  strategy: {
    ...emptyBuilder().strategy,
    outcome: "Choose your next useful step",
  },
  offer: {
    title: "A practical conversation",
    summary: "Explore the fit",
    kind: "free" as const,
  },
};
function mount(
  overrides: Partial<
    Omit<
      React.ComponentProps<typeof OfferBlueprintPicker>,
      "onApply" | "onConfigureDelivery"
    >
  > = {},
) {
  const props = {
    value: emptyPage(),
    context,
    external: true,
    hasDestination: true,
    onApply: vi.fn(),
    onConfigureDelivery: vi.fn(),
    ...overrides,
  };
  return { ...render(<OfferBlueprintPicker {...props} />), props };
}
function apply() {
  fireEvent.click(screen.getByRole("button", { name: "Use this page layout" }));
}
function workbookDownload() {
  fireEvent.click(
    screen.getByRole("button", { name: "Download setup workbook" }),
  );
}
function downloads() {
  const createObjectURL = vi.fn((_blob: Blob) => "blob:setup-workbook");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }),
  );
  return { createObjectURL, revokeObjectURL };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("qualified call blueprint picker", () => {
  it("shows every page and provider stage with separate qualified-call and membership branches", () => {
    mount();
    for (const stage of qualifiedCallBlueprint.stages) {
      expect(screen.getByText(stage.title)).toBeTruthy();
    }
    expect(screen.getByText("Qualified call path")).toBeTruthy();
    expect(screen.getByText("Membership alternative")).toBeTruthy();
    expect(
      screen.getByText(
        /Build one page here; configure form branching, booking, reminders and recurring billing in your provider/,
      ),
    ).toBeTruthy();
  });

  it("blocks native fulfillment and opens Delivery without changing a page", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { props } = mount({ external: false });
    expect(
      (
        screen.getByRole("button", {
          name: "Use this page layout",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    apply();
    expect(props.onApply).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Configure external delivery" }),
    );
    expect(props.onConfigureDelivery).toHaveBeenCalledOnce();
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it("cancels replacement without touching any existing copy", () => {
    const value = {
      ...emptyPage(),
      headline: "Keep my promise",
      ctaText: "Keep my action",
      sections: [newSection("proof")],
    };
    const original = structuredClone(value);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { props } = mount({ value });
    apply();
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining(
        "Replace this offer's landing page copy and layout",
      ),
    );
    expect(props.onApply).not.toHaveBeenCalled();
    expect(value).toEqual(original);
  });

  it("replaces the whole selected page only after confirmation and leaves the old object intact", () => {
    const value = {
      ...emptyPage(),
      headline: "Old headline",
      ctaText: "Old button",
      eyebrow: "Old eyebrow",
      ctaMicrocopy: "Old microcopy",
      sections: [newSection("proof")],
    };
    const original = structuredClone(value);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { props } = mount({ value });
    fireEvent.change(
      screen.getByLabelText("Page to build from this blueprint"),
      { target: { value: "membership" } },
    );
    apply();
    const [page, notice] = props.onApply.mock.calls[0];
    expect(page.headline).toBe(context.offer.title);
    expect(page.ctaText).not.toBe("Old button");
    expect(page.ctaMicrocopy).not.toBe("Old microcopy");
    expect(
      page.sections.some(
        (section: { id: string }) => section.id === value.sections[0].id,
      ),
    ).toBe(false);
    expect(notice).toContain(
      "Membership alternative page layout added to your working copy",
    );
    expect(value).toEqual(original);
  });

  it("allows a private page draft without a destination and explains the required connection", () => {
    const confirm = vi.spyOn(window, "confirm");
    const { props } = mount({ hasDestination: false });
    expect(
      screen.getByText(
        /Before publishing, connect the destination in Delivery/,
      ),
    ).toBeTruthy();
    apply();
    expect(confirm).not.toHaveBeenCalled();
    expect(props.onApply).toHaveBeenCalledWith(
      expect.objectContaining({ headline: context.offer.title }),
      expect.stringContaining("connect the destination in Delivery"),
    );
  });

  it("downloads the full workbook and cleans up its temporary link and object URL", async () => {
    vi.useFakeTimers();
    const { createObjectURL, revokeObjectURL } = downloads();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe("qualified-call-membership-setup.md");
        expect(document.body.contains(this)).toBe(true);
      });
    mount();
    workbookDownload();
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/markdown;charset=utf-8");
    const reader = new FileReader();
    const content = new Promise<string>((resolve) => {
      reader.onload = () => resolve(String(reader.result));
    });
    reader.readAsText(blob);
    await vi.runAllTimersAsync();
    expect(await content).toBe(blueprintWorkbook());
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:setup-workbook");
    expect(screen.getByRole("status").textContent).toContain(
      "download requested",
    );
  });

  it("revokes a pending download when the picker unmounts", () => {
    vi.useFakeTimers();
    const { revokeObjectURL } = downloads();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { unmount } = mount();
    workbookDownload();
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("offers focused, selectable workbook text when downloads are unavailable", () => {
    vi.stubGlobal("URL", {
      createObjectURL: undefined,
      revokeObjectURL: undefined,
    });
    mount();
    workbookDownload();
    const text = screen.getByLabelText(
      "Setup workbook text",
    ) as HTMLTextAreaElement;
    expect(text.value).toBe(blueprintWorkbook());
    expect(text.readOnly).toBe(true);
    expect(document.activeElement).toBe(text);
    expect(text.selectionEnd).toBe(text.value.length);
    expect(screen.getByRole("status").textContent).toContain("Select and copy");
  });
});
