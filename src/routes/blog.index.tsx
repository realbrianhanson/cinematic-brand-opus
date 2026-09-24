import { configFromMatches } from "@/config/runtime";
import { createFileRoute } from "@tanstack/react-router";

import Blog from "@/pages/Blog";
import PublicRouteError from "@/components/PublicRouteError";
import { getPublicPostsFirstPage } from "@/lib/publicData.functions";
import { buildPageHead } from "@/lib/seoHead";
import { absoluteUrl, pageTitle } from "@/config/site";

export const Route = createFileRoute("/blog/")({
  validateSearch: (search: Record<string, unknown>) => ({
    category:
      typeof search.category === "string" ? search.category.slice(0, 200) : "",
  }),
  loaderDeps: ({ search }) => ({ category: search.category }),
  loader: ({ deps }) => getPublicPostsFirstPage({ data: deps }),
  head: ({ matches }) => {
    const config = configFromMatches(matches);
    const { identity, metadata } = config;
    return buildPageHead({
      title: pageTitle("Articles & Playbooks", config),
      description: config.content.blogDescription,
      url: absoluteUrl("/blog", config),
      type: "website",
    });
  },
  component: BlogRoute,
  errorComponent: () => (
    <PublicRouteError message="The article list could not be loaded" />
  ),
});

function BlogRoute() {
  const firstPage = Route.useLoaderData();
  const { category } = Route.useSearch();
  return <Blog initialPage={firstPage} category={category} />;
}
