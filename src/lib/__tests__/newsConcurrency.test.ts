import { describe, expect, it } from "vitest";
import {
  newsEditVersion,
  NewsEditConflict,
  updateNewsIfCurrent,
} from "../../../supabase/functions/_shared/newsConcurrency";

const VERSION = "00000000-0000-4000-8000-000000000001";
const NEWER = "00000000-0000-4000-8000-000000000002";
function store() {
  let row = {
    id: "article",
    edit_version: VERSION,
    full_content: "Original",
    image_url: "",
  };
  return {
    row: () => row,
    edit: () => {
      row = {
        ...row,
        edit_version: NEWER,
        full_content: "Editor's newer work",
        image_url: "manual-image.jpg",
      };
    },
    client: {
      from: () => ({
        update: (values: Record<string, unknown>) => {
          const filters = new Map<string, string>();
          const query = {
            eq: (key: string, value: string) => {
              filters.set(key, value);
              return query;
            },
            select: () => ({
              maybeSingle: async () => {
                if (
                  filters.get("id") !== row.id ||
                  filters.get("edit_version") !== row.edit_version
                )
                  return { data: null, error: null };
                row = { ...row, ...values, edit_version: NEWER };
                return { data: { id: row.id }, error: null };
              },
            }),
          };
          return query;
        },
      }),
    },
  };
}

describe("news concurrent writes", () => {
  it("rejects missing or invalid tokens before touching storage", () => {
    for (const row of [
      null,
      {},
      { edit_version: "" },
      { edit_version: 2 },
      { edit_version: "2026-09-25" },
    ])
      expect(() => newsEditVersion(row)).toThrow(/version protection/);
    expect(newsEditVersion({ edit_version: VERSION })).toBe(VERSION);
  });
  it("saves the matching version once and rejects a replay", async () => {
    const s = store();
    await updateNewsIfCurrent(s.client, "article", VERSION, {
      full_content: "Reviewed",
    });
    await expect(
      updateNewsIfCurrent(s.client, "article", VERSION, {
        full_content: "Replay",
      }),
    ).rejects.toBeInstanceOf(NewsEditConflict);
    expect(s.row().full_content).toBe("Reviewed");
  });
  it("preserves editor changes when generation or cached image backfill finishes late", async () => {
    for (const values of [
      { full_content: "AI rewrite", image_url: "automatic.jpg" },
      { image_url: "automatic.jpg" },
    ]) {
      const s = store();
      const versionBeforeGeneration = newsEditVersion(s.row());
      s.edit();
      await expect(
        updateNewsIfCurrent(
          s.client,
          "article",
          versionBeforeGeneration,
          values,
        ),
      ).rejects.toBeInstanceOf(NewsEditConflict);
      expect(s.row()).toMatchObject({
        full_content: "Editor's newer work",
        image_url: "manual-image.jpg",
      });
    }
  });
  it("never translates database failures into successful writes", async () => {
    const query = {
      eq: () => query,
      select: () => ({
        maybeSingle: async () => ({
          data: null,
          error: { message: "permission denied" },
        }),
      }),
    };
    await expect(
      updateNewsIfCurrent(
        { from: () => ({ update: () => query }) },
        "article",
        VERSION,
        {},
      ),
    ).rejects.toThrow("permission denied");
  });
});
