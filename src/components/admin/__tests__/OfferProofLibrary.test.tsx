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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfferProof } from "@/lib/offerBuilder";

const mock = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/offerBuilderClient", () => ({
  listOfferProof: () => mock.list(),
  saveOfferProof: (input: unknown) => mock.save(input),
  deleteOfferProof: (id: string) => mock.remove(id),
}));
import OfferProofLibrary from "../offers/OfferProofLibrary";

const proof = (id: string, title: string): OfferProof => ({
  id,
  title,
  kind: "testimonial",
  content: `${title} content`,
  attribution: "",
  source_url: "",
  notes: "",
  approved: true,
  created_at: "2026-09-19T00:00:00Z",
  updated_at: "2026-09-19T00:00:00Z",
});
const scrolls: unknown[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  scrolls.length = 0;
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolls.push(this);
  };
  mock.list.mockResolvedValue(
    Array.from({ length: 12 }, (_, index) =>
      proof(`0000000${index}-0000-4000-a000-000000000000`, `Item ${index}`),
    ),
  );
  mock.save.mockImplementation(async (input: Record<string, unknown>) => ({
    ...proof("10000000-0000-4000-a000-000000000000", String(input.title)),
    ...input,
  }));
});
afterEach(cleanup);

function renderInsideOfferForm() {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(
    <form onSubmit={submit}>
      <OfferProofLibrary
        selectedIds={[]}
        onChange={vi.fn()}
        onInsert={vi.fn()}
      />
    </form>,
  );
  return submit;
}

describe("proof library editing", () => {
  it("locks a new evidence save synchronously so a rapid repeat cannot insert it twice", async () => {
    mock.save.mockReturnValue(new Promise(() => {}));
    renderInsideOfferForm();
    await screen.findByText("Item 0");
    fireEvent.click(screen.getByRole("button", { name: "Add evidence" }));
    fireEvent.change(screen.getByLabelText("Evidence title"), {
      target: { value: "Exact quote" },
    });
    fireEvent.change(
      screen.getByLabelText("Exact quote or documented description"),
      { target: { value: "Useful result." } },
    );
    const button = screen.getByRole("button", { name: "Save evidence" });
    act(() => {
      button.click();
      button.click();
    });
    expect(mock.save).toHaveBeenCalledOnce();
  });
  it("waits for the initial list before allowing evidence mutations", async () => {
    let resolveList: (items: OfferProof[]) => void = () => {};
    mock.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    renderInsideOfferForm();
    expect(
      screen
        .getByRole("button", { name: "Add evidence" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await act(async () => {
      resolveList([]);
    });
    expect(
      screen
        .getByRole("button", { name: "Add evidence" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });
  it("retries a failed library read without claiming there is no evidence or discarding edits", async () => {
    mock.list.mockRejectedValueOnce(new Error("Connection lost"));
    renderInsideOfferForm();
    await screen.findByText(/proof library could not be loaded/);
    expect(screen.queryByText(/No saved evidence yet/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add evidence" }));
    fireEvent.change(screen.getByLabelText("Evidence title"), {
      target: { value: "My unsaved evidence" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Retry evidence library" }),
    );
    await screen.findByText("Item 0");
    expect(
      (screen.getByLabelText("Evidence title") as HTMLInputElement).value,
    ).toBe("My unsaved evidence");
    expect(mock.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/proof library could not be loaded/)).toBeNull();
  });
  it("saves the evidence, not the surrounding offer, when Enter is pressed", async () => {
    const submit = renderInsideOfferForm();
    await screen.findByText("Item 0");
    fireEvent.click(screen.getByRole("button", { name: "Add evidence" }));
    fireEvent.change(screen.getByLabelText("Evidence title"), {
      target: { value: "Client result" },
    });
    fireEvent.change(
      screen.getByLabelText("Exact quote or documented description"),
      { target: { value: "It worked." } },
    );
    const attribution = screen.getByLabelText("Public attribution");
    expect(
      fireEvent.keyDown(attribution, { key: "Enter", code: "Enter" }),
    ).toBe(false);
    await screen.findByText(/Evidence saved/);
    expect(mock.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Client result",
        content: "It worked.",
      }),
    );
    expect(submit).not.toHaveBeenCalled();
  });
  it("rejects a source URL the database would reject and names the field", async () => {
    renderInsideOfferForm();
    await screen.findByText("Item 0");
    fireEvent.click(screen.getByRole("button", { name: "Add evidence" }));
    fireEvent.change(screen.getByLabelText("Evidence title"), {
      target: { value: "Source" },
    });
    fireEvent.change(
      screen.getByLabelText("Exact quote or documented description"),
      { target: { value: "Fact" } },
    );
    fireEvent.change(screen.getByLabelText(/Source URL/), {
      target: { value: "https://exa_mple.com/post" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save evidence" }));
    expect(screen.getByRole("alert").textContent).toMatch(/^Source URL:/);
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("opens the editor in place of the item being edited and focuses it", async () => {
    renderInsideOfferForm();
    await screen.findByText("Item 11");
    const card = screen.getByText("Item 3").closest("article")!;
    fireEvent.click(
      within(card).getByRole("button", { name: "Edit evidence" }),
    );
    const editor = screen.getByRole("group", { name: "Evidence editor" });
    const title = within(editor).getByLabelText(
      "Evidence title",
    ) as HTMLInputElement;
    expect(title.value).toBe("Item 3");
    // The editor replaces the item, so it sits between items 2 and 4.
    const order = Array.from(
      document.querySelectorAll("article h4, [aria-label='Evidence editor']"),
    ).map((node) => node.textContent);
    expect(
      order.indexOf(order.find((text) => text?.startsWith("Edit evidence"))!),
    ).toBe(3);
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(scrolls).toContain(title);
  });
});
