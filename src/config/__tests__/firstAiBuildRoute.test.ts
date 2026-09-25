import { beforeEach, describe, expect, it, vi } from "vitest";
import { brianPreset } from "@/config/presets/brian";
import { memberPreset } from "@/config/presets/member";
import type { SiteConfig } from "@/config/site";
import type { ShopOffer } from "@/lib/shop";
import type { buildPageHead } from "@/lib/seoHead";

const mocks = vi.hoisted(() => ({ branding: vi.fn(), offers: vi.fn() }));
vi.mock("@/lib/branding.functions", () => ({
  getSiteBranding: mocks.branding,
}));
vi.mock("@/lib/shop.functions", () => ({
  getFirstAiBuildOffers: mocks.offers,
}));
vi.mock("@/pages/FirstAiBuild", () => ({ default: () => null }));
import { Route } from "@/routes/first-ai-build";

type LoaderData = { config: SiteConfig; offers: ShopOffer[] };
const loader = Route.options.loader as () => Promise<LoaderData>;
const head = Route.options.head as (input: {
  loaderData?: LoaderData;
}) => ReturnType<typeof buildPageHead>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.branding.mockResolvedValue(brianPreset);
  mocks.offers.mockResolvedValue([]);
});

describe("first AI build route", () => {
  it("keeps the free planner available without optional offers", async () => {
    await expect(loader()).resolves.toEqual({
      config: brianPreset,
      offers: [],
    });
  });

  it.each([
    memberPreset,
    { ...memberPreset, identity: brianPreset.identity },
    {
      ...brianPreset,
      identity: { ...brianPreset.identity, siteUrl: "https://remix.example" },
    },
  ])("does not expose the owner planner on a member remix", async (config) => {
    mocks.branding.mockResolvedValue(config);
    await expect(loader()).rejects.toMatchObject({ isNotFound: true });
    expect(mocks.offers).not.toHaveBeenCalled();
  });

  it("publishes a canonical and truthful tool description in initial metadata", () => {
    const result = head({ loaderData: { config: brianPreset, offers: [] } });
    expect(result.links).toContainEqual({
      rel: "canonical",
      href: "https://brianhanson.com/first-ai-build",
    });
    expect(result.meta).toContainEqual({
      name: "description",
      content:
        "Choose a business task and get a practical first app plan, a ready-to-copy build prompt, and three tests. Free to use, with no email required.",
    });
    expect(JSON.parse(result.scripts[0].children)).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: "Home", item: "https://brianhanson.com/" },
        {
          name: "Your First AI Build",
          item: "https://brianhanson.com/first-ai-build",
        },
      ],
    });
  });

  it.each([undefined, { config: memberPreset, offers: [] }])(
    "does not advertise an unavailable route to search engines",
    (loaderData) => {
      const result = head({ loaderData });
      expect(result.links).toEqual([]);
      expect(result.meta).toContainEqual({
        name: "robots",
        content: "noindex, nofollow",
      });
    },
  );
});
