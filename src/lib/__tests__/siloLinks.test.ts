import { describe, expect, it, vi } from "vitest";
import {
  desiredSiloLinks,
  readAllSiloRows,
  rebuildSiloLinks,
  SiloPageNotFound,
  type SiloPage,
  type SiloStore,
  type StoredSiloLink,
} from "../../../supabase/functions/build-silo-links/links";

const page = (id: string, extra: Partial<SiloPage> = {}): SiloPage => ({
  id,
  niche_id: "coaches",
  content_schema_id: "tools",
  title: `Resource ${id}`,
  status: "published",
  published_at: "2026-09-24T00:00:00Z",
  created_at: "2026-09-24T00:00:00Z",
  niches: { name: "Coaches" },
  content_schemas: { name: "Tools" },
  ...extra,
});
const pillar = { id: "guide", niche_id: "coaches", title: "AI for coaches" };
const makeStore = (pages = [page("a")], existing: StoredSiloLink[] = []) => ({
  pages: vi.fn(async () => pages),
  pillars: vi.fn(async () => [pillar]),
  links: vi.fn(async () => existing),
  page: vi.fn(async (id: string) => pages.find((p) => p.id === id) ?? null),
  insert: vi.fn<SiloStore["insert"]>().mockResolvedValue(undefined),
  update: vi.fn<SiloStore["update"]>().mockResolvedValue(undefined),
  remove: vi.fn<SiloStore["remove"]>().mockResolvedValue(undefined),
});
const oldLink: StoredSiloLink = {
  id: "old",
  source_page_id: "a",
  source_page_type: "generated",
  target_page_id: "outdated-guide",
  target_page_type: "pillar",
  link_type: "silo_up",
  anchor_text: "Old guide",
  position: "pillar_banner",
};

describe("silo link reconciliation", () => {
  it("does not mutate links when any source read fails", async () => {
    const store = makeStore([page("a")], [oldLink]);
    store.pillars.mockRejectedValue(new Error("database unavailable"));
    await expect(rebuildSiloLinks(store)).rejects.toThrow(
      "database unavailable",
    );
    expect(store.insert).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });
  it("keeps the existing graph if inserting its replacements fails", async () => {
    const store = makeStore([page("a")], [oldLink]);
    store.insert.mockRejectedValue(new Error("insert refused"));
    await expect(rebuildSiloLinks(store)).rejects.toThrow("insert refused");
    expect(store.remove).not.toHaveBeenCalled();
  });
  it("saves replacements before removing obsolete links", async () => {
    const store = makeStore([page("a")], [oldLink]);
    await expect(rebuildSiloLinks(store)).resolves.toMatchObject({
      links_created: 1,
      links_removed: 1,
    });
    expect(store.insert.mock.invocationCallOrder[0]).toBeLessThan(
      store.remove.mock.invocationCallOrder[0],
    );
    expect(store.remove).toHaveBeenCalledWith(["old"]);
  });
  it("preserves the IDs and click history of unchanged links", async () => {
    const link = desiredSiloLinks(page("a"), [page("a")], [pillar])[0];
    const store = makeStore([page("a")], [{ ...link, id: "existing" }]);
    await expect(rebuildSiloLinks(store)).resolves.toMatchObject({
      links_created: 0,
      links_removed: 0,
    });
    expect(store.insert).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });
  it("repairs changed anchor text without replacing the link ID", async () => {
    const link = desiredSiloLinks(page("a"), [page("a")], [pillar])[0];
    const store = makeStore(
      [page("a")],
      [{ ...link, id: "existing", anchor_text: "Outdated title" }],
    );
    await rebuildSiloLinks(store);
    expect(store.update).toHaveBeenCalledWith("existing", link);
    expect(store.remove).not.toHaveBeenCalled();
  });
  it("reports deletion failures rather than returning a fake success", async () => {
    const store = makeStore([page("a")], [oldLink]);
    store.remove.mockRejectedValue(new Error("delete refused"));
    await expect(rebuildSiloLinks(store)).rejects.toThrow("delete refused");
  });
  it("does not delete anything for an unknown requested page", async () => {
    const store = makeStore([page("a")], [oldLink]);
    await expect(rebuildSiloLinks(store, "missing")).rejects.toBeInstanceOf(
      SiloPageNotFound,
    );
    expect(store.remove).not.toHaveBeenCalled();
  });
  it("never adds siblings of the same content type or resources without a niche", () => {
    const pages = [
      page("a"),
      page("b"),
      page("c", { content_schema_id: "prompts" }),
    ];
    expect(
      desiredSiloLinks(pages[0], pages, []).map((link) => link.target_page_id),
    ).toEqual(["c"]);
    expect(
      desiredSiloLinks(page("unassigned", { niche_id: null }), pages, [pillar]),
    ).toEqual([]);
  });
  it("caps every affected page at ten siblings during individual rebuilds too", async () => {
    const pages = [
      page("a"),
      ...Array.from({ length: 14 }, (_, i) =>
        page(`b${i}`, { content_schema_id: "prompts" }),
      ),
    ];
    const store = makeStore(pages);
    await rebuildSiloLinks(store, "b0");
    const additions = store.insert.mock.calls.flatMap(([links]) => links);
    expect(
      additions.filter(
        (link) =>
          link.source_page_id === "a" && link.link_type === "silo_sibling",
      ),
    ).toHaveLength(10);
    expect(
      additions.some(
        (link) =>
          link.source_page_id.startsWith("b") &&
          link.target_page_id.startsWith("b"),
      ),
    ).toBe(false);
  });
  it("removes links to an unpublished requested page and never adds draft targets", async () => {
    const pages = [page("a")];
    const draft = page("b", { status: "draft", content_schema_id: "prompts" });
    const store = makeStore(pages, [
      {
        ...oldLink,
        target_page_id: "b",
        target_page_type: "generated",
        link_type: "silo_sibling",
      },
    ]);
    store.page.mockResolvedValue(draft);
    await rebuildSiloLinks(store, "b");
    expect(store.remove).toHaveBeenCalledWith(["old"]);
    expect(
      store.insert.mock.calls
        .flatMap(([links]) => links)
        .some((link) => link.target_page_id === "b"),
    ).toBe(false);
  });
  it("reads beyond the API row cap and rejects a failed later page", async () => {
    const load = vi.fn(async (from: number, to: number) => ({
      data: Array.from(
        { length: Math.min(to + 1, 1201) - from },
        (_, i) => i + from,
      ),
      error: null,
    }));
    const rows = await readAllSiloRows(load);
    expect(rows).toHaveLength(1201);
    expect(rows.at(-1)).toBe(1200);
    expect(load).toHaveBeenCalledTimes(4);
    await expect(
      readAllSiloRows(async (from) =>
        from === 0
          ? { data: Array(500).fill(0), error: null }
          : { data: null, error: { message: "read failed" } },
      ),
    ).rejects.toThrow("read failed");
  });
});
