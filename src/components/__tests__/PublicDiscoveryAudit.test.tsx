// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ResourcesIndex from "@/pages/ResourcesIndex";
import Blog from "@/pages/Blog";

const mocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  nextPage: vi.fn(),
  refetch: vi.fn(),
  searchKeys: [] as unknown[][],
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
  useSearchParams: () => [
    mocks.params,
    (update: (params: URLSearchParams) => URLSearchParams) => {
      mocks.params = update(new URLSearchParams(mocks.params));
    },
  ],
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey[0] === "public-library-search") {
      mocks.searchKeys.push(queryKey);
      return { data: { total: 60, items: [] }, isPending: false };
    }
    if (queryKey[0] === "public-posts-page")
      return {
        data: { items: [], nextPage: 1 },
        isLoading: false,
        isError: false,
      };
    return { data: queryKey[0] === "public-content-schemas" ? [] : null };
  },
  useInfiniteQuery: () => ({
    data: { pages: [{ items: [] }] },
    isLoading: false,
    isError: false,
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: mocks.nextPage,
    refetch: mocks.refetch,
  }),
}));
vi.mock("@/components/Nav", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/components/PublicCTA", () => ({ default: () => null }));

beforeEach(() => {
  mocks.params = new URLSearchParams("q=marketing&page=2&measurement=off");
  mocks.nextPage.mockReset();
  mocks.searchKeys = [];
  vi.stubGlobal("IntersectionObserver", undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public discovery continuity", () => {
  it("restores the query, input and result page from browser navigation", () => {
    const view = render(<ResourcesIndex />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "marketing",
    );
    expect(mocks.searchKeys.at(-1)).toEqual([
      "public-library-search",
      "marketing",
      1,
    ]);
    mocks.params = new URLSearchParams("q=sales&page=3");
    view.rerender(<ResourcesIndex />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
      "sales",
    );
    expect(mocks.searchKeys.at(-1)).toEqual([
      "public-library-search",
      "sales",
      2,
    ]);
  });
  it("resets pagination for a new search and preserves unrelated URL preferences", () => {
    render(<ResourcesIndex />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "follow up" },
    });
    fireEvent.submit(screen.getByRole("search"));
    expect(mocks.params.get("q")).toBe("follow up");
    expect(mocks.params.has("page")).toBe(false);
    expect(mocks.params.get("measurement")).toBe("off");
  });
  it("puts pagination in the shareable URL", () => {
    render(<ResourcesIndex />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(mocks.params.get("page")).toBe("3");
    expect(mocks.params.get("q")).toBe("marketing");
  });
  it("keeps later articles reachable without IntersectionObserver", () => {
    render(<Blog />);
    expect(
      screen.getByRole("link", { name: "Next articles" }).getAttribute("href"),
    ).toBe("/blog?page=2");
    expect(
      screen.queryByRole("link", { name: "Previous articles" }),
    ).toBeNull();
  });
});
