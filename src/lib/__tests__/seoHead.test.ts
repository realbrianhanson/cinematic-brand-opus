import { describe, expect, it } from "vitest";
import { buildPageHead, compactJsonLd } from "@/lib/seoHead";

const find = (
  meta: Array<Record<string, unknown>>,
  key: "name" | "property",
  value: string,
) => meta.find((m) => m[key] === value);

describe("buildPageHead", () => {
  it("emits title, description, canonical and social tags", () => {
    const head = buildPageHead({
      title: "A Post",
      description: "What it says.",
      url: "https://brianhanson.com/blog/a-post",
    });
    expect(head.meta?.[0]).toEqual({ title: "A Post" });
    expect(find(head.meta ?? [], "name", "description")?.content).toBe(
      "What it says.",
    );
    expect(find(head.meta ?? [], "property", "og:title")?.content).toBe(
      "A Post",
    );
    expect(find(head.meta ?? [], "property", "og:url")?.content).toBe(
      "https://brianhanson.com/blog/a-post",
    );
    expect(head.links?.some((l) => l.rel === "canonical")).toBe(true);
  });

  it("omits share images that are not absolute https urls", () => {
    const head = buildPageHead({
      title: "T",
      description: "D",
      url: "https://brianhanson.com/x",
      image: "/assets/hero.jpg",
    });
    expect(find(head.meta ?? [], "property", "og:image")).toBeUndefined();
    expect(find(head.meta ?? [], "name", "twitter:image")).toBeUndefined();
  });

  it("passes robots directives through", () => {
    const head = buildPageHead({
      title: "T",
      description: "D",
      url: "https://brianhanson.com/news",
      robots: "noindex, follow",
    });
    expect(find(head.meta ?? [], "name", "robots")?.content).toBe(
      "noindex, follow",
    );
  });
});

describe("compactJsonLd", () => {
  it("drops empty blocks", () => {
    expect(compactJsonLd([{ a: 1 }, null, undefined, { d: "x" }])).toEqual([
      { a: 1 },
      { d: "x" },
    ]);
  });
});
