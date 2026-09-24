import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import {
  contentOfferArguments,
  contentOfferCopy,
  parseContentOffer,
} from "../contentOfferRouting";

const id = "00000000-0000-4000-8000-000000000001";
const resolved = {
  route_id: id,
  offer_id: id,
  scope: "page" as const,
  slug: "follow-up-kit",
  title: "Follow-up kit",
  summary: "A useful next step",
  kind: "free" as const,
  headline: "",
  subtext: "",
  button_text: "",
};
describe("content offer routing boundary", () => {
  it("uses explicit content identity and metadata", () => {
    expect(
      contentOfferArguments({
        pageId: id,
        pageType: "post",
        contentTypeSlug: "ai-tools",
        nicheSlug: "landscaping",
      }),
    ).toEqual({
      _page_key: `post:${id}`,
      _content_type_slug: "ai-tools",
      _niche_slug: "landscaping",
    });
  });
  it("ignores unsupported page identities and malformed topic keys", () => {
    expect(
      contentOfferArguments({
        pageId: "private",
        pageType: "admin",
        contentTypeSlug: "//evil.test",
        nicheSlug: "Industry Name",
      }),
    ).toEqual({ _page_key: null, _content_type_slug: null, _niche_slug: null });
  });
  it("allows listing pages to use metadata and defaults without inventing IDs", () => {
    expect(
      contentOfferArguments({
        pageType: "content-type-list",
        contentTypeSlug: "ai-tools",
      })._content_type_slug,
    ).toBe("ai-tools");
    expect(
      contentOfferArguments({ pageType: "resources-index" })._page_key,
    ).toBeNull();
  });
  it("rejects unsafe offer slugs and malformed response data", () => {
    for (const slug of [
      "//evil.test",
      "../admin",
      "a?email=secret",
      "javascript:alert(1)",
    ]) {
      expect(parseContentOffer({ ...resolved, slug })).toBeNull();
    }
    expect(parseContentOffer(null)).toBeNull();
    expect(parseContentOffer({ ...resolved, offer_id: "bogus" })).toBeNull();
  });
  it("derives the internal URL and preserves the incoming acquisition source", () => {
    const copy = contentOfferCopy(parseContentOffer(resolved)!);
    expect(copy).toEqual({
      href: "/offers/follow-up-kit",
      headline: "Follow-up kit",
      subtext: "A useful next step",
      buttonText: "Get the free resource",
    });
    expect(copy.href).not.toContain("utm_");
  });
  it("uses editor copy and a neutral paid offer default without borrowed social proof", () => {
    expect(
      contentOfferCopy({
        ...resolved,
        kind: "paid",
        headline: "Put this into practice",
        subtext: " Try the workshop ",
      }),
    ).toMatchObject({
      headline: "Put this into practice",
      subtext: "Try the workshop",
      buttonText: "Explore this offer",
    });
  });
});
