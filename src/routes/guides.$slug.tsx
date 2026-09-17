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

export const Route = createFileRoute("/guides/$slug")({
  loader: async ({ params }) => {
    const [pillar, settings] = await Promise.all([
      getPublicPillarBySlug({ data: { slug: params.slug } }),
      getPublicSiteSettings(),
    ]);
    if (!pillar) throw notFound();
    return { pillar, settings };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {};
    const { pillar, settings } = loaderData;
    const seo = (pillar.seo_meta ?? {}) as Record<string, string | undefined>;
    const url = absoluteUrl(`/guides/${params.slug}`);
    const description = seo["description"] ?? "";
    const publishedAt = pillar.published_at ?? pillar.created_at;

    return buildPageHead({
      title: seo["title"] || pillar.title,
      description,
      url,
      image: seo["og_image"] ?? null,
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
          { name: "Home", url: absoluteUrl("/") },
          { name: "Guides", url: absoluteUrl("/resources") },
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
