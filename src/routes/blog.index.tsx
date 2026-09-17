import { createFileRoute } from "@tanstack/react-router";

import Blog from "@/pages/Blog";
import PublicRouteError from "@/components/PublicRouteError";
import { getPublicPostsFirstPage } from "@/lib/publicData.functions";
import { buildPageHead } from "@/lib/seoHead";
import { absoluteUrl, pageTitle, siteConfig } from "@/config/site";

const DESCRIPTION = siteConfig.content.blogDescription;

export const Route = createFileRoute("/blog/")({
  validateSearch: (search: Record<string, unknown>) => ({
    category:
      typeof search.category === "string" ? search.category.slice(0, 200) : "",
  }),
  loaderDeps: ({ search }) => ({ category: search.category }),
  loader: ({ deps }) => getPublicPostsFirstPage({ data: deps }),
  head: () =>
    buildPageHead({
      title: pageTitle("Articles & Playbooks"),
      description: DESCRIPTION,
      url: absoluteUrl("/blog"),
      type: "website",
    }),
  component: BlogRoute,
  errorComponent: () => (
    <PublicRouteError message="The article list could not be loaded." />
  ),
});

function BlogRoute() {
  const firstPage = Route.useLoaderData();
  const { category } = Route.useSearch();
  return <Blog initialPage={firstPage} category={category} />;
}
