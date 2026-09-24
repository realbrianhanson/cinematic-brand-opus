// @vitest-environment jsdom
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

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  from: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: h.from },
}));
import ContentOfferRoutesManager from "../ContentOfferRoutesManager";

beforeEach(() => {
  h.rows = [];
  h.save.mockReset();
  h.save.mockResolvedValue({ error: null });
  h.remove.mockReset();
  h.from.mockReset();
  h.from.mockImplementation((table: string) => {
    const rows =
      table === "content_offer_routes"
        ? h.rows
        : table === "offers"
          ? [{ id: "offer-1", title: "Follow-up kit", slug: "follow-up-kit" }]
          : table === "posts"
            ? [
                {
                  id: "post-1",
                  title: "Better follow-up",
                  slug: "better-follow-up",
                },
              ]
            : [{ name: "AI tools", slug: "ai-tools" }];
    let deleting = false;
    const result = { data: rows, error: null };
    const chain = {
      select: () => chain,
      order: () => chain,
      ilike: () => chain,
      limit: () => chain,
      eq: (key: string, value: string) => {
        if (deleting) h.remove(key, value);
        return chain;
      },
      delete: () => {
        deleting = true;
        return chain;
      },
      upsert: (payload: unknown, config: unknown) => {
        return h.save(payload, config);
      },
      then: (resolve: (data: typeof result) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  });
});
afterEach(cleanup);
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ContentOfferRoutesManager />
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Manage offer assignments" }),
  );
}
describe("editorial offer assignment", () => {
  it("freezes editable controls and actions until a slow save completes", async () => {
    let complete!: (result: { error: null }) => void;
    h.save.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    h.rows = [
      {
        id: "route-1",
        scope: "default",
        match_key: "*",
        label: "Existing assignment",
        offer_id: "offer-1",
        headline: "",
        subtext: "",
        button_text: "",
        updated_at: "today",
      },
    ];
    show();
    await screen.findByRole("option", {
      name: "Better follow-up (better-follow-up)",
    });
    fireEvent.change(screen.getByLabelText("Article or guide"), {
      target: { value: "post:post-1" },
    });
    fireEvent.change(screen.getByLabelText("Recommended offer"), {
      target: { value: "offer-1" },
    });
    fireEvent.change(screen.getByLabelText("Headline (optional)"), {
      target: { value: "Saved headline" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save offer assignment" }),
    );
    await screen.findByRole("button", { name: "Saving…" });
    for (const control of [
      ...screen.getAllByRole("combobox"),
      ...screen.getAllByRole("textbox"),
      ...screen.getAllByRole("button"),
    ]) {
      expect(control).toBeDisabled();
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Edit Existing assignment" }),
    );
    expect(
      screen.queryByText("Editing: Existing assignment"),
    ).not.toBeInTheDocument();
    expect(h.save).toHaveBeenCalledTimes(1);
    await act(async () => {
      complete({ error: null });
    });
    await screen.findByText("Offer assignment saved.");
    expect(screen.getByLabelText("Headline (optional)")).toBeEnabled();
    expect(screen.getByLabelText("Headline (optional)")).toHaveValue(
      "Saved headline",
    );
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({
        headline: "Saved headline",
        offer_id: "offer-1",
      }),
      expect.anything(),
    );
  });
  it("saves a published offer as the explicit default and keeps copy optional", async () => {
    show();
    fireEvent.change(await screen.findByLabelText("Apply to"), {
      target: { value: "default" },
    });
    fireEvent.change(screen.getByLabelText("Recommended offer"), {
      target: { value: "offer-1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save offer assignment" }),
    );
    await screen.findByText("Offer assignment saved.");
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "default",
        match_key: "*",
        offer_id: "offer-1",
        headline: "",
        subtext: "",
        button_text: "",
      }),
      { onConflict: "scope,match_key" },
    );
  });
  it("saves the selected article identity instead of allowing an arbitrary destination URL", async () => {
    show();
    await screen.findByRole("option", {
      name: "Better follow-up (better-follow-up)",
    });
    fireEvent.change(screen.getByLabelText("Article or guide"), {
      target: { value: "post:post-1" },
    });
    fireEvent.change(screen.getByLabelText("Recommended offer"), {
      target: { value: "offer-1" },
    });
    fireEvent.change(screen.getByLabelText("Headline (optional)"), {
      target: { value: "Put this into practice" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save offer assignment" }),
    );
    await waitFor(() =>
      expect(h.save).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "page",
          match_key: "post:post-1",
          label: "Better follow-up",
          headline: "Put this into practice",
        }),
        expect.anything(),
      ),
    );
    expect(screen.queryByLabelText(/destination URL/i)).not.toBeInTheDocument();
  });
  it("explains an unavailable target, blocks resaving it, and allows removal", async () => {
    h.rows = [
      {
        id: "route-1",
        scope: "default",
        match_key: "*",
        label: "Default content",
        offer_id: "old-offer",
        headline: "",
        subtext: "",
        button_text: "",
        updated_at: "today",
      },
    ];
    show();
    await screen.findByText(/Offer unavailable — fallback is active/);
    fireEvent.click(
      screen.getByRole("button", { name: "Edit Default content" }),
    );
    expect(
      screen.getByRole("button", { name: "Save offer assignment" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Default content" }),
    );
    await screen.findByText(/Assignment removed/);
    expect(h.remove).toHaveBeenCalledWith("id", "route-1");
  });
});
