import { createFileRoute } from "@tanstack/react-router";

import ResourcesIndex from "@/pages/ResourcesIndex";
import PublicRouteError from "@/components/PublicRouteError";
import { getPublicResourceIndex, getPublicSiteSettings } from "@/lib/publicData.functions";
import { breadcrumbJsonLd, buildPageHead, compactJsonLd, websiteJsonLd } from "@/lib/seoHead";
import { absoluteUrl, pageTitle } from "@/config/site";

const DESCRIPTION =
  "Actionable guides, checklists, templates, and tools organized by industry.";

export const Route = createFileRoute("/resources/")({
  loader: async () => {
    const [index, settings] = await Promise.all([
      getPublicResourceIndex(),
      getPublicSiteSettings(),
    ]);
    return { index, settings };
  },
  head: ({ loaderData }) =>
    buildPageHead({
      title: pageTitle("Free Resources"),
      description: DESCRIPTION,
      url: absoluteUrl("/resources"),
      type: "website",
      jsonLd: compactJsonLd([
        websiteJsonLd(loaderData?.settings),
        breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/") },
          { name: "Resources", url: absoluteUrl("/resources") },
        ]),
      ]),
    }),
  component: ResourcesIndexRoute,
  errorComponent: () => <PublicRouteError message="The resource library could not be loaded." />,
});

function ResourcesIndexRoute() {
  const { index, settings } = Route.useLoaderData();
  return (
    <ResourcesIndex
      initialSchemas={index.schemas}
      initialCounts={index.counts}
      initialSettings={settings}
    />
  );
}
