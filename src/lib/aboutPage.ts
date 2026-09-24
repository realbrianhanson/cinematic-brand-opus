import { absoluteUrl, pageTitle, type SiteConfig } from "@/config/site";
import { isBrianOwner } from "@/lib/informationPages";
import { dropTrailingPeriod } from "@/lib/copyVoice";
import {
  breadcrumbJsonLd,
  buildPageHead,
  compactJsonLd,
  personJsonLd,
  type JsonLdSiteSettings,
} from "@/lib/seoHead";

export const ABOUT_PATH = "/about";

export function aboutTitle(config: SiteConfig): string {
  return `About ${config.identity.name}`;
}

/** Search description built only from facts already published on the site. */
export function aboutDescription(
  config: SiteConfig,
  settings?: JsonLdSiteSettings | null,
): string {
  if (isBrianOwner(config))
    return "Brian Hanson grew up in small-town Iowa without money or connections. Real Advisors made the Inc. 5000 four times. Today he leads the 150,000+ person AI For Business community";
  return dropTrailingPeriod(settings?.author_bio || config.story.intro);
}

/**
 * Person structured data for the About page. `sameAs` only ever contains the
 * profile URLs stored in site settings; nothing is guessed.
 */
export function aboutPersonJsonLd(
  config: SiteConfig,
  settings?: JsonLdSiteSettings | null,
): object {
  const fromSettings = personJsonLd(settings) as Record<string, unknown> | null;
  const person: Record<string, unknown> = fromSettings ?? {
    "@context": "https://schema.org",
    "@type": "Person",
    name: config.identity.name,
    jobTitle: config.identity.role,
  };
  return {
    ...person,
    "@id": `${absoluteUrl("/", config)}#person`,
    url: absoluteUrl("/", config),
    mainEntityOfPage: absoluteUrl(ABOUT_PATH, config),
    ...(config.story.portraitSrc
      ? { image: absoluteUrl(config.story.portraitSrc, config) }
      : {}),
    ...(person.knowsAbout ? {} : { knowsAbout: config.identity.knowsAbout }),
  };
}

export function aboutPageHead(
  config: SiteConfig,
  settings?: JsonLdSiteSettings | null,
) {
  const url = absoluteUrl(ABOUT_PATH, config);
  const person = aboutPersonJsonLd(config, settings);
  return buildPageHead({
    title: pageTitle(aboutTitle(config), config),
    description: aboutDescription(config, settings),
    url,
    type: "profile",
    image: config.metadata.socialImageUrl,
    jsonLd: compactJsonLd([
      person,
      {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        name: pageTitle(aboutTitle(config), config),
        url,
        mainEntity: { "@id": `${absoluteUrl("/", config)}#person` },
      },
      breadcrumbJsonLd([
        { name: "Home", url: absoluteUrl("/", config) },
        { name: aboutTitle(config), url },
      ]),
    ]),
  });
}
