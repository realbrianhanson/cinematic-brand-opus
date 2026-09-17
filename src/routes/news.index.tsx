import { createFileRoute } from "@tanstack/react-router";

import News from "@/pages/News";
import PublicRouteError from "@/components/PublicRouteError";
import { getPublicNewsFirstPage } from "@/lib/publicData.functions";
import { buildPageHead } from "@/lib/seoHead";
import { absoluteUrl, pageTitle, siteConfig } from "@/config/site";

export const Route = createFileRoute("/news/")({
  loader: () => getPublicNewsFirstPage(),
  head: () =>
    buildPageHead({
      title: pageTitle("Latest News"),
      description: siteConfig.content.newsDescription,
      url: absoluteUrl("/news"),
      type: "website",
      // Curated third-party headlines stay out of the index by design.
      robots: "noindex, follow",
    }),
  component: NewsRoute,
  errorComponent: () => (
    <PublicRouteError message="The news feed could not be loaded." />
  ),
});

function NewsRoute() {
  const firstPage = Route.useLoaderData();
  return <News initialPage={firstPage} />;
}
