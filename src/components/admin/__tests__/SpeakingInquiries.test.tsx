// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
const { update, eq, result, blocker, back } = vi.hoisted(() => ({
  blocker: vi.fn(),
  back: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  result: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: unknown) => blocker(options),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (value: unknown) => {
        update(value);
        const query = {
          eq: (...args: unknown[]) => {
            eq(...args);
            return query;
          },
          select: () => query,
          maybeSingle: result,
        };
        return query;
      },
    }),
  },
}));
import { InquiryDetail } from "../SpeakingInquiries";
const inquiry: Tables<"speaking_inquiries"> = {
  id: "10000000-0000-4000-8000-000000000001",
  request_id: "10000000-0000-4000-8000-000000000002",
  payload_hash: "ab".repeat(32),
  name: "Organizer",
  email: "organizer@example.com",
  event_name: "Owner summit",
  event_date: "October",
  event_format: "in_person",
  audience: "80 founders",
  message: "<script>bad()</script>\nPractical ideas",
  status: "new",
  admin_notes: "",
  created_at: "2026-09-19T12:00:00Z",
  updated_at: "2026-09-19T12:00:00Z",
};
function renderDetail() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <InquiryDetail inquiry={inquiry} back={back} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  back.mockReset();
  blocker.mockReset();
  update.mockReset();
  eq.mockReset();
  result.mockReset();
});
afterEach(cleanup);
describe("speaking inbox details", () => {
  it("protects unsaved notes both when returning to the inbox and leaving the route", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderDetail();
    fireEvent.change(screen.getByLabelText("Private notes"), {
      target: { value: "Keep this next step" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Back to inbox" }));
    expect(back).not.toHaveBeenCalled();
    expect(blocker.mock.lastCall![0].shouldBlockFn()).toBe(true);
    expect(blocker.mock.lastCall![0].enableBeforeUnload).toBe(true);
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Back to inbox" }));
    expect(back).toHaveBeenCalledOnce();
  });
  it("renders submitted text safely and lets the owner reply without changing the status", () => {
    renderDetail();
    expect(screen.getByText(/<script>bad/)).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Reply by email" }),
    ).toHaveAttribute(
      "href",
      "mailto:organizer@example.com?subject=Re%3A%20Owner%20summit",
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });
  it("only saves status and private notes with concurrency protection", async () => {
    result.mockResolvedValue({
      data: { updated_at: "2026-09-19T13:00:00Z" },
      error: null,
    });
    renderDetail();
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "contacted" },
    });
    fireEvent.change(screen.getByLabelText("Private notes"), {
      target: { value: "Sent availability" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(update).toHaveBeenCalledExactlyOnceWith({
      status: "contacted",
      admin_notes: "Sent availability",
    });
    expect(eq).toHaveBeenCalledWith("id", inquiry.id);
    expect(eq).toHaveBeenCalledWith("updated_at", inquiry.updated_at);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
  it("preserves a draft when another administrator already changed the inquiry", async () => {
    result.mockResolvedValue({ data: null, error: null });
    renderDetail();
    fireEvent.change(screen.getByLabelText("Private notes"), {
      target: { value: "Keep this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "changed in another window",
    );
    expect(screen.getByLabelText("Private notes")).toHaveValue(
      "Keep this draft",
    );
    expect(screen.queryByText("Saved")).toBeNull();
  });
  it("preserves a draft on failure and allows an explicit retry", async () => {
    result
      .mockResolvedValueOnce({
        data: null,
        error: new Error("private backend detail"),
      })
      .mockResolvedValueOnce({
        data: { updated_at: "2026-09-19T13:00:00Z" },
        error: null,
      });
    renderDetail();
    fireEvent.change(screen.getByLabelText("Private notes"), {
      target: { value: "Keep this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be saved",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "private backend detail",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });
});
