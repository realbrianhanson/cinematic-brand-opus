import { configFromMatches } from "@/config/runtime";
import { createFileRoute } from "@tanstack/react-router";

import ResourcesIndex from "@/pages/ResourcesIndex";
import PublicRouteError from "@/components/PublicRouteError";
import {
  getPublicResourceIndex,
  getPublicSiteSettings,
} from "@/lib/publicData.functions";
import {
  breadcrumbJsonLd,
  buildPageHead,
  compactJsonLd,
  websiteJsonLd,
} from "@/lib/seoHead";
import { absoluteUrl, pageTitle } from "@/config/site";

export const Route = createFileRoute("/resources/")({
  loader: async () => {
    const [index, settings] = await Promise.all([
      getPublicResourceIndex(),
      getPublicSiteSettings(),
    ]);
    return { index, settings };
  },
  head: ({ loaderData, matches }) => {
    const config = configFromMatches(matches);
    return buildPageHead({
      title: pageTitle("Free Resources", config),
      description: config.content.resourceDescription,
      url: absoluteUrl("/resources", config),
      type: "website",
      jsonLd: compactJsonLd([
        websiteJsonLd(loaderData?.settings),
        breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/", config) },
          { name: "Resources", url: absoluteUrl("/resources", config) },
        ]),
      ]),
    });
  },
  component: ResourcesIndexRoute,
  errorComponent: () => (
    <PublicRouteError message="The resource library could not be loaded." />
  ),
});

function ResourcesIndexRoute() {
  const { index, settings } = Route.useLoaderData();
  return (
    <ResourcesIndex
      guides={index.guides}
      initialSchemas={index.schemas}
      initialCounts={index.counts}
      initialSettings={settings}
    />
  );
}
