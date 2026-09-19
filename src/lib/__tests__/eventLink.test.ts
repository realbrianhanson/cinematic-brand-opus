import { describe, expect, it } from "vitest";
import { linkifyEventMentions } from "../../../supabase/functions/_shared/eventLink";

const summit = "https://go.aiforbusiness.com/summit?_go=brian60";

describe("event links respect site ownership", () => {
  const text = "Join the free 3-day virtual AI training.";
  it("preserves the configured original event", () => {
    expect(
      linkifyEventMentions(text, "https://aiforbeginners.com/?via=blog"),
    ).toContain("](https://aiforbeginners.com/?via=blog)");
  });
  it("does not insert owner event links into a member's unrelated offer", () => {
    for (const url of [
      null,
      "",
      "https://cedar.example.com/contact",
      "javascript:alert(1)",
    ]) {
      expect(linkifyEventMentions(text, url)).toBe(text);
    }
  });

  it.each([
    "http://go.aiforbusiness.com/summit?_go=brian60",
    "https://go.aiforbusiness.com/core?_go=brian60",
    "https://go.aiforbusiness.com/summit/other",
    "https://go.aiforbusiness.com/summit/",
    "https://go.aiforbusiness.com/summit-offer",
    "https://core.aiforbusiness.com/summit",
    "https://go.aiforbusiness.com.example.com/summit",
    "https://go.aiforbusiness.com:8443/summit",
    "https://person@go.aiforbusiness.com/summit",
  ])("does not link the unrelated or noncanonical destination %s", (url) => {
    const body = "Join the free 3-day AI summit.";
    expect(linkifyEventMentions(body, url)).toBe(body);
  });
});

describe("confirmed Summit links", () => {
  it("links Summit phrases in markdown with the exact tracking parameter", () => {
    expect(
      linkifyEventMentions(
        "Join the free 3-day AI summit. Explore the AI for Business Summit.",
        summit,
      ),
    ).toBe(
      `Join the [free 3-day AI summit](${summit}). Explore the [AI for Business Summit](${summit}).`,
    );
  });

  it("links HTML once per phrase without nesting and preserves tracking", () => {
    const body = "<p>Join the free 3-day AI summit.</p>";
    const linked = linkifyEventMentions(body, summit);
    expect(linked).toBe(
      `<p>Join the <a href="${summit}" target="_blank" rel="noopener">free 3-day AI summit</a>.</p>`,
    );
    expect(linkifyEventMentions(linked, summit)).toBe(linked);
  });

  it("preserves existing HTML and markdown links to other destinations", () => {
    const body =
      '<a href="https://example.com/details">AI for Business Summit</a> ' +
      "[free 3-day AI summit](https://aiforbeginners.com/)";
    expect(linkifyEventMentions(body, summit)).toBe(body);
  });

  it("respects the link limit and remains unchanged on a second pass", () => {
    const body =
      "AI for Business Summit. Free 3-day AI summit. Three-day virtual AI training.";
    const linked = linkifyEventMentions(body, summit, { maxLinks: 1 });
    expect(linked).toBe(
      `[AI for Business Summit](${summit}). Free 3-day AI summit. Three-day virtual AI training.`,
    );
    expect(linkifyEventMentions(linked, summit, { maxLinks: 1 })).toBe(linked);
  });

  it("does not alter HTML attributes or change surrounding HTML into markdown", () => {
    const body =
      '<p title="AI for Business Summit"><a href="https://example.com">Existing link</a> Join the AI for Business Summit.</p>';
    expect(linkifyEventMentions(body, summit)).toBe(
      `<p title="AI for Business Summit"><a href="https://example.com">Existing link</a> Join the <a href="${summit}" target="_blank" rel="noopener">AI for Business Summit</a>.</p>`,
    );
  });

  it("escapes HTML query separators while preserving all tracking values", () => {
    const tracked = `${summit}&utm_source=blog`;
    const linked = linkifyEventMentions(
      "<p>AI for Business Summit</p>",
      tracked,
    );
    expect(linked).toContain('?_go=brian60&amp;utm_source=blog"');
    expect(linkifyEventMentions(linked, tracked)).toBe(linked);
  });

  it.each(['"', "'"])(
    "preserves > inside %s-quoted attributes and existing anchors",
    (quote) => {
      const open = `<p title=${quote}More > AI for Business Summit${quote}>`;
      const anchor = `<a title=${quote}More > AI for Business Summit${quote} href="https://example.com">AI for Business Summit</a>`;
      expect(
        linkifyEventMentions(
          `${open}${anchor} Join the AI for Business Summit.</p>`,
          summit,
        ),
      ).toBe(
        `${open}${anchor} Join the <a href="${summit}" target="_blank" rel="noopener">AI for Business Summit</a>.</p>`,
      );
    },
  );
});
