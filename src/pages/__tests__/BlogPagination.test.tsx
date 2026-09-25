import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import Blog from "../Blog";
vi.mock("@/components/Nav", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));
vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
describe("server-rendered article navigation", () => {
  it("renders page 2 content and crawlable previous/next anchors without JavaScript", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <Blog
          page={2}
          category="tutorials"
          initialPage={{
            items: [
              {
                id: "older",
                slug: "older-tutorial",
                title: "Older useful tutorial",
              },
            ],
            nextPage: 2,
          }}
        />
      </QueryClientProvider>,
    );
    expect(html).toContain('href="/blog/older-tutorial"');
    expect(html).toContain("Older useful tutorial");
    expect(html).toContain('href="/blog?category=tutorials" rel="prev"');
    expect(html).toContain(
      'href="/blog?category=tutorials&amp;page=3" rel="next"',
    );
    expect(html).toContain("Page 2");
    expect(html).not.toContain("Load more articles");
  });
});

import SiloNavigation from "@/components/SiloNavigation";
it("renders stored guide-to-resource connections in the initial HTML", () => {
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <SiloNavigation
        nicheId="topic-id"
        pillarTitle="Business guide"
        initialPages={[
          {
            id: "resource",
            title: "Follow-up checklist",
            slug: "follow-up",
            content_schemas: { name: "Checklists", slug: "checklists" },
          },
        ]}
      />
    </QueryClientProvider>,
  );
  expect(html).toContain("Resources for This Guide");
  expect(html).toContain('href="/resources/checklists/follow-up"');
  expect(html).toContain("Follow-up checklist");
});
