import { createFileRoute } from "@tanstack/react-router";

import Blog from "@/pages/Blog";
import PublicRouteError from "@/components/PublicRouteError";
import { getPublicPostsFirstPage } from "@/lib/publicData.functions";
import { buildPageHead } from "@/lib/seoHead";
import { absoluteUrl, pageTitle, siteConfig } from "@/config/site";

const DESCRIPTION = `AI, marketing, and building businesses that matter. Playbooks, frameworks, and applied strategy from ${siteConfig.identity.name}.`;

export const Route = createFileRoute("/blog/")({
  loader: () => getPublicPostsFirstPage(),
  head: () =>
    buildPageHead({
      title: pageTitle("Articles & Playbooks"),
      description: DESCRIPTION,
      url: absoluteUrl("/blog"),
      type: "website",
    }),
  component: BlogRoute,
  errorComponent: () => <PublicRouteError message="The article list could not be loaded." />,
});

function BlogRoute() {
  const firstPage = Route.useLoaderData();
  return <Blog initialPage={firstPage} />;
}
