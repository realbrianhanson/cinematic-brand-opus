import { createFileRoute } from "@tanstack/react-router";

import Index from "@/pages/Index";
import { absoluteUrl, siteConfig } from "@/config/site";
import { buildPageHead, compactJsonLd } from "@/lib/seoHead";

const { identity, metadata } = siteConfig;

export const Route = createFileRoute("/")({
  head: () =>
    buildPageHead({
      title: metadata.defaultTitle,
      description: metadata.defaultDescription,
      url: absoluteUrl("/"),
      type: "website",
      jsonLd: compactJsonLd([
        {
          "@context": "https://schema.org",
          "@type": "Person",
          name: identity.name,
          jobTitle: identity.role,
          url: absoluteUrl("/"),
          description: metadata.socialDescription,
          knowsAbout: identity.knowsAbout,
        },
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: identity.name,
          url: absoluteUrl("/"),
          potentialAction: {
            "@type": "SearchAction",
            target: `${absoluteUrl("/resources")}?q={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        },
      ]),
    }),
  component: Index,
});
