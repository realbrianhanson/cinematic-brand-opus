// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readBoundedJson } from "../../../supabase/functions/_shared/boundedJson";
describe("bounded request JSON", () => {
  it("decodes UTF-8 split between chunks", async () => {
    const bytes = new TextEncoder().encode('{"name":"é"}');
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(bytes.slice(0, 10));
        c.enqueue(bytes.slice(10));
        c.close();
      },
    });
    const req = new Request("https://example.com", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await readBoundedJson(req)).toEqual({ name: "é" });
  });
  it("cancels an oversized stream before reading the full body", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(1025));
      },
      cancel,
    });
    const req = new Request("https://example.com", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await readBoundedJson(req)).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(["[]", "null", '"string"', "{bad"])(
    "rejects a non-object payload %s",
    async (body) => {
      expect(
        await readBoundedJson(
          new Request("https://example.com", { method: "POST", body }),
        ),
      ).toBeNull();
    },
  );
  it("bounds bytes rather than UTF-16 character length", async () => {
    expect(
      await readBoundedJson(
        new Request("https://example.com", {
          method: "POST",
          body: JSON.stringify({ name: "é".repeat(1020) }),
        }),
      ),
    ).toBeNull();
  });
});
