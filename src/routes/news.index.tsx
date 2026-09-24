import { configFromMatches } from "@/config/runtime";
import { createFileRoute } from "@tanstack/react-router";

import News from "@/pages/News";
import PublicRouteError from "@/components/PublicRouteError";
import { getPublicNewsFirstPage } from "@/lib/publicData.functions";
import { buildPageHead } from "@/lib/seoHead";
import { absoluteUrl, pageTitle } from "@/config/site";

export const Route = createFileRoute("/news/")({
  loader: () => getPublicNewsFirstPage(),
  head: ({ matches }) => {
    const config = configFromMatches(matches);
    const { identity, metadata } = config;
    return buildPageHead({
      title: pageTitle("Latest News", config),
      description: config.content.newsDescription,
      url: absoluteUrl("/news", config),
      type: "website",
      // Curated third-party headlines stay out of the index by design.
      robots: "noindex, follow",
    });
  },
  component: NewsRoute,
  errorComponent: () => (
    <PublicRouteError message="The news feed could not be loaded" />
  ),
});

function NewsRoute() {
  const firstPage = Route.useLoaderData();
  return <News initialPage={firstPage} />;
}
