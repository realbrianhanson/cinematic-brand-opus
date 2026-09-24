import { configFromMatches } from "@/config/runtime";
import { absoluteUrl, pageTitle, type SiteConfig } from "@/config/site";
import { buildPageHead, breadcrumbJsonLd, compactJsonLd } from "@/lib/seoHead";

export const informationPages = {
  "/start-here": {
    title: "Start Here",
    description:
      "Choose a practical first step, explore free resources, and find the right training for your next project",
  },
  "/support": {
    title: "Help & Support",
    description:
      "Find your download, recover access, get help with an order, or contact the site",
  },
  "/privacy": {
    title: "Privacy Notice",
    description:
      "How information from this website's forms, downloads, and purchases is used, and how to contact us about it",
  },
  "/terms": {
    title: "Website Terms",
    description:
      "Terms for using this website, educational resources, digital downloads, and external offers",
  },
} as const;

export function informationPageHead(
  path: keyof typeof informationPages,
  matches: readonly { loaderData?: unknown }[],
) {
  const config = configFromMatches(matches);
  const page = informationPages[path];
  const url = absoluteUrl(path, config);
  return buildPageHead({
    title: pageTitle(page.title, config),
    description: page.description,
    url,
    type: "website",
    jsonLd: compactJsonLd([
      breadcrumbJsonLd([
        { name: "Home", url: absoluteUrl("/", config) },
        { name: page.title, url },
      ]),
    ]),
  });
}

/** Owner-only examples and contact details must not leak into a member remix. */
export function isBrianOwner(config: SiteConfig): boolean {
  return (
    config.preset === "brian" &&
    config.identity.siteUrl === "https://brianhanson.com" &&
    config.identity.name === "Brian Hanson"
  );
}

export function supportMailto(
  email: string,
  subject = "Website support",
): string | null {
  if (
    !email ||
    /[\r\n]/.test(email) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    return null;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}`;
}
