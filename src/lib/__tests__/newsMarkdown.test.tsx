import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderNewsMarkdown, safeHref } from "@/lib/newsMarkdown";

const html = (md: string) => renderToStaticMarkup(<>{renderNewsMarkdown(md)}</>);

describe("safeHref", () => {
  it("allows http, https and mailto", () => {
    expect(safeHref("https://example.com/a?b=c")).toContain("https://example.com/a");
    expect(safeHref("http://example.com")).toContain("http://example.com");
    expect(safeHref("mailto:me@example.com")).toBe("mailto:me@example.com");
  });

  it("allows site-relative paths", () => {
    expect(safeHref("/news/abc")).toBe("/news/abc");
  });

  it("rejects dangerous or ambiguous schemes", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "//evil.example.com",
      "#anchor",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(safeHref(bad as unknown)).toBeNull();
    }
  });

  it("rejects urls carrying quotes, angle brackets or control chars", () => {
    expect(safeHref('https://example.com" onmouseover="alert(1)')).toBeNull();
    expect(safeHref("https://example.com/<script>")).toBeNull();
    expect(safeHref("java\nscript:alert(1)")).toBeNull();
  });
});

describe("renderNewsMarkdown", () => {
  it("renders headings, paragraphs and bold as elements", () => {
    const out = html("## Heading\n\nSome **bold** text.");
    expect(out).toContain("<h2");
    expect(out).toContain("Heading");
    expect(out).toContain("<strong>bold</strong>");
  });

  it("never emits raw HTML from the source markdown", () => {
    const out = html('<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onerror=");
    expect(out).toContain("&lt;script&gt;");
  });

  it("keeps safe links and strips unsafe ones to plain text", () => {
    const out = html("[good](https://example.com) and [bad](javascript:alert(1))");
    expect(out).toContain('href="https://example.com/"');
    expect(out).not.toContain("javascript:");
    expect(out).toContain("bad");
  });

  it("cannot break out of the href attribute", () => {
    const out = html('[x](https://example.com" onclick="alert(1))');
    expect(out).not.toContain("onclick=");
  });

  it("adds noopener/noreferrer to external links", () => {
    const out = html("[good](https://example.com)");
    expect(out).toContain("noopener");
    expect(out).toContain("noreferrer");
  });

  it("returns null for empty or non-string input", () => {
    expect(renderNewsMarkdown("")).toBeNull();
    expect(renderNewsMarkdown(null)).toBeNull();
    expect(renderNewsMarkdown(undefined)).toBeNull();
    expect(renderNewsMarkdown(123)).toBeNull();
  });
});
