import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SiteConfigContext } from "@/config/SiteConfigContext";
import { brianPreset } from "@/config/presets/brian";
import { memberPreset } from "@/config/presets/member";
import type { SiteConfig } from "@/config/types";
import type { ShopOffer } from "@/lib/shop";

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
vi.mock("@/components/SpeakingInquiry", () => ({
  default: ({ href }: { href: string }) => (
    <form aria-label="Speaking inquiry" data-recipient={href}>
      <input aria-label="Event details" />
    </form>
  ),
}));
import Index from "@/pages/Index";
import SpeakingPage from "@/pages/SpeakingPage";

function markup(page: React.ReactNode, config: SiteConfig = brianPreset) {
  return renderToStaticMarkup(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <SiteConfigContext.Provider value={config}>
        {page}
      </SiteConfigContext.Provider>
    </QueryClientProvider>,
  );
}

describe("authority home and dedicated speaking journey", () => {
  it("explains the primary event and makes offers reachable before the full testimonial wall", () => {
    const offer: ShopOffer = {
      id: "fixture",
      slug: "example-training",
      title: "Example training",
      summary: "Practical training",
      cover_url: null,
      kind: "paid",
      checkout_mode: "external",
      price_display_mode: "provider",
      external_url: "https://example.com/training",
      external_button_text: "Learn more",
      is_affiliate: false,
      affiliate_disclosure: null,
      amount_minor: 0,
      currency: "usd",
      updated_at: "2026-09-20T00:00:00Z",
      shop_category: "training",
      shop_featured: true,
    };
    const html = markup(<Index shopShowcase={[offer]} />);
    expect(html.indexOf('id="event"')).toBeLessThan(
      html.indexOf('id="testimonials"'),
    );
    expect(html.indexOf('id="shop"')).toBeLessThan(
      html.indexOf('id="testimonials"'),
    );
    expect(html).toContain('href="/support"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });
  it("keeps the homepage focused on the free event and shop while moving inquiries to speaking", () => {
    const html = markup(<Index />);
    expect(html).toContain('href="/speaking"');
    expect(html).not.toContain('aria-label="Speaking inquiry"');
    expect(html).toContain('href="/shop"');
    expect(html).toContain("https://go.aiforbusiness.com/summit?_go=brian60");
    expect(html).toContain('poster="/videos/hero-poster.jpg"');
    expect(brianPreset.hero.videoSrc).toBe("/videos/hero-bg.mp4");
    expect(html).not.toContain("cursor-dot");
    expect(html).not.toMatch(
      /<(?:h[1-6]|p|form|section|main|header)[^>]*style="[^"]*opacity:0(?:;|")/,
    );
  });
  it("renders every original testimonial as readable HTML, with additional quotes in an accessible disclosure", () => {
    const html = markup(<Index />);
    for (const item of brianPreset.homepageTestimonials!.items)
      expect(html).toContain(item.attribution);
    expect(html).toContain("<details");
    expect(html).toContain("More from the community");
  });
  it("puts the working inquiry recipient and event footage on the dedicated page", () => {
    const html = markup(<SpeakingPage />);
    expect(html).toContain('aria-label="Speaking inquiry"');
    expect(html).toContain('id="speaking-inquiry"');
    expect(html).toContain('href="#speaking-inquiry"');
    expect(html).toContain('src="/videos/hero-bg.mp4"');
    expect(html).toContain(
      'data-recipient="mailto:brian@brianhanson.com?subject=Speaking%20Inquiry"',
    );
    for (const topic of brianPreset.speaking.topics)
      expect(html).toContain(topic.title);
  });
  it("does not put the owner portrait, claims, event or inquiry into a member homepage", () => {
    const html = markup(<Index />, memberPreset);
    expect(html).not.toContain('id="speaking"');
    expect(html).not.toContain('id="story"');
    expect(html).not.toContain('id="event"');
    expect(html).not.toContain("150,000");
    expect(html).not.toContain("brian-headshot");
    expect(html).not.toContain('aria-label="Speaking inquiry"');
  });
});
