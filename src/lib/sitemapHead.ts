import { configFromMatches } from "@/config/runtime";
import { absoluteUrl, pageTitle } from "@/config/site";
import { buildPageHead } from "./seoHead";

export function sitemapHead({
  matches,
}: {
  matches: readonly { loaderData?: unknown }[];
}) {
  const config = configFromMatches(matches);
  return buildPageHead({
    title: pageTitle("Sitemap", config),
    description: `Find articles, guides, resources, and offers from ${config.identity.name}.`,
    url: absoluteUrl("/sitemap", config),
    type: "website",
  });
}
