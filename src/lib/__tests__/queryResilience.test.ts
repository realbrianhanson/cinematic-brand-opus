import { describe, expect, it } from "vitest";
import {
  isTransientError,
  MAX_QUERY_RETRIES,
  mutationErrorToast,
  queryRetry,
  queryRetryDelay,
  shouldToastMutationError,
} from "../queryResilience";

describe("isTransientError", () => {
  it.each([
    ["schema cache reload", { code: "PGRST002", message: "Could not query" }],
    ["pool connection error", { code: "PGRST001", message: "x" }],
    ["database shutting down", { code: "57P03", message: "shutting down" }],
    ["connection exception", { code: "08006", message: "connection failure" }],
    ["too many connections", { code: "53300", message: "too many" }],
    ["HTTP 503 status", { status: 503, message: "Service Unavailable" }],
    ["HTTP 429 status", { status: 429, message: "Too many requests" }],
    [
      "edge function 502",
      { name: "FunctionsHttpError", context: { status: 502 }, message: "x" },
    ],
    ["edge function fetch error", { name: "FunctionsFetchError", message: "" }],
    ["browser network error", new TypeError("Failed to fetch")],
    ["safari network error", new TypeError("Load failed")],
    [
      "postgrest network mapping",
      { code: "", message: "TypeError: fetch failed" },
    ],
    [
      "gateway html body",
      { message: "<html><title>502 Bad Gateway</title></html>" },
    ],
    [
      "envoy upstream",
      { message: "upstream connect error or disconnect/reset before headers" },
    ],
  ])("retries %s", (_label, error) => {
    expect(isTransientError(error)).toBe(true);
  });

  it.each([
    ["RLS denial", { code: "42501", message: "permission denied" }],
    ["JWT expired", { code: "PGRST301", message: "JWT expired" }],
    ["not found", { code: "PGRST116", message: "no rows" }],
    ["optimistic concurrency", { code: "40001", message: "changed elsewhere" }],
    ["unique violation", { code: "23505", message: "duplicate key" }],
    ["HTTP 404", { status: 404, message: "Not found" }],
    ["plain bug", new Error("Cannot read properties of undefined")],
    ["abort", Object.assign(new Error("aborted"), { name: "AbortError" })],
    ["string", "503"],
    ["null", null],
    [
      "coded message mentioning 503",
      { code: "P0001", message: "Quota of 503 reached" },
    ],
  ])("does not retry %s", (_label, error) => {
    expect(isTransientError(error)).toBe(false);
  });
});

describe("queryRetry", () => {
  const transient = { code: "PGRST002", message: "schema cache" };
  it("retries transient errors up to the limit", () => {
    for (let n = 0; n < MAX_QUERY_RETRIES; n++)
      expect(queryRetry(n, transient)).toBe(true);
    expect(queryRetry(MAX_QUERY_RETRIES, transient)).toBe(false);
  });
  it("never retries permanent errors", () => {
    expect(queryRetry(0, { code: "42501", message: "denied" })).toBe(false);
  });
});

describe("queryRetryDelay", () => {
  it("backs off exponentially with bounded jitter and a cap", () => {
    expect(queryRetryDelay(0, () => 0)).toBe(500);
    expect(queryRetryDelay(1, () => 0)).toBe(1000);
    expect(queryRetryDelay(2, () => 0)).toBe(2000);
    expect(queryRetryDelay(10, () => 0)).toBe(8000);
    expect(queryRetryDelay(0, () => 0.999)).toBeLessThan(750);
    expect(queryRetryDelay(10, () => 0.999)).toBeLessThanOrEqual(8250);
  });
});

describe("shouldToastMutationError", () => {
  it("toasts a mutation without its own onError", () => {
    expect(shouldToastMutationError({ options: {} })).toBe(true);
  });
  it("leaves mutations that handle their own errors alone", () => {
    expect(shouldToastMutationError({ options: { onError: () => {} } })).toBe(
      false,
    );
  });
  it("honours an explicit opt-out in meta", () => {
    expect(
      shouldToastMutationError({ options: {}, meta: { errorToast: false } }),
    ).toBe(false);
  });
});

describe("mutationErrorToast", () => {
  it("uses the friendly error text and a destructive variant", () => {
    const t = mutationErrorToast(
      { code: "23505", message: 'duplicate key "x"' },
      undefined,
    );
    expect(t.variant).toBe("destructive");
    expect(t.title).toBe("That change was not saved");
    expect(t.description).toMatch(/already in use/);
  });
  it("uses a custom title from meta", () => {
    expect(
      mutationErrorToast(new Error("boom"), { errorTitle: "Could not publish" })
        .title,
    ).toBe("Could not publish");
  });
  it("tells the admin to retry when the backend was briefly unavailable", () => {
    expect(
      mutationErrorToast({ code: "PGRST002", message: "schema cache" }, {})
        .description,
    ).toMatch(/temporarily unavailable/i);
  });
});
