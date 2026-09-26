import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  resourceArchivePath,
  RESOURCE_PAGE_SIZE,
} from "../../../supabase/functions/_shared/resourcePagination";

// Execute the actual deployed renderer function with isolated reads, no network.
const source = readFileSync("supabase/functions/render-page/index.ts", "utf8");
const file = ts.createSourceFile(
  "renderer.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const fn = file.statements.find(
  (node) =>
    ts.isFunctionDeclaration(node) &&
    node.name?.text === "renderContentTypeList",
)!;
const js = ts.transpileModule(fn.getText(file), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(niche: object | null, pages: object[] = [], fail = false) {
  const filters: Array<[string, unknown]> = [];
  const db = {
    from: (table: string) => {
      const q = {
        select: () => q,
        order: () => q,
        eq: (name: string, value: unknown) => {
          filters.push([`${table}.${name}`, value]);
          return q;
        },
        maybeSingle: async () => ({
          data:
            table === "content_schemas"
              ? { id: "type", name: "Guides", slug: "guides" }
              : niche,
          error: null,
        }),
        range: async () => ({
          data: pages,
          error: fail ? new Error("Read failed") : null,
        }),
      };
      return q;
    },
  };
  const render = new Function(
    "supabase",
    "resourceArchivePath",
    "RESOURCE_PAGE_SIZE",
    "esc",
    "renderShell",
    "notFound",
    "missingPage",
    `${js}; return renderContentTypeList;`,
  )(
    db,
    resourceArchivePath,
    RESOURCE_PAGE_SIZE,
    String,
    (args: unknown) => args,
    () => ({ status: 404 }),
    () => ({ status: 404 }),
  );
  return { render, filters };
}
describe("crawler resource listing parity", () => {
  it("does not expose inactive or unknown niche results and noindexes the empty first page", async () => {
    const h = harness(null, [
      { slug: "private-topic", title: "Must not render" },
    ]);
    const result = await h.render({}, "/resources/guides", "guides", {
      page: 1,
      niche: "inactive",
    });
    expect(h.filters).toContainEqual(["niches.is_active", true]);
    expect(result.robots).toBe("noindex, follow");
    expect(result.bodyHtml).not.toContain("Must not render");
    expect(
      (
        await h.render({}, "/resources/guides", "guides", {
          page: 2,
          niche: "inactive",
        })
      ).status,
    ).toBe(404);
  });
  it("keeps page and niche in canonical/navigation URLs and bounds the visible list", async () => {
    const h = harness(
      { id: "niche" },
      Array.from({ length: 13 }, (_, i) => ({
        slug: `item-${i}`,
        title: `Item ${i}`,
      })),
    );
    const result = await h.render({}, "/resources/guides", "guides", {
      page: 2,
      niche: "business",
    });
    expect(result.path).toBe("/resources/guides?niche=business&page=2");
    expect(result.bodyHtml).toContain("niche=business&page=3");
    expect(result.bodyHtml).not.toContain("item-12");
  });
  it("does not turn query errors into successful empty lists", async () => {
    await expect(
      harness(null, [], true).render({}, "/resources/guides", "guides", {
        page: 1,
        niche: "",
      }),
    ).rejects.toThrow("Read failed");
  });
});
