// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  resolve: vi.fn(),
  settings: {
    cta_url: "https://example.com/training",
    cta_headline: "Global training",
    cta_subtext: "Grow your business",
    cta_button_text: "Join",
    cta_social_proof: "Global proof",
  },
}));
vi.mock("@/config/SiteConfigContext", () => ({
  useSiteConfig: () => ({ identity: { siteUrl: "https://brianhanson.com" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        limit: () => ({
          maybeSingle: () => Promise.resolve({ data: h.settings }),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/contentOfferRouting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/contentOfferRouting")>()),
  resolveContentOffer: h.resolve,
}));
import PublicCTA from "../PublicCTA";

function show() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PublicCTA
        variant="end"
        pageType="post"
        pageId="00000000-0000-4000-8000-000000000001"
        nicheSlug="landscaping"
        nicheName="Landscaping"
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  h.resolve.mockReset();
});
afterEach(cleanup);
describe("contextual public CTA", () => {
  it("retains the global CTA when no assignment matches", async () => {
    h.resolve.mockResolvedValue(null);
    show();
    const link = await screen.findByRole("link", { name: /Join/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("href")).toContain("utm_content=landscaping");
    expect(screen.getByText("Grow your Landscaping business")).toBeVisible();
  });
  it("uses a relevant native offer without the unrelated global proof or outbound tag", async () => {
    h.resolve.mockResolvedValue({
      route_id: "r",
      offer_id: "o",
      scope: "page",
      slug: "follow-up-kit",
      title: "Follow-up kit",
      summary: "Use the prompts",
      kind: "free",
      headline: "",
      subtext: "",
      button_text: "",
    });
    show();
    const link = await screen.findByRole("link", {
      name: /Get the free resource/,
    });
    expect(link).toHaveAttribute("href", "/offers/follow-up-kit");
    expect(link).not.toHaveAttribute("target");
    expect(link).not.toHaveAttribute("data-conversion-destination");
    expect(screen.queryByText("Global proof")).not.toBeInTheDocument();
    expect(h.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        pageType: "post",
        pageId: "00000000-0000-4000-8000-000000000001",
      }),
    );
  });
  it("falls back to the existing CTA when routing is not deployed or fails", async () => {
    h.resolve.mockRejectedValue(new Error("Function unavailable"));
    show();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Join/ })).toBeVisible(),
    );
  });
});
