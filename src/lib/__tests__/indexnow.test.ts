import { describe, expect, it, vi } from "vitest";
import {
  checkIndexNowKeyFile,
  indexNowEarlyExitRow,
  indexNowKeyLocation,
  indexNowReceipt,
  indexNowSiteOrigin,
  INDEXNOW_RECEIVED_STATUSES,
  isValidIndexNowKey,
  resolveIndexNowKey,
  validateIndexNowUrls,
} from "../../../supabase/functions/_shared/indexnow";

const KEY = "0123456789abcdef0123456789abcdef";

describe("IndexNow key handling", () => {
  it("accepts only IndexNow-shaped keys", () => {
    expect(isValidIndexNowKey(KEY)).toBe(true);
    expect(isValidIndexNowKey("abc-DEF-12")).toBe(true);
    expect(isValidIndexNowKey("short")).toBe(false);
    expect(isValidIndexNowKey("../../etc/passwd")).toBe(false);
    expect(isValidIndexNowKey("a".repeat(129))).toBe(false);
    expect(isValidIndexNowKey(null)).toBe(false);
  });

  it("prefers the stored key and falls back to the env secret", () => {
    expect(resolveIndexNowKey(KEY, "envkey12345")).toEqual({
      key: KEY,
      source: "settings",
    });
    expect(resolveIndexNowKey(null, "envkey12345")).toEqual({
      key: "envkey12345",
      source: "env",
    });
    expect(resolveIndexNowKey("bad", "also bad")).toEqual({
      key: null,
      source: null,
    });
  });

  it("puts the key file at the site root", () => {
    expect(indexNowKeyLocation("https://brianhanson.com", KEY)).toBe(
      `https://brianhanson.com/${KEY}.txt`,
    );
  });
});

describe("site origin", () => {
  it("returns the https origin or a plain-English problem", () => {
    expect(indexNowSiteOrigin("https://brianhanson.com/")).toEqual({
      origin: "https://brianhanson.com",
      host: "brianhanson.com",
    });
    expect(indexNowSiteOrigin("")).toEqual({
      problem: "Add your Site URL in Brand & publishing before submitting.",
    });
    expect(indexNowSiteOrigin("brianhanson.com")).toMatchObject({
      problem: expect.stringMatching(/https/),
    });
    expect(indexNowSiteOrigin("http://brianhanson.com")).toMatchObject({
      problem: expect.stringMatching(/https/),
    });
  });
});

describe("key file check", () => {
  const location = `https://brianhanson.com/${KEY}.txt`;
  it("passes only when the served body is exactly the key", async () => {
    const ok = vi.fn(async () => new Response(`${KEY}\n`, { status: 200 }));
    await expect(checkIndexNowKeyFile(ok, location, KEY)).resolves.toEqual({
      ok: true,
    });
    expect(ok).toHaveBeenCalledWith(location, expect.any(Object));
  });
  it("reports a 404, a wrong body and a network failure", async () => {
    await expect(
      checkIndexNowKeyFile(
        async () => new Response("nope", { status: 404 }),
        location,
        KEY,
      ),
    ).resolves.toEqual({
      ok: false,
      detail: `The key file at ${location} returned HTTP 404.`,
    });
    await expect(
      checkIndexNowKeyFile(
        async () => new Response("<html>", { status: 200 }),
        location,
        KEY,
      ),
    ).resolves.toEqual({
      ok: false,
      detail: `The key file at ${location} does not contain the IndexNow key.`,
    });
    await expect(
      checkIndexNowKeyFile(
        async () => {
          throw new Error("dns");
        },
        location,
        KEY,
      ),
    ).resolves.toEqual({
      ok: false,
      detail: `The key file at ${location} could not be reached.`,
    });
  });
});

describe("early-exit log rows", () => {
  it("records the failure so the admin card and dashboard can show it", () => {
    expect(
      indexNowEarlyExitRow(
        "https://brianhanson.com",
        "IndexNow key missing",
        "2026-09-23T08:00:00.000Z",
      ),
    ).toEqual({
      page_id: null,
      page_url: "https://brianhanson.com",
      status: "error",
      method: "indexnow",
      error_message: "IndexNow key missing",
      submitted_at: "2026-09-23T08:00:00.000Z",
    });
    expect(
      indexNowEarlyExitRow(null, "x".repeat(900), "2026-09-23T08:00:00.000Z")
        .page_url,
    ).toBe("(site URL not configured)");
    expect(
      indexNowEarlyExitRow(null, "x".repeat(900), "2026-09-23T08:00:00.000Z")
        .error_message,
    ).toHaveLength(500);
  });
});

describe("receipts", () => {
  it("treats 200 and 202 as received and never resubmits them", () => {
    expect(indexNowReceipt(200)).toBe("indexnow_submitted");
    expect(indexNowReceipt(202)).toBe("indexnow_pending");
    expect(indexNowReceipt(403)).toBe("error");
    expect(INDEXNOW_RECEIVED_STATUSES).toEqual([
      "indexnow_submitted",
      "indexnow_pending",
    ]);
  });
  it("keeps same-origin URL validation", () => {
    expect(
      validateIndexNowUrls(["/blog/a#x"], "https://brianhanson.com"),
    ).toEqual(["https://brianhanson.com/blog/a"]);
    expect(() =>
      validateIndexNowUrls(
        ["https://evil.example/"],
        "https://brianhanson.com",
      ),
    ).toThrow(/origin/);
  });
});
