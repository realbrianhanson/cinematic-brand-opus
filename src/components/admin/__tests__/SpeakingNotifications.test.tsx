// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { update, deliveries, saved, readSettings } = vi.hoisted(() => ({
  update: vi.fn(),
  deliveries: vi.fn(),
  saved: vi.fn(),
  readSettings: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (name: string) => {
      if (name !== "admin_read_site_settings")
        throw new Error("Unexpected RPC");
      return readSettings();
    },
    from: (table: string) => {
      if (table === "site_settings")
        throw new Error("Private email columns require the admin RPC");
      let mutation = false;
      const query = {
        select: () => query,
        order: () => query,
        limit: () => query,
        eq: () => query,
        update: (value: unknown) => {
          mutation = true;
          update(value);
          return query;
        },
        in: () => Promise.resolve({ data: null, error: null, count: 0 }),
        maybeSingle: () =>
          Promise.resolve(
            mutation
              ? saved()
              : {
                  data: {
                    id: "settings",
                    speaking_notifications_enabled: false,
                    speaking_notification_email: "",
                  },
                  error: null,
                },
          ),
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: deliveries(), error: null }),
      };
      return query;
    },
  },
}));
import SpeakingNotifications, {
  SpeakingDeliveryStatus,
} from "../SpeakingNotifications";

function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return client;
}
beforeEach(() => {
  update.mockReset();
  readSettings.mockReset();
  readSettings.mockResolvedValue({
    data: [{ newsletter_reply_to: "owner@example.com" }],
    error: null,
  });
  saved.mockReturnValue({ data: { id: "settings" }, error: null });
  deliveries.mockReturnValue([]);
});
afterEach(cleanup);

describe("speaking email configuration and status", () => {
  it("loads private sender configuration through the administrator-checked RPC", async () => {
    mount(<SpeakingNotifications />);
    const input = await screen.findByLabelText("Owner notification address");
    expect(input).toHaveAttribute("placeholder", "owner@example.com");
    expect(readSettings).toHaveBeenCalledOnce();
  });
  it("fails closed when the private-settings RPC refuses access", async () => {
    readSettings.mockResolvedValue({
      data: null,
      error: { message: "Administrator access required" },
    });
    mount(<SpeakingNotifications />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be loaded",
    );
    expect(
      screen.queryByRole("button", { name: "Save email settings" }),
    ).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
  it("preserves an unsaved recipient and original baseline across a background refresh", async () => {
    const client = mount(<SpeakingNotifications />);
    const field = await screen.findByLabelText("Owner notification address");
    fireEvent.change(field, { target: { value: "draft@example.com" } });
    await act(async () => {
      client.setQueryData(["speaking-notifications", "settings"], {
        id: "settings",
        speaking_notifications_enabled: true,
        speaking_notification_email: "other-admin@example.com",
        fallback: "owner@example.com",
      });
    });
    expect(field).toHaveValue("draft@example.com");
    expect(
      screen.getByRole("checkbox", { name: "Enable inquiry emails" }),
    ).not.toBeChecked();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Saved settings changed elsewhere",
    );
    expect(
      screen.getByRole("button", { name: "Save email settings" }),
    ).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Load latest saved settings" }),
    );
    expect(field).toHaveValue("other-admin@example.com");
    expect(
      screen.getByRole("checkbox", { name: "Enable inquiry emails" }),
    ).toBeChecked();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("shows disabled settings without sending anything and saves explicit enablement", async () => {
    mount(<SpeakingNotifications />);
    const checkbox = await screen.findByRole("checkbox", {
      name: "Enable inquiry emails",
    });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByLabelText("Owner notification address")).toHaveAttribute(
      "placeholder",
      "owner@example.com",
    );
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(checkbox);
    fireEvent.click(
      screen.getByRole("button", { name: "Save email settings" }),
    );
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        speaking_notifications_enabled: true,
        speaking_notification_email: "",
      }),
    );
  });
  it("keeps edited settings visible when a concurrent update prevents saving", async () => {
    saved.mockReturnValue({ data: null, error: null });
    mount(<SpeakingNotifications />);
    fireEvent.change(
      await screen.findByLabelText("Owner notification address"),
      { target: { value: "new@example.com" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save email settings" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be saved",
    );
    expect(screen.getByLabelText("Owner notification address")).toHaveValue(
      "new@example.com",
    );
  });
  it("distinguishes provider acceptance from delivery and exposes a pending failure", async () => {
    deliveries.mockReturnValue([
      { id: "1", kind: "owner", status: "sent", attempts: 1, last_error: null },
      {
        id: "2",
        kind: "acknowledgement",
        status: "pending",
        attempts: 2,
        next_attempt_at: "2026-10-01T12:00:00Z",
        last_error: "Resend rate limit reached",
      },
    ]);
    mount(<SpeakingDeliveryStatus inquiryId="inquiry" />);
    expect(
      await screen.findByText(
        "Owner notification · Accepted by email provider",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Organizer acknowledgement · Queued"),
    ).toBeInTheDocument();
    expect(screen.getByText("Resend rate limit reached")).toBeInTheDocument();
    expect(
      screen.getByText(/does not confirm inbox delivery/),
    ).toBeInTheDocument();
  });
});
