import { createFileRoute, notFound } from "@tanstack/react-router";
import { absoluteUrl, pageTitle } from "@/config/site";
import { getSiteBranding } from "@/lib/branding.functions";
import { isBrianOwner } from "@/lib/informationPages";
import { buildPageHead, breadcrumbJsonLd, compactJsonLd } from "@/lib/seoHead";
import { getFirstAiBuildOffers } from "@/lib/shop.functions";
import PublicRouteError from "@/components/PublicRouteError";
import FirstAiBuild from "@/pages/FirstAiBuild";

export const Route = createFileRoute("/first-ai-build")({
  loader: async () => {
    const config = await getSiteBranding();
    if (!isBrianOwner(config)) throw notFound();
    return { config, offers: await getFirstAiBuildOffers() };
  },
  head: ({ loaderData }) => {
    const config = loaderData?.config;
    if (!config || !isBrianOwner(config))
      return buildPageHead({
        title: "Page not found",
        description: "This page is unavailable",
        url: "",
        robots: "noindex, nofollow",
      });
    const url = absoluteUrl("/first-ai-build", config);
    return buildPageHead({
      title: pageTitle("Your First AI Build — Free Project Planner", config),
      description:
        "Choose a business task and get a practical first app plan, a ready-to-copy build prompt, and three tests. Free to use, with no email required.",
      url,
      image: config.metadata.socialImageUrl,
      type: "website",
      jsonLd: compactJsonLd([
        breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/", config) },
          { name: "Your First AI Build", url },
        ]),
      ]),
    });
  },
  component: FirstAiBuildPage,
  errorComponent: () => (
    <PublicRouteError message="The project planner could not be loaded" />
  ),
});

function FirstAiBuildPage() {
  const { offers } = Route.useLoaderData();
  return <FirstAiBuild offers={offers} />;
}
