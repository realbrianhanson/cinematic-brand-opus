import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeOfferApi } from "../offers";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));
afterEach(() => {
  vi.useRealTimers();
  invoke.mockReset();
});

describe("bounded offer requests", () => {
  it.each([null, { message: { unexpected: true }, code: 42 }])(
    "retains a useful HTTP failure for malformed error JSON %j",
    async (payload) => {
      invoke.mockResolvedValue({
        data: null,
        error: { context: Response.json(payload, { status: 503 }) },
      });
      await expect(invokeOfferApi({ action: "status" })).rejects.toMatchObject({
        name: "OfferApiError",
        message: "We couldn't complete that request. Please try again.",
        status: 503,
        code: undefined,
      });
    },
  );
  it("bounds a stalled request, aborts its transport, and never retries a mutation automatically", async () => {
    vi.useFakeTimers();
    invoke.mockReturnValue(new Promise(() => {}));
    const body = {
      action: "claim",
      token: "a".repeat(64),
      offer_id: "example",
    };
    const request = invokeOfferApi(body);
    const rejected = expect(request).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(20000);
    await rejected;
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke.mock.calls[0][1].body).toBe(body);
    expect(invoke.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("clears its deadline after success and preserves the response", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue({ data: { accepted: true }, error: null });
    await expect(invokeOfferApi({ action: "recover" })).resolves.toEqual({
      accepted: true,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("reads an unread non-2xx response before aborting and preserves its message and code", async () => {
    vi.useFakeTimers();
    invoke.mockImplementation((_name, { signal }) => {
      const body = new ReadableStream({
        start(stream) {
          let closed = false;
          signal.addEventListener("abort", () => {
            if (!closed) stream.error(new Error("Transport aborted"));
          });
          setTimeout(() => {
            if (signal.aborted) return;
            stream.enqueue(
              new TextEncoder().encode(
                JSON.stringify({
                  message: "Offer window expired",
                  code: "offer_expired",
                }),
              ),
            );
            stream.close();
            closed = true;
          }, 5);
        },
      });
      return Promise.resolve({
        data: null,
        error: { context: new Response(body, { status: 409 }) },
      });
    });
    const result = invokeOfferApi({ action: "claim" });
    const rejected = expect(result).rejects.toMatchObject({
      message: "Offer window expired",
      code: "offer_expired",
      status: 409,
    });
    await vi.advanceTimersByTimeAsync(5);
    await rejected;
    expect(invoke.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("bounds decoding a stalled error response as well as receiving its headers", async () => {
    vi.useFakeTimers();
    invoke.mockImplementation((_name, { signal }) =>
      Promise.resolve({
        data: null,
        error: {
          context: new Response(
            new ReadableStream({
              start(stream) {
                signal.addEventListener("abort", () =>
                  stream.error(new Error("Transport aborted")),
                );
              },
            }),
            { status: 503 },
          ),
        },
      }),
    );
    const rejected = expect(
      invokeOfferApi({ action: "status" }),
    ).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(20000);
    await rejected;
    expect(invoke.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("keeps the HTTP status when an error response body cannot be cloned", async () => {
    const response = Response.json(
      { error: "Already consumed" },
      { status: 409 },
    );
    await response.text();
    invoke.mockResolvedValue({ data: null, error: { context: response } });
    await expect(invokeOfferApi({ action: "claim" })).rejects.toMatchObject({
      name: "OfferApiError",
      status: 409,
    });
  });
});
