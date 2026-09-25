// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import News from "@/pages/News";
import Blog from "@/pages/Blog";

const state = vi.hoisted(() => ({
  params: new URLSearchParams(),
  keys: [] as unknown[][],
  error: false,
  nextError: false,
  next: vi.fn(),
  refetch: vi.fn(),
  observe: vi.fn(),
}));
vi.mock("@/components/Nav", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useSearchParams: () => [
    state.params,
    (update: (previous: URLSearchParams) => URLSearchParams) => {
      state.params = update(new URLSearchParams(state.params));
    },
  ],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({
    data: { items: [], nextPage: 1 },
    isError: state.error,
    refetch: state.refetch,
  }),
  useInfiniteQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    state.keys.push(queryKey);
    return {
      data: { pages: [{ items: [], nextPage: 1 }] },
      isLoading: false,
      isFetching: false,
      isError: state.error,
      isFetchNextPageError: state.nextError,
      fetchNextPage: state.next,
      refetch: state.refetch,
      hasNextPage: true,
      isFetchingNextPage: false,
    };
  },
}));
beforeEach(() => {
  state.params = new URLSearchParams(
    "q=marketing&topic=all&utm_source=partner",
  );
  state.keys = [];
  state.error = false;
  state.nextError = false;
  state.next.mockReset();
  state.refetch.mockReset();
  state.observe.mockReset();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe = state.observe;
      disconnect = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("news search and pagination recovery", () => {
  it("restores the search from the URL and browser history", () => {
    const view = render(<News />);
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Search news",
        }) as HTMLInputElement
      ).value,
    ).toBe("marketing");
    expect(state.keys.at(-1)).toEqual([
      "public-news-infinite",
      "marketing",
      "all",
    ]);
    state.params = new URLSearchParams("q=customer%20service");
    view.rerender(<News />);
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Search news",
        }) as HTMLInputElement
      ).value,
    ).toBe("customer service");
    expect(state.keys.at(-1)?.[1]).toBe("customer service");
  });
  it("submits a bounded search and preserves unrelated attribution parameters", () => {
    render(<News />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search news" }), {
      target: { value: "follow-up" },
    });
    fireEvent.submit(screen.getByRole("search"));
    expect(state.params.get("q")).toBe("follow-up");
    expect(state.params.get("utm_source")).toBe("partner");
  });
  it("retries the failed initial request without losing the search", () => {
    state.error = true;
    render(<News />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
    expect(state.params.get("q")).toBe("marketing");
    expect(state.next).not.toHaveBeenCalled();
    expect(state.observe).not.toHaveBeenCalled();
  });
  it.each(["news", "blog"])(
    "stops automatic requests after a %s pagination failure and permits explicit retry",
    (page) => {
      state.error = true;
      state.nextError = true;
      render(page === "news" ? <News /> : <Blog />);
      expect(state.observe).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      if (page === "news") {
        expect(state.next).toHaveBeenCalledOnce();
        expect(state.refetch).not.toHaveBeenCalled();
      } else {
        expect(state.refetch).toHaveBeenCalledOnce();
        expect(state.next).not.toHaveBeenCalled();
      }
    },
  );
});
