// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
const mock = vi.hoisted(() => ({
  save: vi.fn(),
  payload: vi.fn(),
  filters: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mock.toast }),
}));
vi.mock("@/lib/router-compat", () => ({ Link: () => null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (payload: unknown) => {
        mock.payload(payload);
        const query = {
          eq: (...args: unknown[]) => {
            mock.filters(...args);
            return query;
          },
          select: () => query,
          maybeSingle: mock.save,
        };
        return query;
      },
    }),
  },
}));
import QueueAutomationSettings from "../QueueAutomationSettings";
const settings = {
  id: "settings",
  auto_publish_enabled: false,
  auto_publish_daily_cap: 3,
  auto_publish_min_quality: 85,
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
describe("automation settings", () => {
  it("saves only explicit settings and uses the original snapshot for concurrent-change protection", async () => {
    const saved = vi.fn();
    mock.save.mockResolvedValue({ data: { id: "settings" }, error: null });
    const view = render(
      <QueueAutomationSettings
        settings={settings}
        disabled={false}
        onSaved={saved}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage automation" }));
    fireEvent.change(screen.getByLabelText(/Daily cap/), {
      target: { value: "4" },
    });
    view.rerender(
      <QueueAutomationSettings
        settings={{ ...settings, auto_publish_daily_cap: 7 }}
        disabled={false}
        onSaved={saved}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(mock.payload).toHaveBeenCalledWith({
      ...settings,
      id: undefined,
      auto_publish_daily_cap: 4,
    });
    expect(mock.filters).toHaveBeenCalledWith("auto_publish_daily_cap", 3);
  });
  it("does not claim success when an optimistic update affects no row", async () => {
    mock.save.mockResolvedValue({ data: null, error: null });
    const saved = vi.fn();
    render(
      <QueueAutomationSettings
        settings={settings}
        disabled={false}
        onSaved={saved}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage automation" }));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() =>
      expect(mock.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Settings were not saved" }),
      ),
    );
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
