import { describe, expect, it, vi } from "vitest";
import { indexNowKeyFileResponse } from "../indexnowKeyFile";

const KEY = "0123456789abcdef0123456789abcdef";

describe("IndexNow key file", () => {
  it("serves the key as plain text when the path matches the stored key", async () => {
    const lookup = vi.fn(async () => KEY);
    const res = await indexNowKeyFileResponse(KEY, lookup);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe(KEY);
    expect(lookup).toHaveBeenCalledWith(KEY);
  });

  it("returns 404 for any other .txt name without querying for junk", async () => {
    const lookup = vi.fn(async () => null);
    const miss = await indexNowKeyFileResponse("somethingelse1", lookup);
    expect(miss.status).toBe(404);
    expect(lookup).toHaveBeenCalledTimes(1);

    const junk = await indexNowKeyFileResponse("../etc/passwd", lookup);
    expect(junk.status).toBe(404);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("does not serve a key that differs from the requested name", async () => {
    const res = await indexNowKeyFileResponse(KEY, async () => "otherkey1234");
    expect(res.status).toBe(404);
  });

  it("fails with 503 (not 404) when the lookup errors, so a check can tell them apart", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await indexNowKeyFileResponse(KEY, async () => {
      throw new Error("db down");
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    spy.mockRestore();
  });
});
