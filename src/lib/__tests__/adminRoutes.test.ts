import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "@/routeTree.gen";

const router = createRouter({
  routeTree,
  context: { queryClient: new QueryClient() },
  history: createMemoryHistory(),
});

describe("admin route destinations", () => {
  it("resolves every literal admin link used by admin components", () => {
    const directory = fileURLToPath(
      new URL("../../components/admin/", import.meta.url),
    );
    const targets = new Set<string>();
    for (const file of readdirSync(directory).filter((name) =>
      name.endsWith(".tsx"),
    )) {
      const source = readFileSync(`${directory}/${file}`, "utf8");
      for (const match of source.matchAll(
        /(?:href=|to=|to:\s*|navigate\()"(\/admin[^"?]*)/g,
      )) {
        targets.add(match[1]);
      }
    }
    expect(targets.size).toBeGreaterThan(15);
    for (const target of targets) {
      const match = router.matchRoutes(target).at(-1);
      expect(match?.pathname.replace(/\/$/, ""), target).toBe(
        target.replace(/\/$/, ""),
      );
      expect(match?.globalNotFound, target).not.toBe(true);
    }
  });
  it.each([
    "/admin/posts/new",
    "/admin/posts/example-id/edit",
    "/admin/content-types/new",
    "/admin/content-types/example-id/edit",
    "/admin/pillars/new",
    "/admin/pillars/example-id/edit",
    "/admin/pages/example-id/edit",
    "/admin/generate",
  ])("opens %s directly inside the admin layout", (path) => {
    const matches = router.matchRoutes(path);
    // A manager/list route must not intercept an editor: it has no Outlet.
    expect(matches.map((match) => match.routeId).slice(0, -1)).toEqual([
      "__root__",
      "/admin",
    ]);
    expect(matches.at(-1)?.pathname).toBe(path);
    expect(matches.at(-1)?.globalNotFound).not.toBe(true);
  });

  it.each(["posts", "pages", "content-types", "pillars"])(
    "still resolves the %s list with or without a trailing slash",
    (section) => {
      for (const suffix of ["", "/"]) {
        const matches = router.matchRoutes(`/admin/${section}${suffix}`);
        expect(matches.at(-1)?.routeId).toBe(`/admin/${section}/`);
      }
    },
  );
});
