import { describe, expect, it } from "vitest";
import { legacyRedirect } from "@/lib/legacyRedirects";

describe("reviewed legacy entrances", () => {
  it.each([
    ["/my-story", "/#story"],
    ["/my-story/", "/#story"],
    ["/case-studies", "/#testimonials"],
    ["/case-studies/", "/#testimonials"],
  ])("permanently redirects %s to its current section", (path, location) => {
    const response = legacyRedirect(
      new Request(`https://brianhanson.com${path}`),
    );
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe(location);
  });

  it("keeps campaign parameters without interpreting a redirect query", () => {
    const response = legacyRedirect(
      new Request(
        "https://brianhanson.com/my-story?utm_source=email&next=https%3A%2F%2Fevil.example",
      ),
    );
    expect(response?.headers.get("location")).toBe(
      "/?utm_source=email&next=https%3A%2F%2Fevil.example#story",
    );
  });

  it("supports HEAD without redirecting POST data", () => {
    expect(
      legacyRedirect(
        new Request("https://brianhanson.com/my-story", { method: "HEAD" }),
      )?.status,
    ).toBe(308);
    expect(
      legacyRedirect(
        new Request("https://brianhanson.com/my-story", {
          method: "POST",
          body: "private",
        }),
      ),
    ).toBeNull();
  });

  it.each([
    "https://member.example/my-story",
    "https://brianhanson.com.evil.example/my-story",
    "https://brianhanson.com/case-studies/tlc-total-lawn-care-case-study/header-bg-2",
    "https://brianhanson.com/social-media",
    "https://brianhanson.com/admin",
    "https://brianhanson.com/offers/ai-follow-up-starter-kit",
  ])("leaves unrelated and unmapped requests alone: %s", (url) => {
    expect(legacyRedirect(new Request(url))).toBeNull();
  });
});
