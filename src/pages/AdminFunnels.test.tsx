// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import AdminFunnels from "./AdminFunnels";
import { emptyFunnelGraph } from "@/lib/funnelJourneys";
import {
  listFunnelJourneys,
  listFunnelOffers,
  saveFunnelJourney,
  type FunnelDraft,
} from "@/lib/funnelJourneysClient";
const navigation = vi.hoisted(() => ({ block: (): boolean => false }));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: { shouldBlockFn: () => boolean }) => {
    navigation.block = options.shouldBlockFn;
  },
}));
vi.mock("@/lib/funnelJourneysClient", () => ({
  listFunnelJourneys: vi.fn(),
  listFunnelOffers: vi.fn(),
  saveFunnelJourney: vi.fn(),
}));
const draft: FunnelDraft = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "sample",
  title: "A saved journey",
  draft_graph: emptyFunnelGraph(),
  version: 3,
  published_version: 2,
  active: true,
  updated_at: "2026-09-26",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listFunnelJourneys).mockResolvedValue([structuredClone(draft)]);
  vi.mocked(listFunnelOffers).mockResolvedValue([]);
});
afterEach(cleanup);
async function open() {
  render(<AdminFunnels />);
  await screen.findByRole("option", { name: "A saved journey · Live" });
  fireEvent.change(screen.getByLabelText("Journey"), {
    target: { value: draft.id },
  });
}
describe("connected funnel editor", () => {
  it("loads connections and simulates without publishing or creating a session", async () => {
    await open();
    expect(screen.getByText("→ finish")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Continue simulation" }),
    );
    expect(screen.getByText("End of journey")).toBeTruthy();
    expect(saveFunnelJourney).not.toHaveBeenCalled();
  });
  it("saves drafts with the expected revision and publishes only on explicit publish", async () => {
    vi.mocked(saveFunnelJourney).mockResolvedValue({ ...draft, version: 4 });
    await open();
    fireEvent.change(screen.getByLabelText("Journey title"), {
      target: { value: "Revised draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save private draft" }));
    await screen.findByRole("status");
    expect(saveFunnelJourney).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 3,
        publish: false,
        title: "Revised draft",
      }),
    );
    vi.mocked(saveFunnelJourney).mockResolvedValue({
      ...draft,
      version: 5,
      published_version: 5,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Publish new revision" }),
    );
    await waitFor(() => expect(saveFunnelJourney).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveFunnelJourney).mock.calls[1][0]).toMatchObject({
      publish: true,
      expectedVersion: 4,
    });
  });
  it("blocks saving an unreachable new step and explains the missing connection", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Add step" }));
    expect(
      screen.getByText("Every step must be reachable from the entry step."),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Publish new revision",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Save private draft",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("keeps the same save identity after a transport error", async () => {
    vi.mocked(saveFunnelJourney)
      .mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValueOnce({ ...draft, version: 4 });
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Save private draft" }));
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry the same save" }),
    );
    await screen.findByRole("status");
    expect(vi.mocked(saveFunnelJourney).mock.calls[1]).toEqual(
      vi.mocked(saveFunnelJourney).mock.calls[0],
    );
  });
  it("guards edited drafts during internal admin navigation", async () => {
    await open();
    expect(navigation.block()).toBe(false);
    fireEvent.change(screen.getByLabelText("Journey title"), {
      target: { value: "Changed locally" },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(navigation.block()).toBe(true);
    confirm.mockReturnValue(true);
    expect(navigation.block()).toBe(false);
    confirm.mockRestore();
  });
});
