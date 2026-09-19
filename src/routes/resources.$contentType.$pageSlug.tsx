import { configFromMatches } from "@/config/runtime";
import { createFileRoute, notFound } from "@tanstack/react-router";

import GeneratedPage from "@/pages/GeneratedPage";
import PublicRouteError from "@/components/PublicRouteError";
import {
  getPublicGeneratedPage,
  getPublicSiteSettings,
} from "@/lib/publicData.functions";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  buildPageHead,
  compactJsonLd,
  faqJsonLd,
  generatedItemNames,
  itemListJsonLd,
  personJsonLd,
  speakableJsonLd,
  websiteJsonLd,
} from "@/lib/seoHead";
import { absoluteUrl } from "@/config/site";

export const Route = createFileRoute("/resources/$contentType/$pageSlug")({
  loader: async ({ params }) => {
    const [page, settings] = await Promise.all([
      getPublicGeneratedPage({
        data: { contentType: params.contentType, pageSlug: params.pageSlug },
      }),
      getPublicSiteSettings(),
    ]);
    if (!page) throw notFound();
    return { page, settings };
  },
  head: ({ loaderData, params, matches }) => {
    const config = configFromMatches(matches);
    if (!loaderData) return {};
    const { page, settings } = loaderData;
    const seo = (page.seo_meta ?? {}) as Record<string, string | undefined>;
    const content = page.content_json as Record<string, unknown> | null;
    const url = absoluteUrl(
      `/resources/${params.contentType}/${params.pageSlug}`,
      config,
    );
    const description =
      seo["description"] || (content?.["intro"] as string) || "";
    const publishedAt = page.published_at ?? page.created_at;
    const faqs = Array.isArray(content?.["faqs"])
      ? (content["faqs"] as Array<{ question?: unknown; answer?: unknown }>)
      : null;

    return buildPageHead({
      title: seo["title"] || page.title,
      description,
      url,
      image: seo["og_image"] ?? null,
      type: "article",
      publishedAt,
      updatedAt: page.updated_at,
      authorName: settings?.author_name,
      jsonLd: compactJsonLd([
        websiteJsonLd(settings),
        personJsonLd(settings),
        articleJsonLd({
          headline: page.title,
          description,
          url,
          publishedAt,
          updatedAt: page.updated_at,
          settings,
        }),
        faqJsonLd(faqs),
        itemListJsonLd(generatedItemNames(content)),
        breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/", config) },
          { name: "Resources", url: absoluteUrl("/resources", config) },
          {
            name: page.schema.name,
            url: absoluteUrl(`/resources/${params.contentType}`, config),
          },
          { name: page.title, url },
        ]),
        speakableJsonLd(),
      ]),
    });
  },
  component: GeneratedPageRoute,
  errorComponent: () => (
    <PublicRouteError message="This resource could not be loaded." />
  ),
  notFoundComponent: () => <GeneratedPage />,
});

function GeneratedPageRoute() {
  const { page, settings } = Route.useLoaderData();
  return <GeneratedPage initialPage={page} initialSettings={settings} />;
}
