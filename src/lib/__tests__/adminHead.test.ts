import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "@/routeTree.gen";
import { adminNavigation } from "@/components/admin/adminNavigation";

const router = createRouter({
  routeTree,
  context: { queryClient: new QueryClient() },
  history: createMemoryHistory(),
});

type Meta = { title?: string; name?: string; content?: string };
const headOf = (routeId: string): Meta[] => {
  const route = (
    router.routesById as unknown as Record<
      string,
      { options: { head?: (ctx: unknown) => { meta?: Meta[] } } }
    >
  )[routeId];
  return route?.options.head?.({})?.meta ?? [];
};
const titleOf = (routeId: string) =>
  headOf(routeId).find((meta) => meta.title)?.title;

// Routes owned by this batch; newly added admin pages should follow suit.
const ADMIN_ROUTE_IDS = [
  "/admin",
  "/admin/",
  "/admin/queue",
  "/admin/conversions",
  "/admin/offers/",
  "/admin/offers/new",
  "/admin/offers/$id/edit",
  "/admin/inquiries",
  "/admin/pseo-dashboard",
  "/admin/posts/",
  "/admin/posts/new",
  "/admin/posts/$id/edit",
  "/admin/pages/",
  "/admin/pages/$id/edit",
  "/admin/pillars/",
  "/admin/pillars/new",
  "/admin/pillars/$id/edit",
  "/admin/generate",
  "/admin/library",
  "/admin/setup",
  "/admin/site-settings",
  "/admin/settings",
  "/admin/niches",
  "/admin/content-types/",
  "/admin/content-types/new",
  "/admin/content-types/$id/edit",
  "/admin/categories",
  "/admin/widgets",
];

describe("admin route head", () => {
  it.each(ADMIN_ROUTE_IDS)("%s has its own title and noindex", (routeId) => {
    const meta = headOf(routeId);
    expect(titleOf(routeId), routeId).toMatch(/ · Admin$/);
    expect(meta.find((m) => m.name === "robots")?.content, routeId).toBe(
      "noindex, nofollow",
    );
  });

  it("uses the sidebar label as the tab title for every sidebar page", () => {
    for (const item of adminNavigation.flatMap((group) => group.items)) {
      const routeId = item.to === "/admin" ? "/admin/" : item.to;
      if (!ADMIN_ROUTE_IDS.includes(routeId)) continue;
      const listId = ADMIN_ROUTE_IDS.includes(`${routeId}/`)
        ? `${routeId}/`
        : routeId;
      expect(titleOf(listId), item.to).toBe(`${item.label} · Admin`);
    }
  });

  it("gives every admin tab a distinct title", () => {
    const titles = ADMIN_ROUTE_IDS.map(titleOf);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
