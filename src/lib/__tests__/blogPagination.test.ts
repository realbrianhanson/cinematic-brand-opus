import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  blogArchivePath,
  blogSearch,
} from "../../../supabase/functions/_shared/blogPagination";
import { getPublicPostsFirstPage } from "../publicData.functions";
import { Route } from "../../routes/blog.index";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  notFound: () => Object.assign(new Error("Not found"), { status: 404 }),
}));
vi.mock("@/pages/Blog", () => ({ default: () => null }));
vi.mock("@/components/PublicRouteError", () => ({ default: () => null }));
vi.mock("../publicData.functions", () => ({
  getPublicPostsFirstPage: vi.fn(),
}));
const load = Route.options.loader as (input: {
  deps: { page: number; category: string };
}) => Promise<unknown>;
const head = Route.options.head as unknown as (input: {
  matches: [];
  loaderData: {
    page: number;
    category: string;
    items: unknown[];
    nextPage: number | null;
  };
}) => {
  links: Array<{ rel: string; href: string }>;
  meta: Array<Record<string, string>>;
};
beforeEach(() => vi.clearAllMocks());

describe("crawlable blog archives", () => {
  it("bounds user-supplied page values and removes irrelevant tracking from archive URLs", () => {
    for (const page of [
      0,
      -1,
      1.5,
      Infinity,
      "2junk",
      "1e5",
      "10001",
      undefined,
    ])
      expect(blogSearch({ page }).page).toBe(1);
    expect(blogSearch({ page: "3", category: " tutorials " })).toEqual({
      page: 3,
      category: "tutorials",
    });
    expect(blogArchivePath(1)).toBe("/blog");
    expect(blogArchivePath(2, "ai & business")).toBe(
      "/blog?category=ai+%26+business&page=2",
    );
  });
  it("loads the requested archive page on the server with its category", async () => {
    vi.mocked(getPublicPostsFirstPage).mockResolvedValue({
      items: [{ id: "older-post" }],
      nextPage: null,
      page: 3,
      category: "tutorials",
    } as never);
    const result = await load({ deps: { page: 3, category: "tutorials" } });
    expect(getPublicPostsFirstPage).toHaveBeenCalledWith({
      data: { page: 3, category: "tutorials" },
    });
    expect(result).toMatchObject({ items: [{ id: "older-post" }], page: 3 });
  });
  it("returns a real not-found response for empty later pages, while read failures remain retryable", async () => {
    vi.mocked(getPublicPostsFirstPage).mockResolvedValue({
      items: [],
      nextPage: null,
      page: 9999,
      category: "",
    });
    await expect(
      load({ deps: { page: 9999, category: "" } }),
    ).rejects.toMatchObject({ status: 404 });
    vi.mocked(getPublicPostsFirstPage).mockRejectedValue(
      new Error("Temporary read failure"),
    );
    await expect(load({ deps: { page: 2, category: "" } })).rejects.toThrow(
      "Temporary read failure",
    );
  });
  it("self-canonicalizes page 2 and includes content-preserving previous and next URLs", () => {
    const result = head({
      matches: [],
      loaderData: { page: 2, category: "tutorials", items: [{}], nextPage: 2 },
    });
    const href = (rel: string) =>
      result.links.find((link) => link.rel === rel)?.href;
    expect(href("canonical")).toMatch(/\/blog\?category=tutorials&page=2$/);
    expect(href("prev")).toMatch(/\/blog\?category=tutorials$/);
    expect(href("next")).toMatch(/\/blog\?category=tutorials&page=3$/);
    expect(result.meta.find((meta) => "title" in meta)?.title).toContain(
      "Page 2",
    );
    expect(result.meta.some((meta) => meta.name === "robots")).toBe(false);
    const last = head({
      matches: [],
      loaderData: { page: 3, category: "", items: [{}], nextPage: null },
    });
    expect(last.links.some((link) => link.rel === "next")).toBe(false);
  });
});
