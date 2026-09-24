import { configFromMatches } from "@/config/runtime";
import { createFileRoute, notFound } from "@tanstack/react-router";

import PillarPage from "@/pages/PillarPage";
import PublicRouteError from "@/components/PublicRouteError";
import {
  getPublicPillarBySlug,
  getPublicSiteSettings,
} from "@/lib/publicData.functions";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  buildPageHead,
  compactJsonLd,
  personJsonLd,
  speakableJsonLd,
  websiteJsonLd,
} from "@/lib/seoHead";
import { absoluteUrl } from "@/config/site";

const DESCRIPTION_MAX = 160;

/** Plain-text excerpt of the guide body, used when no meta description exists. */
const bodyExcerpt = (html: string | null | undefined) => {
  const text = (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= DESCRIPTION_MAX) return text;
  const cut = text.slice(0, DESCRIPTION_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

const seoText = (seo: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = seo[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
};

export const Route = createFileRoute("/guides/$slug")({
  loader: async ({ params }) => {
    const [pillar, settings] = await Promise.all([
      getPublicPillarBySlug({ data: { slug: params.slug } }),
      getPublicSiteSettings(),
    ]);
    if (!pillar) throw notFound();
    return { pillar, settings };
  },
  head: ({ loaderData, params, matches }) => {
    const config = configFromMatches(matches);
    if (!loaderData) return {};
    const { pillar, settings } = loaderData;
    const seo = (pillar.seo_meta ?? {}) as Record<string, unknown>;
    const url = absoluteUrl(`/guides/${params.slug}`, config);
    // Generated guides store meta_title/meta_description; accept both shapes.
    const description =
      seoText(seo, "description", "meta_description") ||
      bodyExcerpt(pillar.content);
    const publishedAt = pillar.published_at ?? pillar.created_at;

    return buildPageHead({
      title: seoText(seo, "title", "meta_title") || pillar.title,
      description,
      url,
      image: seoText(seo, "og_image") || null,
      type: "article",
      publishedAt,
      updatedAt: pillar.updated_at,
      authorName: settings?.author_name,
      jsonLd: compactJsonLd([
        websiteJsonLd(settings),
        personJsonLd(settings),
        articleJsonLd({
          headline: pillar.title,
          description,
          url,
          publishedAt,
          updatedAt: pillar.updated_at,
          settings,
        }),
        breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/", config) },
          { name: "Guides", url: absoluteUrl("/resources", config) },
          { name: pillar.title, url },
        ]),
        speakableJsonLd(),
      ]),
    });
  },
  component: GuideRoute,
  errorComponent: () => (
    <PublicRouteError message="This guide could not be loaded." />
  ),
  notFoundComponent: () => <PillarPage />,
});

function GuideRoute() {
  const { pillar, settings } = Route.useLoaderData();
  return <PillarPage initialPillar={pillar} initialSettings={settings} />;
}
