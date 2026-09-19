// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  insert: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
  navigate: vi.fn(),
  read: vi.fn(),
  blocker: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: (options: unknown) => mock.blocker(options),
}));
vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mock.navigate,
}));
vi.mock("@/config/SiteConfigContext", () => ({
  useSiteConfig: () => ({ identity: { siteUrl: "https://example.com" } }),
}));
vi.mock("@/lib/offers", () => ({
  invokeOfferApi: async () => ({
    payments_ready: false,
    secret_configured: false,
    webhook_configured: false,
    mode: "unconfigured",
    webhook_url: "https://backend.example.com/webhook",
  }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const readQuery = () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      abortSignal: () => query,
      maybeSingle: () => mock.read(),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return query;
  };
  const mutation = (result: Promise<unknown>) => {
    const query = {
      select: () => query,
      eq: () => query,
      abortSignal: () => query,
      maybeSingle: () => result,
    };
    return query;
  };
  return {
    supabase: {
      from: () => ({
        ...readQuery(),
        insert: (value: unknown) => mutation(mock.insert(value)),
        update: (value: unknown) => mutation(mock.update(value)),
      }),
      storage: { from: () => ({ upload: mock.upload }) },
    },
  };
});
import OfferEditor from "../OfferEditor";

function mount(id?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OfferEditor id={id} />
    </QueryClientProvider>,
  );
}
const row = {
  id: "00000000-0000-4000-a000-000000000001",
  title: "Useful guide",
  slug: "useful-guide",
  summary: "A useful guide",
  body: "",
  cover_url: null,
  status: "draft",
  kind: "free",
  amount_minor: 0,
  currency: "usd",
  asset_path: null,
  asset_name: null,
  thank_you_message: "Thank you",
  next_offer_id: null,
  next_offer_window_minutes: 0,
  funnel_only: false,
  show_in_shop: false,
  shop_category: "resource",
  shop_featured: false,
  created_at: "2026-09-19T00:00:00Z",
  updated_at: "2026-09-19T00:00:00Z",
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: vi.fn(() => row.id),
  });
  mock.read.mockResolvedValue({ data: null, error: null });
  mock.insert.mockResolvedValue({
    data: null,
    error: { message: "Network unavailable" },
  });
  mock.update.mockResolvedValue({ data: null, error: null });
  mock.upload.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("offer editor save and upload safety", () => {
  it("shows the canonical Shop link only for the saved published listing", async () => {
    const published = {
      ...row,
      status: "published",
      show_in_shop: true,
      asset_path: "offer/version.pdf",
      asset_name: "Guide.pdf",
    };
    mock.read.mockResolvedValue({ data: published, error: null });
    mock.update.mockImplementation(async (values) => ({
      data: { ...published, ...values, updated_at: "2026-09-19T00:01:00Z" },
      error: null,
    }));
    mount(row.id);
    expect(
      (await screen.findByRole("link", { name: "View Shop" })).getAttribute(
        "href",
      ),
    ).toBe("https://example.com/shop");
    fireEvent.click(screen.getByRole("checkbox", { name: "Show in Shop" }));
    expect(screen.getByRole("link", { name: "View Shop" })).toBeTruthy();
    fireEvent.submit(
      screen.getByRole("button", { name: "Save & publish" }).closest("form")!,
    );
    await screen.findByText(/Offer published/);
    expect(screen.queryByRole("link", { name: "View Shop" })).toBeNull();
  });
  it("persists Shop category and feature settings while keeping an offer in draft", async () => {
    mock.read.mockResolvedValue({ data: row, error: null });
    mock.update.mockImplementation(async (values) => ({
      data: { ...row, ...values, updated_at: "2026-09-19T00:01:00Z" },
      error: null,
    }));
    mount(row.id);
    const listed = await screen.findByRole("checkbox", {
      name: "Show in Shop",
    });
    expect((listed as HTMLInputElement).checked).toBe(false);
    fireEvent.click(listed);
    fireEvent.change(screen.getByLabelText("Shop category"), {
      target: { value: "training" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Feature in Shop" }));
    fireEvent.submit(
      screen.getByRole("button", { name: "Save offer" }).closest("form")!,
    );
    await screen.findByText("Offer saved.");
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        show_in_shop: true,
        shop_category: "training",
        shop_featured: true,
        status: "draft",
      }),
    );
    expect(
      (screen.getByLabelText("Shop category") as HTMLSelectElement).value,
    ).toBe("training");
    expect(screen.queryByRole("link", { name: "View Shop" })).toBeNull();
  });
  it("clears and disables Shop placement when an offer becomes follow-up only", async () => {
    mock.read.mockResolvedValue({
      data: {
        ...row,
        show_in_shop: true,
        shop_category: "course",
        shop_featured: true,
      },
      error: null,
    });
    mock.update.mockImplementation(async (values) => ({
      data: { ...row, ...values, updated_at: "2026-09-19T00:01:00Z" },
      error: null,
    }));
    mount(row.id);
    await screen.findByLabelText("Shop category");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Make this offer available only as a follow-up/,
      }),
    );
    const listed = screen.getByRole("checkbox", {
      name: "Show in Shop",
    }) as HTMLInputElement;
    const featured = screen.getByRole("checkbox", {
      name: "Feature in Shop",
    }) as HTMLInputElement;
    expect(listed.checked).toBe(false);
    expect(listed.disabled).toBe(true);
    expect(featured.checked).toBe(false);
    expect(featured.disabled).toBe(true);
    fireEvent.submit(
      screen.getByRole("button", { name: "Save offer" }).closest("form")!,
    );
    await screen.findByText("Offer saved.");
    expect(mock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        funnel_only: true,
        show_in_shop: false,
        shop_featured: false,
        shop_category: "course",
        status: "draft",
      }),
    );
  });
  it("reuses its creation id after an uncertain save and recovers an earlier successful insert", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: row.title },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save offer" }).closest("form")!,
    );
    await screen.findByText("Network unavailable");
    mock.read.mockResolvedValue({ data: row, error: null });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save offer" }).closest("form")!,
    );
    await screen.findByText(/Your earlier save was received/);
    expect(mock.insert).toHaveBeenCalledTimes(1);
    expect(mock.insert.mock.calls[0][0].id).toBe(row.id);
    expect(
      screen
        .getByRole("link", { name: /Preview saved version/ })
        .getAttribute("href"),
    ).toBe(`/offers/preview/${row.id}`);
    expect(mock.navigate).not.toHaveBeenCalled();
  });
  it("reports a timestamp conflict without treating the offer as saved", async () => {
    mock.read.mockResolvedValue({ data: row, error: null });
    mount(row.id);
    fireEvent.change(await screen.findByLabelText("Title"), {
      target: { value: "Changed title" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Save offer" }).closest("form")!,
    );
    await screen.findByText(/This offer changed in another tab/);
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Changed title",
    );
    expect(mock.navigate).not.toHaveBeenCalled();
  });
  it("rejects unsupported and oversized files before storage calls", async () => {
    mount();
    const input = screen.getByLabelText(/Upload the resource/);
    fireEvent.change(input, {
      target: {
        files: [new File(["<html>"], "page.html", { type: "text/html" })],
      },
    });
    await screen.findByText(/Choose a PDF/);
    const file = new File(["pdf"], "guide.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 25 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText(/no larger than 25 MB/);
    expect(mock.upload).not.toHaveBeenCalled();
    fireEvent.change(input, {
      target: {
        files: [new File(["pdf"], "guide.pdf", { type: "application/pdf" })],
      },
    });
    await waitFor(() => expect(mock.upload).toHaveBeenCalledTimes(1));
    expect(mock.upload.mock.calls[0][0]).toBe(`${row.id}/${row.id}.pdf`);
    expect(mock.upload.mock.calls[0][2]).toEqual({
      contentType: "application/pdf",
      upsert: false,
    });
    await screen.findByText(/File uploaded privately/);
  });
});
