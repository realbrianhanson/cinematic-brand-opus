import { describe, expect, it } from "vitest";
import {
  deleteErrorMessage,
  describeContentTypeDelete,
  describeNicheDelete,
  mergeNicheContext,
} from "../adminDependents";

describe("mergeNicheContext", () => {
  it("keeps context keys the form does not know about", () => {
    const original = {
      audience: "old",
      target_keyword: "AI training for wholesalers",
      content_focus: "deal flow",
    };
    const merged = mergeNicheContext(original, { audience: "new" });
    expect(merged).toEqual({
      audience: "new",
      target_keyword: "AI training for wholesalers",
      content_focus: "deal flow",
    });
  });

  it("does not mutate the original context", () => {
    const original = Object.freeze({ audience: "old", content_focus: "f" });
    const merged = mergeNicheContext(original, { audience: "new" });
    expect(original).toEqual({ audience: "old", content_focus: "f" });
    expect(merged).not.toBe(original);
  });

  it("treats a missing or non-object original as empty", () => {
    expect(mergeNicheContext(null, { audience: "a" })).toEqual({
      audience: "a",
    });
    expect(mergeNicheContext(["x"], { audience: "a" })).toEqual({
      audience: "a",
    });
    expect(mergeNicheContext("text", { audience: "a" })).toEqual({
      audience: "a",
    });
  });

  it("lets the form overwrite a known key, including target_keyword", () => {
    expect(
      mergeNicheContext(
        { target_keyword: "old kw", content_focus: "f" },
        { target_keyword: "new kw" },
      ),
    ).toEqual({ target_keyword: "new kw", content_focus: "f" });
  });
});

describe("describeNicheDelete", () => {
  it("blocks the delete when generated pages use the niche", () => {
    const d = describeNicheDelete("Dentists", {
      generated: 12,
      pillars: 1,
      children: 0,
    });
    expect(d.blocked).toBe(true);
    expect(d.message).toContain("12 generated pages");
    expect(d.message).toContain("can't be deleted");
    expect(d.message).not.toMatch(/orphan/i);
  });

  it("uses singular wording for one page", () => {
    const d = describeNicheDelete("Dentists", {
      generated: 1,
      pillars: 0,
      children: 0,
    });
    expect(d.message).toContain("1 generated page,");
  });

  it("allows the delete and states what gets unlinked", () => {
    const d = describeNicheDelete("Dentists", {
      generated: 0,
      pillars: 2,
      children: 3,
    });
    expect(d.blocked).toBe(false);
    expect(d.message).toContain("2 topic guides will be unlinked");
    expect(d.message).toContain("3 sub-niches will no longer have a parent");
    expect(d.message).toContain("cannot be undone");
  });

  it("allows a plain delete when nothing depends on the niche", () => {
    const d = describeNicheDelete("Dentists", {
      generated: 0,
      pillars: 0,
      children: 0,
    });
    expect(d).toEqual({
      blocked: false,
      message: "This cannot be undone.",
    });
  });
});

describe("describeContentTypeDelete", () => {
  it("blocks the delete when generated pages use the format", () => {
    const d = describeContentTypeDelete(7);
    expect(d.blocked).toBe(true);
    expect(d.message).toContain("7 generated pages use this format");
    expect(d.message).not.toMatch(/will not be deleted/i);
  });

  it("allows the delete when no page uses the format", () => {
    expect(describeContentTypeDelete(0)).toEqual({
      blocked: false,
      message:
        "No generated pages use this format. Deleting it cannot be undone.",
    });
  });
});

describe("deleteErrorMessage", () => {
  it("turns a foreign-key violation into plain English", () => {
    const err = {
      code: "23503",
      message:
        'update or delete on table "niches" violates foreign key constraint "generated_pages_niche_id_fkey"',
    };
    const msg = deleteErrorMessage(err, "niche");
    expect(msg).toContain("still used by other content");
    expect(msg).not.toContain("violates");
  });

  it("recognises the FK violation from the message when the code is missing", () => {
    const err = new Error(
      'update or delete on table "content_schemas" violates foreign key constraint "x" on table "generated_pages"',
    );
    expect(deleteErrorMessage(err, "content format")).toContain(
      "This content format is still used",
    );
  });

  it("passes other errors through", () => {
    expect(deleteErrorMessage(new Error("Network down"), "niche")).toBe(
      "Network down",
    );
  });
});
