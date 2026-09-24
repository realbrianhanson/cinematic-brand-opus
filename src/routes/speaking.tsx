import { createFileRoute, notFound } from "@tanstack/react-router";
import { absoluteUrl, pageTitle } from "@/config/site";
import { getSiteBranding } from "@/lib/branding.functions";
import { buildPageHead, breadcrumbJsonLd, compactJsonLd } from "@/lib/seoHead";
import SpeakingPage from "@/pages/SpeakingPage";
import PublicRouteError from "@/components/PublicRouteError";

export const Route = createFileRoute("/speaking")({
  loader: async () => {
    const config = await getSiteBranding();
    if (!config.sections.speaking) throw notFound();
    return config;
  },
  head: ({ loaderData: config }) => {
    if (!config)
      return buildPageHead({
        title: "Page not found",
        description: "This page is unavailable",
        url: "",
        robots: "noindex, nofollow",
      });
    const url = absoluteUrl("/speaking", config);
    return buildPageHead({
      title: pageTitle("Speaking & Workshops", config),
      description: config.speaking.intro,
      url,
      type: "website",
      jsonLd: compactJsonLd([
        breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/", config) },
          { name: "Speaking", url },
        ]),
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: `Speaking & Workshops | ${config.identity.name}`,
          description: config.speaking.intro,
          url,
          about: {
            "@type": "Person",
            name: config.identity.name,
            url: absoluteUrl("/", config),
          },
        },
      ]),
    });
  },
  component: SpeakingPage,
  errorComponent: () => (
    <PublicRouteError message="Speaking information could not be loaded" />
  ),
});
