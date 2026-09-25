import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { brianPreset } from "@/config/presets/brian";
import { memberPreset } from "@/config/presets/member";
import { setupDefaults } from "@/config/runtime";
import HTMLSitemap from "@/pages/HTMLSitemap";
import { buildSitemapXml } from "@/lib/feeds.server";

const database = vi.hoisted(() => ({ settings: {} as unknown, origin: "" }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        range: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({
          data:
            table === "site_settings"
              ? { site_url: database.origin }
              : { settings: database.settings },
          error: null,
        }),
      };
      return query;
    },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/shopSitemap.functions", () => ({
  getShopSitemapOffers: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("@/components/Nav", () => ({ default: () => <nav /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  database.settings = setupDefaults(brianPreset);
  database.origin = brianPreset.identity.siteUrl;
});

describe("first AI build discovery", () => {
  it("includes the planner in the owner's XML and HTML sitemaps", async () => {
    expect(await buildSitemapXml()).toContain(
      "<loc>https://brianhanson.com/first-ai-build</loc>",
    );
    const html = renderToStaticMarkup(
      <SiteConfigContext.Provider value={brianPreset}>
        <HTMLSitemap />
      </SiteConfigContext.Provider>,
    );
    expect(html).toContain('href="/first-ai-build"');
    expect(html).toContain("Your First AI Build");
  });

  it("keeps the owner planner out of both member sitemaps", async () => {
    const member = {
      ...memberPreset,
      identity: {
        ...memberPreset.identity,
        name: "Cedar Learning",
        siteUrl: "https://cedar.example",
      },
    };
    database.settings = setupDefaults(member);
    database.origin = member.identity.siteUrl;
    expect(await buildSitemapXml()).not.toContain("/first-ai-build");
    const html = renderToStaticMarkup(
      <SiteConfigContext.Provider value={member}>
        <HTMLSitemap />
      </SiteConfigContext.Provider>,
    );
    expect(html).not.toContain("/first-ai-build");
  });
});
