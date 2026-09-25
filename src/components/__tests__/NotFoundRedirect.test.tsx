// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { StrictMode } from "react";

const mock = vi.hoisted(() => ({
  navigate: vi.fn(),
  rpc: vi.fn(),
  rules: {} as Record<string, { to_path: string; status_code: number }>,
  router: {} as { navigate: (...args: unknown[]) => unknown },
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => mock.router,
  useLocation: () => ({
    pathname: window.location.pathname,
    searchStr: window.location.search,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mock.rpc },
}));

import NotFoundRedirect from "../NotFoundRedirect";
import { missingPageClientDestination } from "@/lib/notFoundRedirectClient";

function rpcResult(fn: string, args: { p_path: string }) {
  const data =
    fn === "resolve_redirect"
      ? mock.rules[args.p_path]
        ? [mock.rules[args.p_path]]
        : []
      : true;
  return {
    abortSignal: () => Promise.resolve({ data, error: null }),
  };
}

function visit(path: string) {
  window.history.pushState({}, "", path);
}

beforeEach(() => {
  mock.router = { navigate: mock.navigate };
  mock.navigate.mockReset();
  mock.rpc.mockReset();
  mock.rpc.mockImplementation(rpcResult);
  mock.rules = { "/my-story": { to_path: "/about", status_code: 301 } };
});
afterEach(cleanup);

describe("NotFoundRedirect", () => {
  it("does not double-count server-rendered missing pages, but records later client navigation", async () => {
    visit("/missing-document");
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      <StrictMode>
        <NotFoundRedirect />
      </StrictMode>,
    );
    document.body.appendChild(container);
    const view = render(
      <StrictMode>
        <NotFoundRedirect />
      </StrictMode>,
      { container, hydrate: true },
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "This page doesn't exist or has moved",
      ),
    );
    expect(
      mock.rpc.mock.calls.filter(([name]) => name === "record_not_found"),
    ).toHaveLength(0);
    expect(mock.rpc).toHaveBeenCalledWith("resolve_redirect", {
      p_path: "/missing-document",
    });
    visit("/another-missing-page");
    view.rerender(
      <StrictMode>
        <NotFoundRedirect />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenCalledWith(
        "record_not_found",
        expect.objectContaining({ p_path: "/another-missing-page" }),
      ),
    );
    visit("/missing-document");
    view.rerender(
      <StrictMode>
        <NotFoundRedirect />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenCalledWith(
        "record_not_found",
        expect.objectContaining({ p_path: "/missing-document" }),
      ),
    );
    expect(
      mock.rpc.mock.calls.filter(([name]) => name === "record_not_found"),
    ).toHaveLength(2);
  });
  it("follows a saved rule and keeps the visitor's query string", async () => {
    visit("/My-Story?utm_source=fb");
    render(<NotFoundRedirect />);
    await waitFor(() =>
      expect(mock.navigate).toHaveBeenCalledWith({
        href: "/about?utm_source=fb",
        replace: true,
      }),
    );
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it("records an unknown page and offers useful links without navigating", async () => {
    visit("/case-studies");
    render(<NotFoundRedirect />);
    await waitFor(() =>
      expect(mock.rpc).toHaveBeenCalledWith("record_not_found", {
        p_path: "/case-studies",
        p_referrer: null,
        p_ua_class: expect.stringMatching(/^(bot|human|unknown)$/),
      }),
    );
    expect(mock.navigate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Browse resources" }),
    ).toHaveAttribute("href", "/resources");
  });

  it("sends unknown admin pages to the admin overview without logging", async () => {
    visit("/admin/not-a-page");
    render(<NotFoundRedirect />);
    await waitFor(() =>
      expect(mock.navigate).toHaveBeenCalledWith({
        href: "/admin",
        replace: true,
      }),
    );
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("stays on the missing page when the lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mock.rpc.mockImplementation(() => ({
      abortSignal: () => Promise.reject(new Error("offline")),
    }));
    visit("/social-media");
    render(<NotFoundRedirect />);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "This page doesn't exist or has moved",
      ),
    );
    expect(mock.navigate).not.toHaveBeenCalled();
  });

  it("explains the missing page and gives the visitor control", () => {
    visit("/revven");
    render(<NotFoundRedirect />);
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).not.toHaveTextContent("Taking you to the home page");
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});

describe("missingPageClientDestination", () => {
  const lookup = (rule: { to_path: string; status_code: number } | null) => ({
    resolve: vi.fn(async () => rule),
    record: vi.fn(async () => undefined),
  });

  it("opens external rule targets as a full page load", async () => {
    const deps = lookup({
      to_path: "https://go.aiforbusiness.com/summit",
      status_code: 302,
    });
    expect(
      await missingPageClientDestination(
        { pathname: "/summit", search: "", referrer: "", userAgent: "" },
        deps,
      ),
    ).toEqual({
      kind: "external",
      href: "https://go.aiforbusiness.com/summit",
    });
  });

  it("leaves files alone so the real 404 stays visible", async () => {
    const deps = lookup(null);
    expect(
      await missingPageClientDestination(
        { pathname: "/old.pdf", search: "", referrer: "", userAgent: "" },
        deps,
      ),
    ).toEqual({ kind: "stay" });
    expect(deps.resolve).not.toHaveBeenCalled();
  });

  it("strips referrer query strings before recording", async () => {
    const deps = lookup(null);
    await missingPageClientDestination(
      {
        pathname: "/revven",
        search: "",
        referrer: "https://brianhanson.com/blog/post?token=abc",
        userAgent: "Mozilla/5.0 Chrome/120",
      },
      deps,
    );
    expect(deps.record).toHaveBeenCalledWith(
      "/revven",
      "https://brianhanson.com/blog/post",
      "human",
    );
  });
});
