import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
vi.mock("@/config/site", async () => {
  const actual =
    await vi.importActual<typeof import("@/config/site")>("@/config/site");
  const { memberPreset } = await import("../presets/member");
  const siteConfig = {
    ...memberPreset,
    identity: {
      ...memberPreset.identity,
      name: "Cedar Home Care",
      logoInitials: "CH",
      siteUrl: "https://cedar.example.com",
      tagline: "Care for families",
    },
    brand: {
      accent: "#44AA88",
      accentLight: "#99DDCC",
      accentDark: "#227755",
      backdrop: "#071812",
    },
    content: {
      ...memberPreset.content,
      blogDescription: "Home care guidance for families.",
    },
    hero: {
      ...memberPreset.hero,
      headlineLines: [{ text: "Care for families", gold: true }],
      subtitle: "Practical home care guidance.",
    },
  };
  return {
    ...actual,
    siteConfig,
    copyrightLine: () =>
      `© ${new Date().getFullYear()} Cedar Home Care. All rights reserved.`,
    pageTitle: (t: string) => `${t} | Cedar Home Care`,
  };
});
vi.mock("@/lib/router-compat", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: "/" }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import Index from "@/pages/Index";
import Blog from "@/pages/Blog";
import { siteConfig } from "../site";
import { brandStyles } from "../brandStyles";
describe("a different member identity actually renders", () => {
  it("renders a green home-care homepage without owner proof/assets or a blocking loader", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <div style={brandStyles(siteConfig.brand)}>
          <Index />
        </div>
      </QueryClientProvider>,
    );
    expect(html).toContain("Cedar Home Care");
    expect(html).toContain("Practical home care guidance");
    expect(html).toContain("--brand-accent:#44AA88");
    expect(html).toContain("var(--brand-accent)");
    expect(html).not.toContain('id="testimonials"');
    for (const marker of [
      "Brian",
      "Hanson",
      "aiforbeginners",
      "Inc. 5000",
      "150,000",
      "brian-headshot",
      'href="#"',
    ])
      expect(html).not.toContain(marker);
  });
  it("uses the niche's visible article description", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <Blog initialPage={{ items: [], nextPage: null }} />
      </QueryClientProvider>,
    );
    expect(html).toContain("Home care guidance for families.");
    expect(html).not.toContain("AI, marketing");
  });
});
