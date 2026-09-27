// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CallFunnelReport from "./CallFunnelReport";
import {
  loadCallReport,
  saveCallOutcome,
  type CallFunnelReport as Report,
} from "@/lib/callFunnelsClient";
vi.mock("@/lib/callFunnelsClient", () => ({
  loadCallReport: vi.fn(),
  saveCallOutcome: vi.fn(),
  isCallMutationRejected: (error: unknown) =>
    !!error &&
    typeof error === "object" &&
    "rejected" in error &&
    error.rejected === true,
}));
const report: Report = {
  applications: [
    {
      id: "app",
      contact: { name: "Example", email: "example@example.com" },
      answers: { ready: "yes" },
      questions: [
        {
          id: "ready",
          label: "Ready?",
          options: [{ id: "yes", label: "Yes, ready" }],
        },
      ],
      outcome: "qualified",
      submittedAt: "2026-09-27T12:00:00Z",
      revision: 1,
      booking: {
        status: "booked",
        startsAt: "2026-09-29T12:00:00Z",
        source: "admin",
      },
    },
  ],
  counts: { applications: 1, manual_sales: 1, webhook_sales: 0 },
  total: 1,
  offset: 0,
  limit: 50,
  hasMore: false,
  retentionDays: 90,
  generatedAt: "2026-09-27T12:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadCallReport).mockResolvedValue(report);
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: () => "00000000-0000-4000-8000-000000000001",
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("call funnel outcome reporting", () => {
  it("uses pinned question labels and clearly distinguishes evidence sources", async () => {
    render(<CallFunnelReport funnelId="funnel" />);
    fireEvent.click(await screen.findByText(/Example · Qualified/));
    expect(screen.getByText("Yes, ready")).toBeTruthy();
    expect(screen.getByText("Sales entered by team")).toBeTruthy();
    expect(screen.getByText("Sales reported by integration")).toBeTruthy();
    expect(screen.getByText(/Booking: booked · recorded by team/)).toBeTruthy();
  });
  it("requires evidence and retries an uncertain outcome with the original request identity", async () => {
    vi.mocked(saveCallOutcome)
      .mockRejectedValueOnce(new Error("Unconfirmed"))
      .mockResolvedValueOnce();
    render(<CallFunnelReport funnelId="funnel" />);
    fireEvent.click(await screen.findByText(/Example · Qualified/));
    fireEvent.click(
      screen.getByRole("button", { name: "Record an outcome for Example" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save outcome" }));
    expect(saveCallOutcome).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("reference");
    fireEvent.change(screen.getByLabelText("Reference"), {
      target: { value: "CRM-1" },
    });
    fireEvent.change(screen.getByLabelText("What did you verify?"), {
      target: { value: "Attended call" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save outcome" }));
    await screen.findByRole("button", { name: "Retry the same outcome" });
    expect(
      (screen.getByLabelText("Reference") as HTMLInputElement).disabled,
    ).toBe(true);
    const original = vi.mocked(saveCallOutcome).mock.calls[0][0];
    fireEvent.click(
      screen.getByRole("button", { name: "Retry the same outcome" }),
    );
    await waitFor(() => expect(saveCallOutcome).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveCallOutcome).mock.calls[1][0]).toEqual(original);
    expect(
      await screen.findByText(
        /Outcome recorded with your administrator identity/,
      ),
    ).toBeTruthy();
  });
  it("preserves an unconfirmed outcome across report reload and replays its exact request", async () => {
    vi.mocked(saveCallOutcome)
      .mockRejectedValueOnce(new Error("Timed out"))
      .mockResolvedValueOnce();
    const onStateChange = vi.fn();
    render(
      <CallFunnelReport funnelId="funnel" onStateChange={onStateChange} />,
    );
    fireEvent.click(await screen.findByText(/Example · Qualified/));
    fireEvent.click(
      screen.getByRole("button", { name: "Record an outcome for Example" }),
    );
    fireEvent.change(screen.getByLabelText("Reference"), {
      target: { value: "CRM-replay" },
    });
    fireEvent.change(screen.getByLabelText("What did you verify?"), {
      target: { value: "Observed attendance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save outcome" }));
    await screen.findByRole("button", { name: "Retry the same outcome" });
    const original = vi.mocked(saveCallOutcome).mock.calls[0][0];
    expect(onStateChange).toHaveBeenLastCalledWith({
      busy: false,
      pending: true,
      dirty: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Reload outcomes" }));
    await waitFor(() => expect(loadCallReport).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Retry the same outcome",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(
      (screen.getByLabelText("Reference") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(onStateChange).toHaveBeenLastCalledWith({
      busy: false,
      pending: true,
      dirty: true,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Retry the same outcome" }),
    );
    await waitFor(() => expect(saveCallOutcome).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveCallOutcome).mock.calls[1][0]).toEqual(original);
    await waitFor(() =>
      expect(screen.queryByLabelText("Reference")).toBeNull(),
    );
  });
  it("locks reload synchronously while an outcome request is delayed", async () => {
    let finish!: () => void;
    vi.mocked(saveCallOutcome).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const onStateChange = vi.fn();
    render(
      <CallFunnelReport funnelId="funnel" onStateChange={onStateChange} />,
    );
    fireEvent.click(await screen.findByText(/Example · Qualified/));
    fireEvent.click(
      screen.getByRole("button", { name: "Record an outcome for Example" }),
    );
    fireEvent.change(screen.getByLabelText("Reference"), {
      target: { value: "CRM-delay" },
    });
    fireEvent.change(screen.getByLabelText("What did you verify?"), {
      target: { value: "Observed attendance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save outcome" }));
    expect(onStateChange).toHaveBeenLastCalledWith({
      busy: true,
      pending: true,
      dirty: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Reload outcomes" }));
    expect(loadCallReport).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith({
        busy: false,
        pending: false,
        dirty: false,
      }),
    );
  });
  it("clears a successfully saved form before refresh and does not offer a duplicate mutation after refresh failure", async () => {
    vi.mocked(saveCallOutcome).mockResolvedValueOnce();
    vi.mocked(loadCallReport)
      .mockResolvedValueOnce(report)
      .mockRejectedValueOnce(new Error("Read failed"));
    render(<CallFunnelReport funnelId="funnel" />);
    fireEvent.click(await screen.findByText(/Example · Qualified/));
    fireEvent.click(
      screen.getByRole("button", { name: "Record an outcome for Example" }),
    );
    fireEvent.change(screen.getByLabelText("Reference"), {
      target: { value: "CRM-saved" },
    });
    fireEvent.change(screen.getByLabelText("What did you verify?"), {
      target: { value: "Observed attendance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save outcome" }));
    await screen.findByText(/Outcome saved, but the report could not refresh/);
    expect(
      screen.queryByRole("button", { name: "Retry the same outcome" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Save outcome" })).toBeNull();
    expect(screen.queryByLabelText("Reference")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload outcomes" }));
    await waitFor(() => expect(loadCallReport).toHaveBeenCalledTimes(3));
    expect(saveCallOutcome).toHaveBeenCalledTimes(1);
  });
  it("unlocks a definitely rejected outcome for correction while preserving the entered evidence", async () => {
    vi.mocked(saveCallOutcome).mockRejectedValueOnce(
      Object.assign(new Error("Server rejected the entry"), { rejected: true }),
    );
    render(<CallFunnelReport funnelId="funnel" />);
    fireEvent.click(await screen.findByText(/Example · Qualified/));
    fireEvent.click(
      screen.getByRole("button", { name: "Record an outcome for Example" }),
    );
    fireEvent.change(screen.getByLabelText("Reference"), {
      target: { value: "CRM-correct" },
    });
    fireEvent.change(screen.getByLabelText("What did you verify?"), {
      target: { value: "Observed attendance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save outcome" }));
    await screen.findByText("Server rejected the entry");
    expect(
      (screen.getByLabelText("Reference") as HTMLInputElement).disabled,
    ).toBe(false);
    expect((screen.getByLabelText("Reference") as HTMLInputElement).value).toBe(
      "CRM-correct",
    );
    expect(screen.getByRole("button", { name: "Save outcome" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Retry the same outcome" }),
    ).toBeNull();
  });
  it("confirms switching an application with unsaved outcome evidence, then starts a clean appropriate form", async () => {
    vi.mocked(loadCallReport).mockResolvedValue({
      ...report,
      applications: [
        ...report.applications,
        {
          ...report.applications[0],
          id: "other",
          outcome: "alternative",
          contact: { name: "Other", email: "other@example.com" },
          booking: undefined,
        },
      ],
    });
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(<CallFunnelReport funnelId="funnel" />);
    fireEvent.click(await screen.findByText(/Example · Qualified/));
    fireEvent.click(screen.getByText(/Other · Alternative offered/));
    fireEvent.click(
      screen.getByRole("button", { name: "Record an outcome for Example" }),
    );
    fireEvent.change(screen.getByLabelText("Reference"), {
      target: { value: "Do not transfer this" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Record an outcome for Other" }),
    );
    expect((screen.getByLabelText("Reference") as HTMLInputElement).value).toBe(
      "Do not transfer this",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Record an outcome for Other" }),
    );
    expect(confirm).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText("Reference") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      within(screen.getByLabelText("Outcome"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Sale recorded"]);
    expect(
      (screen.getByLabelText("Reference") as HTMLInputElement).maxLength,
    ).toBe(300);
  });
  it("does not offer attendance or rescheduling for an unconfirmed booking", async () => {
    vi.mocked(loadCallReport).mockResolvedValue({
      ...report,
      applications: [
        {
          ...report.applications[0],
          booking: { status: "unconfirmed", startsAt: null, source: null },
        },
      ],
    });
    render(<CallFunnelReport funnelId="funnel" />);
    fireEvent.click(await screen.findByText(/Example · Qualified/));
    fireEvent.click(
      screen.getByRole("button", { name: "Record an outcome for Example" }),
    );
    expect(
      within(screen.getByLabelText("Outcome"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Booking recorded", "Sale recorded"]);
  });
});
