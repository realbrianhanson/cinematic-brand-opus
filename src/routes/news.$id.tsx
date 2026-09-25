import { configFromMatches } from "@/config/runtime";
import { newsDisplay } from "@/lib/newsDisplay";
import { createFileRoute, notFound } from "@tanstack/react-router";

import NewsDetail from "@/pages/NewsDetail";
import PublicRouteError from "@/components/PublicRouteError";
import { getPublicNewsItem } from "@/lib/publicData.functions";
import { buildPageHead } from "@/lib/seoHead";
import { absoluteUrl, pageTitle } from "@/config/site";

export const Route = createFileRoute("/news/$id")({
  loader: async ({ params }) => {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        params.id,
      )
    )
      throw notFound();
    const item = await getPublicNewsItem({ data: { id: params.id } });
    if (!item) throw notFound();
    return item;
  },
  head: ({ loaderData, params, matches }) => {
    const config = configFromMatches(matches);
    if (!loaderData) return {};
    const { title, summary } = newsDisplay(loaderData);
    return buildPageHead({
      title: pageTitle(title, config),
      description: summary,
      url: absoluteUrl(`/news/${params.id}`, config),
      image: loaderData.image_url,
      type: "article",
      publishedAt: loaderData.published_at,
      robots: "noindex, follow",
    });
  },
  component: NewsDetailRoute,
  errorComponent: () => (
    <PublicRouteError message="This news item could not be loaded" />
  ),
  notFoundComponent: () => <NewsDetail />,
});

function NewsDetailRoute() {
  const item = Route.useLoaderData();
  return <NewsDetail initialItem={item} />;
}
