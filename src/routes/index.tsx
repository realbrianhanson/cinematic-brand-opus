import { configFromMatches } from "@/config/runtime";
import { createFileRoute } from "@tanstack/react-router";

import Index from "@/pages/Index";
import { absoluteUrl } from "@/config/site";
import { buildPageHead, compactJsonLd } from "@/lib/seoHead";
import { getShopShowcase } from "@/lib/shop.functions";

export const Route = createFileRoute("/")({
  loader: async () => ({ shopShowcase: await getShopShowcase() }),
  head: ({ matches }) => {
    const config = configFromMatches(matches);
    const { identity, metadata } = config;
    const head = buildPageHead({
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
    return {
      ...head,
      links: [
        ...head.links,
        ...(config.hero.posterSrc
          ? [
              {
                rel: "preload",
                as: "image",
                href: config.hero.posterSrc,
                fetchPriority: "high" as const,
              },
            ]
          : []),
      ],
    };
  },
  component: HomeRoute,
});

function HomeRoute() {
  const { shopShowcase } = Route.useLoaderData();
  return <Index shopShowcase={shopShowcase} />;
}
