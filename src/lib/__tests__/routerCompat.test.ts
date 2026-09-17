import { describe, expect, it } from "vitest";
import { normalizeSearch } from "@/lib/router-compat";

describe("normalizeSearch", () => {
  it("returns an empty string for missing or empty search", () => {
    expect(normalizeSearch(undefined)).toBe("");
    expect(normalizeSearch(null)).toBe("");
    expect(normalizeSearch("")).toBe("");
    expect(normalizeSearch("?")).toBe("");
  });

  it("adds a single leading question mark", () => {
    expect(normalizeSearch("a=1")).toBe("?a=1");
  });

  it("never doubles an existing question mark", () => {
    expect(normalizeSearch("?a=1")).toBe("?a=1");
    expect(normalizeSearch("??a=1")).toBe("?a=1");
  });

  it("parses cleanly with URLSearchParams either way", () => {
    const fromRaw = new URLSearchParams(normalizeSearch("a=1&b=2"));
    const fromPrefixed = new URLSearchParams(normalizeSearch("?a=1&b=2"));
    expect(fromRaw.get("a")).toBe("1");
    expect(fromPrefixed.get("b")).toBe("2");
  });
});
