import { createFileRoute, notFound } from "@tanstack/react-router";

import NewsDetail from "@/pages/NewsDetail";
import PublicRouteError from "@/components/PublicRouteError";
import { getPublicNewsItem } from "@/lib/publicData.functions";
import { buildPageHead } from "@/lib/seoHead";
import { absoluteUrl, pageTitle } from "@/config/site";

export const Route = createFileRoute("/news/$id")({
  loader: async ({ params }) => {
    const item = await getPublicNewsItem({ data: { id: params.id } });
    if (!item) throw notFound();
    return item;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {};
    const title = loaderData.ai_title || loaderData.title || "News";
    return buildPageHead({
      title: pageTitle(title),
      description: loaderData.ai_summary || loaderData.raw_excerpt || "",
      url: absoluteUrl(`/news/${params.id}`),
      image: loaderData.image_url,
      type: "article",
      publishedAt: loaderData.published_at,
      robots: "noindex, follow",
    });
  },
  component: NewsDetailRoute,
  errorComponent: () => <PublicRouteError message="This news item could not be loaded." />,
  notFoundComponent: () => <NewsDetail />,
});

function NewsDetailRoute() {
  const item = Route.useLoaderData();
  return <NewsDetail initialItem={item} />;
}
