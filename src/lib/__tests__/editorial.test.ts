import { describe, it, expect, vi, afterEach } from "vitest";
import {
  chooseTitlePair,
  editorialWarnings,
} from "../../../supabase/functions/_shared/editorial";
import { collectEvidence } from "../../../supabase/functions/_shared/editorialEvidence";
import {
  chooseVisualStyle,
  validImageReview,
  generateFeaturedImage,
} from "../../../supabase/functions/_shared/featuredImage";
import { scorePost } from "../../../supabase/functions/_shared/voice";
afterEach(() => vi.unstubAllGlobals());
describe("editorial safeguards", () => {
  it("does not reward padding, a year, or unnecessary FAQs", () => {
    const post = {
      title: "Measure event profit",
      content:
        "<p>Subtract event costs from attributed contribution before comparing events.</p>",
      excerpt: "A simple measurement workflow.",
    };
    expect(scorePost(post).score).toBe(100);
    expect(
      scorePost({
        ...post,
        title: post.title + " 2026",
        faq_items: [{}, {}, {}],
      }).score,
    ).toBe(100);
    expect(scorePost({ ...post, content: "" }).score).toBeLessThan(85);
  });
  it("prefers distinct constructions and handles one-to-one SEO joins", () => {
    const result = chooseTitlePair(
      {
        title: "Stop Guessing Your Sales",
        meta_title: "AI Sales: Stop Guessing",
        title_candidates: [
          {
            title: "A sales brief your team can check",
            meta_title: "Create a Sales Research Brief",
          },
        ],
      },
      [
        {
          title: "Stop Guessing Your Content",
          seo_metadata: { meta_title: "AI Sales: A Guide" },
        },
      ],
    );
    expect(result.title).toBe("A sales brief your team can check");
    expect(editorialWarnings({ title: "Double Your Sales" }, [])).toContain(
      "Review the unsupported outcome promise in the headline",
    );
  });
  it("retrieves evidence once per source and reports unavailable pages", async () => {
    const read = vi.fn(async (url: string) =>
      url.includes("good") ? "Supporting passage. ".repeat(30) : "",
    );
    const result = await collectEvidence(
      [
        { url: "https://good.test/a" },
        { url: "https://good.test/a" },
        { url: "https://missing.test/a" },
      ],
      read,
    );
    expect(read).toHaveBeenCalledTimes(2);
    expect(result.sources).toHaveLength(1);
    expect(result.context).toContain("Supporting passage");
    expect(result.missing).toEqual(["https://missing.test/a"]);
  });
  it("rotates away from recent composition families and rejects unreviewed artwork", () => {
    expect(
      chooseVisualStyle("topic", ["object_study", "object_study"]),
    ).not.toBe("object_study");
    expect(
      validImageReview({ approved: false, alt: "An object on a table" }),
    ).toBe(false);
    expect(validImageReview({ approved: true, alt: "" })).toBe(false);
  });
  it("does not upload a rejected cover or reuse the draft's invented alt text", async () => {
    const upload = vi.fn();
    type Query = {
      select: () => Query;
      not: () => Query;
      order: () => Query;
      limit: () => Promise<{ data: never[]; error: null }>;
    };
    const query: Query = {
      select: () => query,
      not: () => query,
      order: () => query,
      limit: async () => ({ data: [], error: null }),
    };
    const db = { from: () => query, storage: { from: () => ({ upload }) } };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            choices: [
              {
                message: {
                  images: [
                    { image_url: { url: "data:image/png;base64,aGVsbG8=" } },
                  ],
                },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    approved: false,
                    alt: "A generic woman at a laptop",
                  }),
                },
              },
            ],
          }),
        ),
    );
    expect(
      await generateFeaturedImage("Title", "Context", "test", db),
    ).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });
});
