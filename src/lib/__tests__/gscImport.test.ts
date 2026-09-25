import { describe, expect, it, vi } from "vitest";
import {
  resolveGscProperty,
  stageGscImport,
  type SearchRow,
} from "../../../supabase/functions/_shared/gscImport";

const row = {
  keys: ["https://example.test/guide", "query"],
  clicks: 2,
  impressions: 10,
  ctr: 0.2,
  position: 3,
};
function fixture(
  options: { failChunk?: number; failActivation?: boolean } = {},
) {
  const ops: Array<{
    table: string;
    action: string;
    payload?: unknown;
    filters: unknown[];
  }> = [];
  let chunks = 0;
  const rpcResult = () =>
    options.failActivation
      ? { data: null, error: new Error("Activation response lost") }
      : { data: { saved: true }, error: null };
  const rpc = vi.fn(() => ({
    abortSignal: () => Promise.resolve(rpcResult()),
  }));
  const from = (table: string) => {
    const op = {
      table,
      action: "select",
      payload: undefined as unknown,
      filters: [] as unknown[],
    };
    const chain = {
      insert(payload: unknown) {
        op.action = "insert";
        op.payload = payload;
        return chain;
      },
      update(payload: unknown) {
        op.action = "update";
        op.payload = payload;
        return chain;
      },
      delete() {
        op.action = "delete";
        return chain;
      },
      select() {
        return chain;
      },
      abortSignal() {
        return chain;
      },
      single() {
        return chain;
      },
      eq(key: string, value: unknown) {
        op.filters.push([key, value]);
        return chain;
      },
      then(resolve: (v: unknown) => unknown, reject: (v: unknown) => unknown) {
        ops.push(op);
        return Promise.resolve(
          table === "gsc_import_rows" &&
            op.action === "insert" &&
            ++chunks === options.failChunk
            ? { data: null, error: new Error("Chunk rejected") }
            : { data: { id: "import-1" }, error: null },
        ).then(resolve, reject);
      },
    };
    return chain;
  };
  return {
    ops,
    rpc,
    db: { from, rpc } as unknown as Parameters<typeof stageGscImport>[0],
  };
}
const period = {
  property: "sc-domain:example.test",
  start: "2026-08-01",
  end: "2026-08-28",
};
describe("Search Console import", () => {
  it("supports exact Domain and URL-prefix properties with a legacy origin fallback", () => {
    expect(
      resolveGscProperty("sc-domain:example.test", "https://other.test"),
    ).toBe("sc-domain:example.test");
    expect(
      resolveGscProperty(
        "https://example.test/articles/",
        "https://other.test",
      ),
    ).toBe("https://example.test/articles/");
    expect(resolveGscProperty("", "https://example.test/")).toBe(
      "https://example.test/",
    );
    for (const property of [
      "sc-domain:",
      "http://example.test/",
      "https://user:password@example.test/",
      "https://example.test/?q=1",
      "https://example.test/#section",
    ])
      expect(() =>
        resolveGscProperty(property, "https://example.test"),
      ).toThrow(/exact Search Console property/);
  });
  it("stages every chunk before activating one complete dataset", async () => {
    const f = fixture();
    const result = await stageGscImport(f.db, period, async () =>
      Array.from({ length: 1001 }, (_, i) => ({
        ...row,
        keys: [row.keys[0], `query ${i}`],
      })),
    );
    expect(result.rows).toBe(1001);
    expect(f.ops.map((op) => [op.table, op.action])).toEqual([
      ["gsc_imports", "insert"],
      ["gsc_import_rows", "insert"],
      ["gsc_import_rows", "insert"],
    ]);
    expect(f.rpc).toHaveBeenCalledWith("gsc_finish_import", {
      _import_id: "import-1",
      _expected_rows: 1001,
    });
    expect(f.ops.some((op) => op.table === "gsc_performance")).toBe(false);
  });
  it("never touches active data or activates an import when a later chunk fails", async () => {
    const f = fixture({ failChunk: 2 });
    await expect(
      stageGscImport(f.db, period, async () =>
        Array.from({ length: 1001 }, () => row),
      ),
    ).rejects.toThrow("Chunk rejected");
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.ops.at(-2)).toMatchObject({
      table: "gsc_imports",
      action: "update",
      filters: [
        ["id", "import-1"],
        ["status", "importing"],
      ],
    });
    expect(f.ops.at(-1)).toMatchObject({
      table: "gsc_import_rows",
      action: "delete",
    });
    expect(f.ops.some((op) => op.table === "gsc_performance")).toBe(false);
  });
  it("records an empty completed import instead of silently retaining stale totals", async () => {
    const f = fixture();
    expect(await stageGscImport(f.db, period, async () => [])).toEqual({
      rows: 0,
    });
    expect(f.rpc).toHaveBeenCalledWith("gsc_finish_import", {
      _import_id: "import-1",
      _expected_rows: 0,
    });
  });
  it("records provider failure and refuses malformed rows", async () => {
    for (const load of [
      async () => {
        throw new Error("Provider unavailable");
      },
      async () => [{ ...row, ctr: Number.NaN }],
      async () => [{ ...row, keys: [42, {}] } as unknown as SearchRow],
      async () => [{ ...row, keys: "ab" } as unknown as SearchRow],
      async () => [{ ...row, keys: [row.keys[0], "query", "unexpected"] }],
      async () => [null as unknown as SearchRow],
      async () => ({ rows: [] }) as unknown as SearchRow[],
    ]) {
      const f = fixture();
      await expect(stageGscImport(f.db, period, load)).rejects.toThrow();
      expect(f.rpc).not.toHaveBeenCalled();
      expect(
        f.ops.some(
          (op) => op.table === "gsc_import_rows" && op.action === "insert",
        ),
      ).toBe(false);
      expect(f.ops.at(-2)).toMatchObject({
        table: "gsc_imports",
        action: "update",
        payload: { status: "failed" },
      });
    }
  });
  it("does not relabel a committed import after an uncertain activation response", async () => {
    const f = fixture({ failActivation: true });
    await expect(
      stageGscImport(f.db, period, async () => [row]),
    ).rejects.toThrow("Activation response lost");
    expect(f.ops.at(-2)?.filters).toContainEqual(["status", "importing"]);
    expect(f.ops.some((op) => op.table === "gsc_performance")).toBe(false);
  });
});
