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
import { emptyCallFunnelConfig, type CallFunnelDraft } from "@/lib/callFunnels";
import {
  listCallFunnels,
  loadCallReport,
  saveCallFunnel,
  saveCallOutcome,
} from "@/lib/callFunnelsClient";
import AdminCallFunnels from "./AdminCallFunnels";

const blockers = vi.hoisted(() => ({
  current: null as null | {
    shouldBlockFn: () => boolean;
    enableBeforeUnload: () => boolean;
  },
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (value: typeof blockers.current) => {
    blockers.current = value;
  },
}));
vi.mock("@/config/SiteConfigContext", () => ({
  useSiteConfig: () => ({
    identity: { name: "Example", tagline: "Practical help" },
    story: {},
  }),
}));
vi.mock("@/lib/offerBuilderClient", () => ({
  listOfferProof: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/callFunnelsClient", () => ({
  listCallFunnels: vi.fn(),
  loadCallReport: vi.fn(),
  saveCallFunnel: vi.fn(),
  saveCallOutcome: vi.fn(),
  isCallMutationRejected: (error: unknown) =>
    !!error &&
    typeof error === "object" &&
    "rejected" in error &&
    error.rejected === true,
}));
vi.mock("@/components/admin/call-funnels/CallFunnelEditor", () => ({
  default: () => <p>Template editor</p>,
}));
vi.mock("@/components/call-funnels/CallFunnelExperience", () => ({
  default: () => <p>Template preview</p>,
}));
const saved = (): CallFunnelDraft => ({
  id: "funnel-one",
  title: "First funnel",
  slug: "first-funnel",
  version: 1,
  published_version: null,
  active: false,
  draft_config: emptyCallFunnelConfig(),
  updated_at: "2026-09-27T12:00:00Z",
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listCallFunnels).mockResolvedValue([
    saved(),
    {
      ...saved(),
      id: "funnel-two",
      title: "Second funnel",
      slug: "second-funnel",
    },
  ]);
  vi.mocked(loadCallReport).mockResolvedValue({
    applications: [
      {
        id: "application-one",
        contact: { name: "Applicant", email: "applicant@example.com" },
        answers: {},
        outcome: "qualified",
        submittedAt: "2026-09-27T12:00:00Z",
        revision: 1,
        booking: {
          status: "booked",
          startsAt: "2026-10-01T12:00:00Z",
          source: "admin",
        },
      },
    ],
    counts: {},
    total: 1,
    offset: 0,
    limit: 50,
    hasMore: false,
    retentionDays: 90,
    generatedAt: "2026-09-27T12:00:00Z",
  });
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: () => "00000000-0000-4000-8000-000000000001",
  });
  vi.spyOn(window, "alert").mockImplementation(() => {});
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function selectSaved() {
  render(<AdminCallFunnels />);
  await screen.findByRole("option", { name: /First funnel/ });
  fireEvent.change(screen.getByLabelText("Saved call funnels"), {
    target: { value: "funnel-one" },
  });
}
async function openOutcome() {
  await selectSaved();
  fireEvent.click(
    screen.getByRole("button", { name: "Applications & outcomes" }),
  );
  fireEvent.click(await screen.findByText(/Applicant · Qualified/));
  fireEvent.click(
    screen.getByRole("button", { name: "Record an outcome for Applicant" }),
  );
  fireEvent.change(screen.getByLabelText("Reference"), {
    target: { value: "CRM-check" },
  });
  fireEvent.change(screen.getByLabelText("What did you verify?"), {
    target: { value: "Observed attendance" },
  });
}
describe("call funnel administrator mutation protection", () => {
  it("preserves an unsaved outcome when draft validation fails", async () => {
    const invalid = saved();
    invalid.draft_config.questions = [];
    vi.mocked(listCallFunnels).mockResolvedValue([invalid]);
    await openOutcome();
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Add at least one question",
    );
    expect((screen.getByLabelText("Reference") as HTMLInputElement).value).toBe(
      "CRM-check",
    );
    expect(
      (screen.getByLabelText("What did you verify?") as HTMLTextAreaElement)
        .value,
    ).toBe("Observed attendance");
    expect(saveCallFunnel).not.toHaveBeenCalled();
  });
  it("blocks parent reload, funnel changes and navigation until a delayed outcome has been confirmed", async () => {
    let finish!: () => void;
    vi.mocked(saveCallOutcome).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    await openOutcome();
    fireEvent.click(screen.getByRole("button", { name: "Save outcome" }));
    for (const name of [
      "Reload saved version",
      "Edit template",
      "Test both paths",
      "Use Video + Application template",
    ])
      expect(
        (screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
      ).toBe(true);
    expect(
      (screen.getByLabelText("Saved call funnels") as HTMLSelectElement)
        .disabled,
    ).toBe(true);
    expect(blockers.current?.shouldBlockFn()).toBe(true);
    expect(blockers.current?.enableBeforeUnload()).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved version" }),
    );
    expect(listCallFunnels).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Edit template",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(blockers.current?.shouldBlockFn()).toBe(false);
  });
  it("keeps parent controls locked after an uncertain outcome and after a report reload", async () => {
    vi.mocked(saveCallOutcome)
      .mockRejectedValueOnce(new Error("Transport failed"))
      .mockResolvedValueOnce();
    await openOutcome();
    fireEvent.click(screen.getByRole("button", { name: "Save outcome" }));
    await screen.findByRole("button", { name: "Retry the same outcome" });
    fireEvent.click(screen.getByRole("button", { name: "Reload outcomes" }));
    await waitFor(() => expect(loadCallReport).toHaveBeenCalledTimes(2));
    expect(
      (
        screen.getByRole("button", {
          name: "Edit template",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(blockers.current?.shouldBlockFn()).toBe(true);
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Retry the same outcome",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry the same outcome" }),
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Edit template",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(vi.mocked(saveCallOutcome).mock.calls[1][0]).toEqual(
      vi.mocked(saveCallOutcome).mock.calls[0][0],
    );
  });
  it("leaves a duplicate-slug draft editable after a definite rejection", async () => {
    vi.mocked(saveCallFunnel).mockRejectedValueOnce(
      Object.assign(new Error("Choose a different address"), {
        rejected: true,
      }),
    );
    render(<AdminCallFunnels />);
    await screen.findByRole("option", { name: /First funnel/ });
    fireEvent.click(
      screen.getByRole("button", { name: "Use Video + Application template" }),
    );
    fireEvent.change(screen.getByLabelText(/Page address/), {
      target: { value: "duplicate-address" },
    });
    fireEvent.change(screen.getByLabelText("Funnel name"), {
      target: { value: "Keep this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Choose a different address");
    expect(
      (screen.getByLabelText(/Page address/) as HTMLInputElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByLabelText("Funnel name") as HTMLInputElement).value,
    ).toBe("Keep this draft");
    expect(
      screen.queryByRole("button", { name: "Retry the same save" }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText(/Page address/), {
      target: { value: "corrected-address" },
    });
    expect(
      (screen.getByLabelText(/Page address/) as HTMLInputElement).value,
    ).toBe("corrected-address");
  });
  it("keeps an uncertain funnel save intact and blocks reload until exact replay", async () => {
    vi.mocked(saveCallFunnel)
      .mockRejectedValueOnce(new Error("Timed out"))
      .mockResolvedValueOnce({ ...saved(), version: 2 });
    await selectSaved();
    fireEvent.change(screen.getByLabelText("Funnel name"), {
      target: { value: "Edited draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("button", { name: "Retry the same save" });
    expect(
      (
        screen.getByRole("button", {
          name: "Reload saved version",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(blockers.current?.shouldBlockFn()).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry the same save" }),
    );
    await waitFor(() => expect(saveCallFunnel).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveCallFunnel).mock.calls[1][0]).toEqual(
      vi.mocked(saveCallFunnel).mock.calls[0][0],
    );
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Funnel name") as HTMLInputElement).disabled,
      ).toBe(false),
    );
  });
});
