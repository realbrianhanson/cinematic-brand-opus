import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  notFound: () => Object.assign(new Error("Not found"), { status: 404 }),
}));
vi.mock("@/pages/PillarPage", () => ({ default: () => null }));
vi.mock("@/components/PublicRouteError", () => ({ default: () => null }));
vi.mock("@/lib/publicData.functions", () => ({
  getPublicPillarBySlug: vi.fn(),
  getPublicSiteSettings: vi.fn(),
  getPublicGuideResources: vi.fn(),
}));

import { Route } from "../../routes/guides.$slug";

type Meta = { name?: string; property?: string; content?: string };
type HeadFn = (ctx: unknown) => { meta: (Meta | { title: string })[] };

const headFor = (pillar: Record<string, unknown>) => {
  const head = (Route as unknown as { options: { head: HeadFn } }).options.head;
  const result = head({
    loaderData: {
      pillar: {
        title: "AI for Small Business",
        content: "<p>Body</p>",
        published_at: null,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-02T00:00:00.000Z",
        ...pillar,
      },
      settings: null,
    },
    params: { slug: "ai-for-small-business" },
    matches: [],
  });
  const find = (key: string) =>
    (result.meta as Meta[]).find((m) => m.name === key || m.property === key)
      ?.content;
  const title = (result.meta.find((m) => "title" in m) as { title: string })
    .title;
  return {
    title,
    description: find("description"),
    og: find("og:description"),
  };
};

describe("guide page head", () => {
  it("uses legacy meta_title / meta_description keys written by the generator", () => {
    const head = headFor({
      seo_meta: {
        meta_title: "Legacy meta title",
        meta_description: "Legacy meta description",
      },
    });
    expect(head.title).toBe("Legacy meta title");
    expect(head.description).toBe("Legacy meta description");
    expect(head.og).toBe("Legacy meta description");
  });

  it("prefers title / description keys when both shapes exist", () => {
    const head = headFor({
      seo_meta: {
        title: "New title",
        description: "New description",
        meta_title: "Old title",
        meta_description: "Old description",
      },
    });
    expect(head.title).toBe("New title");
    expect(head.description).toBe("New description");
  });

  it("falls back to a plain-text excerpt of the body when no description is stored", () => {
    const body =
      "<h2>Start here</h2><p>" +
      "Practical AI steps for owners. ".repeat(12) +
      "</p>";
    const head = headFor({ seo_meta: {}, content: body });
    expect(head.title).toBe("AI for Small Business");
    expect(head.description).toMatch(/^Start here Practical AI steps/);
    expect(head.description).not.toContain("<");
    expect(head.description!.length).toBeLessThanOrEqual(160);
  });
});
