import { describe, expect, it } from "vitest";
import { splitArticleHtml } from "../articleSplit";

const para = (n: number) => `<p>${"Word ".repeat(40)}${n}</p>`;

describe("mid-article split", () => {
  it("splits at a top-level boundary near 40% and loses no markup", () => {
    const html = Array.from({ length: 10 }, (_, i) => para(i)).join("");
    const [before, after] = splitArticleHtml(html, 0.4);
    expect(before + after).toBe(html);
    expect(before.match(/<p>/g)).toHaveLength(4);
    expect(after.startsWith("<p>")).toBe(true);
  });

  it("never splits inside a nested element", () => {
    const html =
      para(1) +
      `<blockquote>${para(2)}${para(3)}${para(4)}${para(5)}</blockquote>` +
      para(6) +
      para(7) +
      para(8);
    const [before, after] = splitArticleHtml(html, 0.4);
    expect(before + after).toBe(html);
    const opens = (s: string, tag: string) =>
      (s.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length;
    const closes = (s: string, tag: string) =>
      (s.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
    expect(opens(before, "blockquote")).toBe(closes(before, "blockquote"));
    expect(opens(before, "p")).toBe(closes(before, "p"));
  });

  it("does not separate a heading from its section", () => {
    const html = [
      para(1),
      para(2),
      '<h2 id="a">Section</h2>',
      para(3),
      para(4),
      para(5),
    ].join("");
    const [before] = splitArticleHtml(html, 0.4);
    expect(before.endsWith("</h2>")).toBe(false);
  });

  it("leaves short articles whole", () => {
    const html = para(1) + para(2);
    expect(splitArticleHtml(html)).toEqual([html, ""]);
    expect(splitArticleHtml("")).toEqual(["", ""]);
  });

  it("treats void elements as complete blocks", () => {
    const html = [
      para(1),
      '<img src="a.webp" alt="">',
      para(2),
      "<hr>",
      para(3),
      para(4),
    ].join("");
    const [before, after] = splitArticleHtml(html, 0.5);
    expect(before + after).toBe(html);
    expect(after).not.toBe("");
  });
});
