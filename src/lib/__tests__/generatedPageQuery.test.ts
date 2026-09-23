import { describe, expect, it } from "vitest";
import { fetchGeneratedPageForViewer } from "../generatedPageQuery";
import { PUBLIC_GENERATED_PAGE_SELECT } from "../publicColumns";

type Filter = [string, string, unknown];

function fakeClient(opts: { signedIn: boolean; page: unknown }) {
  const calls: { table: string; columns: string; filters: Filter[] }[] = [];
  const from = (table: string) => {
    const call = { table, columns: "", filters: [] as Filter[] };
    calls.push(call);
    const chain = {
      select(columns: string) {
        call.columns = columns;
        return chain;
      },
      eq(col: string, value: unknown) {
        call.filters.push(["eq", col, value]);
        return chain;
      },
      async maybeSingle() {
        if (table === "content_schemas")
          return {
            data: { id: "s1", name: "Tool Roundups", slug: "tool-roundups" },
            error: null,
          };
        return { data: opts.page, error: null };
      },
    };
    return chain;
  };
  const client = {
    from,
    auth: {
      getSession: async () => ({
        data: { session: opts.signedIn ? { user: { id: "u1" } } : null },
        error: null,
      }),
    },
  };
  return { client, calls };
}

const draft = {
  id: "p1",
  status: "draft",
  niches: { id: "n1", name: "Roofers", slug: "roofers" },
};

describe("fetchGeneratedPageForViewer", () => {
  it("keeps visitors on published pages only, with public columns", async () => {
    const { client, calls } = fakeClient({ signedIn: false, page: null });
    const page = await fetchGeneratedPageForViewer(
      client as never,
      "tool-roundups",
      "best-tools",
    );
    expect(page).toBeNull();
    const pageCall = calls.find((c) => c.table === "generated_pages")!;
    expect(pageCall.columns).toBe(PUBLIC_GENERATED_PAGE_SELECT);
    expect(pageCall.filters).toContainEqual(["eq", "status", "published"]);
  });

  it("lets a signed-in admin load a draft (RLS decides) for preview", async () => {
    const { client, calls } = fakeClient({ signedIn: true, page: draft });
    const page = await fetchGeneratedPageForViewer(
      client as never,
      "tool-roundups",
      "best-tools",
    );
    const pageCall = calls.find((c) => c.table === "generated_pages")!;
    expect(pageCall.columns).toBe(PUBLIC_GENERATED_PAGE_SELECT);
    expect(pageCall.filters).not.toContainEqual(["eq", "status", "published"]);
    expect(pageCall.filters).toContainEqual(["eq", "slug", "best-tools"]);
    expect(page).toMatchObject({
      id: "p1",
      status: "draft",
      schema: { slug: "tool-roundups" },
      niche: { name: "Roofers" },
    });
  });
});
