import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleUnsubscribeGet,
  handleUnsubscribePost,
  type UnsubscribeStore,
} from "../newsletterUnsubscribe";

const TOKEN = "3f1c2a9e-8b7d-4c6e-9a5f-1b2c3d4e5f60";
const ENDPOINT = "https://brianhanson.com/api/public/newsletter/unsubscribe";
let store: UnsubscribeStore & {
  siteUrl: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  store = {
    siteUrl: vi.fn(async () => "https://brianhanson.com"),
    unsubscribe: vi.fn(async () => "ok" as const),
  };
});
const post = (
  query: string,
  body: BodyInit | null,
  headers: Record<string, string> = {},
) => new Request(`${ENDPOINT}${query}`, { method: "POST", body, headers });

describe("GET never changes a subscription", () => {
  it("shows a confirmation form for a token link", async () => {
    const res = await handleUnsubscribeGet(
      new Request(`${ENDPOINT}?token=${TOKEN}`),
      store,
    );
    expect(res.status).toBe(200);
    expect(store.unsubscribe).not.toHaveBeenCalled();
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const html = await res.text();
    expect(html).toContain(
      '<form method="post" action="/api/public/newsletter/unsubscribe">',
    );
    expect(html).toContain(`name="token" value="${TOKEN}"`);
    expect(html).toContain("Confirm unsubscribe");
    expect(html).toContain('href="https://brianhanson.com"');
  });

  it.each(["", "?token=", "?token=not-a-uuid", "?token=%3Cscript%3E"])(
    "redirects %s to the neutral result page without a lookup",
    async (query) => {
      const res = await handleUnsubscribeGet(
        new Request(`${ENDPOINT}${query}`),
        store,
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe(
        "https://brianhanson.com/newsletter/unsubscribed",
      );
      expect(store.unsubscribe).not.toHaveBeenCalled();
    },
  );

  it("reports an unconfigured site", async () => {
    store.siteUrl.mockResolvedValue(null);
    const res = await handleUnsubscribeGet(
      new Request(`${ENDPOINT}?token=${TOKEN}`),
      store,
    );
    expect(res.status).toBe(503);
  });
});

describe("POST unsubscribes", () => {
  it("handles the confirmation form and redirects the browser", async () => {
    const res = await handleUnsubscribePost(
      post("", new URLSearchParams({ token: TOKEN })),
      store,
    );
    expect(store.unsubscribe).toHaveBeenCalledWith(TOKEN);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://brianhanson.com/newsletter/unsubscribed",
    );
  });

  it("supports RFC 8058 one-click (urlencoded)", async () => {
    const res = await handleUnsubscribePost(
      post(`?token=${TOKEN}`, "List-Unsubscribe=One-Click", {
        "content-type": "application/x-www-form-urlencoded",
      }),
      store,
    );
    expect(store.unsubscribe).toHaveBeenCalledWith(TOKEN);
    expect(res.status).toBe(200);
    expect(store.siteUrl).not.toHaveBeenCalled();
  });

  it("supports RFC 8058 one-click (multipart)", async () => {
    const form = new FormData();
    form.set("List-Unsubscribe", "One-Click");
    const res = await handleUnsubscribePost(
      post(`?token=${TOKEN}`, form),
      store,
    );
    expect(store.unsubscribe).toHaveBeenCalledWith(TOKEN);
    expect(res.status).toBe(200);
  });

  it("rejects oversized bodies", async () => {
    const res = await handleUnsubscribePost(
      post(`?token=${TOKEN}`, "x=".padEnd(10_000, "a"), {
        "content-type": "application/x-www-form-urlencoded",
      }),
      store,
    );
    expect(res.status).toBe(413);
    expect(store.unsubscribe).not.toHaveBeenCalled();
  });

  it("does not look up malformed tokens", async () => {
    const browser = await handleUnsubscribePost(
      post("", new URLSearchParams({ token: "junk" })),
      store,
    );
    expect(browser.status).toBe(303);
    const oneClick = await handleUnsubscribePost(
      post("?token=junk", "List-Unsubscribe=One-Click", {
        "content-type": "application/x-www-form-urlencoded",
      }),
      store,
    );
    expect(oneClick.status).toBe(400);
    expect(store.unsubscribe).not.toHaveBeenCalled();
  });

  it("surfaces a database failure as temporary", async () => {
    store.unsubscribe.mockResolvedValue("error");
    const res = await handleUnsubscribePost(
      post("", new URLSearchParams({ token: TOKEN })),
      store,
    );
    expect(res.status).toBe(503);
  });
});
