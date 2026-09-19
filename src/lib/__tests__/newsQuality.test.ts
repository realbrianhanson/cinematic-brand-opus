import { describe, expect, it } from "vitest";
import {
  newsUrlIdentity,
  uniqueNewsItems,
  newsFeedIssue,
  newsSourceLabel,
  isReadableNewsHeadline,
  newsImportNeedsLanguageReview,
} from "../../../supabase/functions/_shared/newsQuality";

const story = {
  id: "first",
  title: "Google launches a new scheduling tool for contractors",
  url: "https://www.example.com/news/story/?utm_source=email#read",
  source_name: "Perplexity Daily — AI tools",
  topic_lane: "ai_tools",
  raw_excerpt: "The scheduling update is available to small businesses.",
};

describe("news editorial safeguards", () => {
  it("identifies tracking, fragment and AMP variants without removing article IDs", () => {
    expect(newsUrlIdentity(story.url)).toBe("example.com/news/story");
    expect(newsUrlIdentity("https://example.com/amp/news/story/")).toBe(
      "example.com/news/story",
    );
    expect(newsUrlIdentity("https://example.com/news/story/amp")).toBe(
      "example.com/news/story",
    );
    expect(newsUrlIdentity("https://example.com/amp-123.html")).toBe(
      "example.com/123.html",
    );
    expect(
      newsUrlIdentity("https://example.com/detail?id=12&lang=en"),
    ).not.toBe(newsUrlIdentity("https://example.com/detail?id=13&lang=en"));
  });
  it("removes repeated headlines across publishers and pages without rewriting destinations", () => {
    const result = uniqueNewsItems([
      story,
      {
        ...story,
        id: "second",
        url: "https://another.com/report",
        title: "Google launches a new scheduling tool for contractors!",
      },
      {
        ...story,
        id: "third",
        url: "https://example.com/news/story/amp",
        title: "The same report has a different title",
      },
      {
        ...story,
        id: "fourth",
        url: "https://example.com/new",
        title: "Google changes the pricing for its scheduling tool",
      },
    ]);
    expect(result.map((row) => row.id)).toEqual(["first", "fourth"]);
    expect(result[0].url).toBe(story.url);
  });
  it("keeps different substantive product versions and developments", () => {
    expect(
      uniqueNewsItems([
        {
          ...story,
          title: "A company launches model 5.1 for customer support",
        },
        {
          ...story,
          id: "new",
          url: "https://example.com/v2",
          title: "A company launches model 5.2 for customer support",
        },
      ]),
    ).toHaveLength(2);
  });
  it("holds obviously non-English/imported headlines and generic aggregator noise", () => {
    expect(
      isReadableNewsHeadline(
        "徐汇企业MiniMax多款产品纳入新加坡国民AI技能培训计划",
      ),
    ).toBe(false);
    expect(
      newsFeedIssue({
        ...story,
        title: "An executive addresses an international security council",
        raw_excerpt:
          "The address concerns international coordination of AI safety.",
      }),
    ).toContain("business owners");
    expect(
      newsImportNeedsLanguageReview(
        "Devoteam bentuk tim khusus percepat adopsi agentic AI perusahaan",
      ),
    ).toBe(true);
    expect(newsFeedIssue(story)).toBeNull();
  });
  it("does not hide valid published English headlines when a small word list is inconclusive", () => {
    for (const title of [
      "ChatGPT Gets Smarter Overnight",
      "OpenAI GPT-5: Pricing, Limits, Capabilities",
    ]) {
      expect(isReadableNewsHeadline(title)).toBe(true);
      expect(
        newsFeedIssue({ ...story, title, source_name: "Original publisher" }),
      ).toBeNull();
      expect(newsFeedIssue({ ...story, title })).toBeNull();
    }
    // Automated language uncertainty is only a review signal, not a feed ban.
    expect(
      newsImportNeedsLanguageReview(
        "OpenAI GPT-5: Pricing, Limits, Capabilities",
      ),
    ).toBe(true);
  });
  it("does not force Brian's business topics onto custom member lanes or direct publishers", () => {
    const headline = {
      ...story,
      title: "A new study explains developments in dental science",
      raw_excerpt: "The research was published yesterday.",
    };
    expect(newsFeedIssue({ ...headline, topic_lane: "dentistry" })).toBeNull();
    expect(
      newsFeedIssue({ ...headline, source_name: "Dental journal" }),
    ).toBeNull();
  });
  it("attributes the actual linked host without inventing an original publisher", () => {
    expect(newsSourceLabel(story)).toBe("example.com");
    expect(
      newsSourceLabel({ url: "invalid", source_name: "Perplexity Daily" }),
    ).toBe("Original source");
  });
});
