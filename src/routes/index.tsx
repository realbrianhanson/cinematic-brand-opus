import { configFromMatches } from "@/config/runtime";
import { createFileRoute } from "@tanstack/react-router";

import Index from "@/pages/Index";
import { absoluteUrl } from "@/config/site";
import { buildPageHead, compactJsonLd } from "@/lib/seoHead";

export const Route = createFileRoute("/")({
  head: ({ matches }) => {
    const config = configFromMatches(matches);
    const { identity, metadata } = config;
    return buildPageHead({
      title: metadata.defaultTitle,
      description: metadata.defaultDescription,
      url: absoluteUrl("/", config),
      type: "website",
      jsonLd: compactJsonLd([
        {
          "@context": "https://schema.org",
          "@type": "Person",
          name: identity.name,
          jobTitle: identity.role,
          url: absoluteUrl("/", config),
          description: metadata.socialDescription,
          knowsAbout: identity.knowsAbout,
        },
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: identity.name,
          url: absoluteUrl("/", config),
          potentialAction: {
            "@type": "SearchAction",
            target: `${absoluteUrl("/resources", config)}?q={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        },
      ]),
    });
  },
  component: Index,
});
