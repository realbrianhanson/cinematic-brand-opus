import { describe, expect, it } from "vitest";
import { isUuid, validateNewsRequest, MAX_NEWS_BODY_BYTES } from "@/lib/newsRequest";

const ID = "3f0f8e6c-2f2b-4b8f-9a4e-91d2f4c9c1aa";

describe("isUuid", () => {
  it("accepts a v4 uuid and rejects anything else", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(`${ID}' or 1=1--`)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});

describe("validateNewsRequest", () => {
  it("accepts a well formed body", () => {
    expect(validateNewsRequest(JSON.stringify({ id: ID }))).toEqual({
      ok: true,
      id: ID,
      force: false,
    });
    expect(validateNewsRequest(JSON.stringify({ id: ID, force: true }))).toEqual({
      ok: true,
      id: ID,
      force: true,
    });
  });

  it("coerces non-boolean force to false", () => {
    const r = validateNewsRequest(JSON.stringify({ id: ID, force: "yes" }));
    expect(r).toMatchObject({ ok: true, force: false });
  });

  it("rejects empty, null and malformed json", () => {
    for (const body of ["", "null", "{", "[]", '"str"', "1"]) {
      expect(validateNewsRequest(body)).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("rejects a missing or non-uuid id", () => {
    expect(validateNewsRequest("{}")).toMatchObject({ ok: false, error: "invalid_id" });
    expect(validateNewsRequest(JSON.stringify({ id: "abc" }))).toMatchObject({
      ok: false,
      error: "invalid_id",
    });
  });

  it("rejects oversized bodies before parsing", () => {
    const huge = JSON.stringify({ id: ID, pad: "x".repeat(MAX_NEWS_BODY_BYTES) });
    expect(validateNewsRequest(huge)).toMatchObject({
      ok: false,
      status: 413,
      error: "body_too_large",
    });
  });
});
