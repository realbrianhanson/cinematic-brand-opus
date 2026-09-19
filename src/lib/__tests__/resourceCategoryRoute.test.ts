import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calls: [] as unknown[][],
  schema: {
    id: "schema-1",
    slug: "ideas-use-cases",
    name: "Ideas & Use Cases",
  } as Record<string, unknown> | null,
  schemaError: null as { message: string } | null,
  pages: [
    {
      id: "page-1",
      title: "AI for professional services",
      slug: "professional-services",
    },
  ],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (run: () => unknown) => run,
    inputValidator: (validate: (data: unknown) => unknown) => ({
      handler:
        (run: (args: { data: unknown }) => unknown) =>
        (input: { data: unknown }) =>
          run({ data: validate(input.data) }),
    }),
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  notFound: () => Object.assign(new Error("Not found"), { status: 404 }),
}));
vi.mock("@/pages/ContentTypeList", () => ({ default: () => null }));
vi.mock("@/components/PublicRouteError", () => ({ default: () => null }));
vi.mock("../publicData.server", () => ({
  SITE_SETTINGS_PUBLIC_COLUMNS: "site_title",
  createPublicServerClient: () => ({
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "limit"]) {
        query[method] = (...args: unknown[]) => {
          mocks.calls.push([table, method, ...args]);
          return query;
        };
      }
      query.maybeSingle = async () =>
        table === "content_schemas"
          ? { data: mocks.schema, error: mocks.schemaError }
          : { data: { site_title: "Example" }, error: null };
      query.order = async () => ({ data: mocks.pages, error: null });
      return query;
    },
  }),
}));

import { Route } from "../../routes/resources.$contentType.index";

const load = Route.options.loader as (args: {
  params: { contentType: string };
}) => Promise<unknown>;

beforeEach(() => {
  mocks.calls = [];
  mocks.schema = {
    id: "schema-1",
    slug: "ideas-use-cases",
    name: "Ideas & Use Cases",
  };
  mocks.schemaError = null;
});

describe("resource category route", () => {
  it("passes the route category through the actual server input validator and loads published pages", async () => {
    const result = await load({ params: { contentType: "ideas-use-cases" } });
    expect(result).toEqual({
      schema: mocks.schema,
      pages: mocks.pages,
      settings: { site_title: "Example" },
    });
    expect(mocks.calls).toContainEqual([
      "content_schemas",
      "eq",
      "slug",
      "ideas-use-cases",
    ]);
    expect(mocks.calls).toContainEqual([
      "generated_pages",
      "eq",
      "content_schema_id",
      "schema-1",
    ]);
    expect(mocks.calls).toContainEqual([
      "generated_pages",
      "eq",
      "status",
      "published",
    ]);
  });

  it("keeps an unknown category distinct from a failed database read", async () => {
    mocks.schema = null;
    await expect(
      load({ params: { contentType: "missing-category" } }),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.calls.some(([table]) => table === "generated_pages")).toBe(
      false,
    );
    mocks.schemaError = { message: "Read unavailable" };
    await expect(
      load({ params: { contentType: "ideas-use-cases" } }),
    ).rejects.toThrow("Read unavailable");
  });
});
