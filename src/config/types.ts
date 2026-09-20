/**
 * PushTen site configuration — types and validation.
 *
 * Every piece of hardcoded homepage / chrome copy lives in a preset that
 * satisfies `SiteConfig`. Members change their site by editing (or swapping)
 * a preset — never by editing components.
 *
 * Publishing, newsletter sending and A.I. generation read their own values
 * from the `site_settings` table in the database. See PUSH_TEN_SETUP.md,
 * section "Keeping config and database aligned".
 */

export interface LinkItem {
  label: string;
  /** Absolute URL, site-relative path, or `mailto:`. */
  href: string;
  external?: boolean;
}

export interface SiteIdentity {
  /** Person or brand name shown in nav, footer, admin chrome and SEO fallbacks. */
  name: string;
  /** Short role line, e.g. "Keynote Speaker, Advisor & Operator". */
  role: string;
  /** One-line descriptor under the footer logo. */
  tagline: string;
  /** 1–2 characters used in the nav mark, footer mark and loader. */
  logoInitials: string;
  logoUrl?: string | null;
  /** Canonical site origin with no trailing slash, e.g. "https://example.com". */
  siteUrl: string;
  /** Public contact address. Leave empty to hide contact links. */
  contactEmail: string;
  /** Copyright holder line; falls back to `name`. */
  legalName?: string;
  /** First year of publication, used for the footer copyright. */
  foundedYear?: number;
  /** Topics used for Person schema `knowsAbout`. */
  knowsAbout: string[];
}

export interface SiteMetadata {
  /** Default <title> for the homepage and as a chrome fallback. */
  defaultTitle: string;
  googleSiteVerification: string | null;
  defaultDescription: string;
  /** Longer description used for og/twitter cards. */
  socialDescription: string;
  /** Absolute URL of the default social share image, or null to omit it. */
  socialImageUrl: string | null;
  /** Favicon path served from /public, or null to omit a branded icon. */
  faviconHref: string | null;
  /** Optional 180px PNG for saved home-screen shortcuts. */
  appleTouchIconHref?: string | null;
  /** Label for the RSS <link rel="alternate">. */
  rssTitle: string;
}

export interface HeroConfig {
  /** Small gold overline above the headline. Empty string hides it. */
  overline: string;
  /**
   * Headline rendered line by line. `gold` + `italic` control the accent
   * treatment; `spring` enables the per-character animation.
   */
  headlineLines: Array<{
    text: string;
    gold?: boolean;
    italic?: boolean;
    spring?: boolean;
    springDelay?: number;
  }>;
  subtitle: string;
  primaryCta: LinkItem | null;
  secondaryCta: LinkItem | null;
  /** Community caption. Null hides the strip. */
  socialProof: string | null;
  /** Background video served from /public, or null for the poster only. */
  videoSrc: string | null;
  posterSrc: string | null;
}

export interface StoryEntry {
  /** Lucide icon name limited to the set the Story section supports. */
  icon: "flame" | "zap" | "award" | "sparkles";
  tag: string;
  time: string;
  /** Accent entries get the gold rail and lighter background. */
  accent?: boolean;
  text: string;
}

export interface StoryConfig {
  overline: string;
  /** Heading text before the gold emphasis. */
  headingLead: string;
  headingAccent: string;
  intro: string;
  timeline: StoryEntry[];
  /** Optional owner portrait; member presets never inherit another person's image. */
  portraitSrc?: string | null;
  portraitAlt?: string;
  portraitWidth?: number;
  portraitHeight?: number;
  /** Closing pull quote, or null to hide it. */
  pullQuote: string | null;
}

export interface ExpertiseCard {
  icon: "brain" | "target" | "code" | "users";
  title: string;
  text: string;
}

export interface ExpertiseConfig {
  overline: string;
  headingLead: string;
  headingAccent: string;
  intro: string;
  cards: ExpertiseCard[];
}

export interface ResultStat {
  /** Published numeric value. */
  end: number;
  prefix?: string;
  suffix?: string;
  label: string;
  sub: string;
  /** Format with thousands separators. */
  locale?: boolean;
}

export interface EventDay {
  day: string;
  title: string;
  bullets: string[];
}

export interface EventConfig {
  overline: string;
  headingAccent: string;
  headingRest: string;
  intro: string;
  /** Imported image module (or absolute URL) for the crowd shot; null to hide. */
  imageSrc: string | null;
  imageAlt: string;
  days: EventDay[];
  cta: LinkItem | null;
  /** Reassurance line under the button. */
  ctaNote: string | null;
}

export interface Testimonial {
  quote: string;
  attribution: string;
}

export interface SpeakingConfig {
  overline: string;
  headingLead: string;
  headingAccent: string;
  intro: string;
  topics: Array<{ title: string; desc: string }>;
  /** Booking/inquiry link. Null hides the button. */
  bookingCta: LinkItem | null;
  /** Portrait for the speaking section; null hides the photo frame. */
  portraitSrc: string | null;
  portraitAlt: string;
  /** Real testimonial only. Null hides the card — never invent one. */
  testimonial: Testimonial | null;
}

export interface NewsletterConfig {
  headingLead: string;
  headingAccent: string;
  intro: string;
  /** Trust line under the form. */
  privacyNote: string;
  /** Optional "or skip ahead" secondary offer. */
  secondaryCta: LinkItem | null;
  secondaryCtaLabel: string | null;
}

export interface FooterConfig {
  /** Section anchors on the homepage. */
  hashLinks: LinkItem[];
  /** Internal route links. */
  routeLinks: LinkItem[];
  contactNote: string;
  /**
   * Legal links. Only configured, real URLs are rendered — an unset value
   * omits the link entirely rather than shipping a dead `#` anchor.
   */
  privacyUrl: string | null;
  termsUrl: string | null;
}

export interface NavGroup {
  label: string;
  children: Array<LinkItem & { description?: string }>;
}

export type NavItem = LinkItem | NavGroup;

export interface NavConfig {
  /** Ordered links and resource groups. Omit to use legacy hash/route links. */
  items?: NavItem[];
  /** Homepage anchors, in order. */
  hashLinks: LinkItem[];
  /** Route links appended after the anchors. */
  routeLinks: LinkItem[];
  cta: LinkItem | null;
  /** Shorter CTA label for the mobile drawer. */
  mobileCtaLabel: string | null;
}

export interface SectionVisibility {
  proofBar: boolean;
  story: boolean;
  expertise: boolean;
  results: boolean;
  event: boolean;
  speaking: boolean;
  newsletter: boolean;
}

export interface BrandTokens {
  /** Gold-equivalent accent. */
  accent: string;
  accentLight: string;
  accentDark: string;
  /** Page background used by the hero scrims and loader. */
  backdrop: string;
}

export interface SiteConfig {
  /** Preset id, used by tests and the setup docs. */
  preset: string;
  content: {
    blogDescription: string;
    newsDescription: string;
    resourceDescription: string;
    newsBuckets: Array<{ value: string; label: string; lanes: string[] }>;
  };
  identity: SiteIdentity;
  metadata: SiteMetadata;
  brand: BrandTokens;
  nav: NavConfig;
  hero: HeroConfig;
  /** Readable proof labels. Empty array hides the proof bar. */
  proofBadges: string[];
  /** Verified customer or attendee quotes. Omit or leave empty to hide. */
  homepageTestimonials?: {
    overline: string;
    heading: string;
    intro?: string;
    items: Array<Testimonial & { context?: string }>;
  };
  story: StoryConfig;
  expertise: ExpertiseConfig;
  results: ResultStat[];
  event: EventConfig;
  speaking: SpeakingConfig;
  newsletter: NewsletterConfig;
  /** Curated links for this site's audience. Omit until member resources exist. */
  featuredResources?: {
    overline: string;
    heading: string;
    intro: string;
    items: Array<LinkItem & { description: string; category: string }>;
  };
  footer: FooterConfig;
  sections: SectionVisibility;
}

export class SiteConfigError extends Error {}

const isNonEmpty = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const ORIGIN = /^https?:\/\/[^\s/]+$/;

/** Absolute http(s) URL, site-relative path, or mailto: address. */
export const isValidHref = (href: unknown): href is string => {
  if (!isNonEmpty(href)) return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  if (href.startsWith("#")) return true;
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(href)) return true;
  return /^https?:\/\/[^\s]+$/.test(href);
};

const checkLink = (link: LinkItem | null, path: string, errors: string[]) => {
  if (!link) return;
  if (!isNonEmpty(link.label)) errors.push(`${path}.label must not be empty`);
  if (!isValidHref(link.href))
    errors.push(`${path}.href is not a valid URL, path or mailto address`);
};

/**
 * Validates a preset and returns it. Throws `SiteConfigError` listing every
 * problem, so a mis-typed member preset fails loudly at import time rather
 * than rendering a half-broken page.
 */
export function validateSiteConfig(config: SiteConfig): SiteConfig {
  const errors: string[] = [];
  const { identity, metadata, brand } = config;

  if (!isNonEmpty(config.preset)) errors.push("preset must not be empty");
  if (!isNonEmpty(identity.name))
    errors.push("identity.name must not be empty");
  if (!isNonEmpty(identity.logoInitials) || identity.logoInitials.length > 3) {
    errors.push("identity.logoInitials must be 1-3 characters");
  }
  if (!ORIGIN.test(identity.siteUrl)) {
    errors.push(
      'identity.siteUrl must be an origin like "https://example.com" with no trailing slash',
    );
  }
  if (
    identity.contactEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.contactEmail)
  ) {
    errors.push("identity.contactEmail is not a valid email address");
  }

  if (!isNonEmpty(metadata.defaultTitle))
    errors.push("metadata.defaultTitle must not be empty");
  if (!isNonEmpty(metadata.defaultDescription))
    errors.push("metadata.defaultDescription must not be empty");
  if (
    metadata.socialImageUrl !== null &&
    !/^https:\/\//.test(metadata.socialImageUrl)
  ) {
    errors.push(
      "metadata.socialImageUrl must be an absolute https URL or null",
    );
  }

  for (const key of [
    "accent",
    "accentLight",
    "accentDark",
    "backdrop",
  ] as const) {
    if (!/^#[0-9a-fA-F]{3,8}$/.test(brand[key]))
      errors.push(`brand.${key} must be a hex colour`);
  }

  checkLink(config.nav.cta, "nav.cta", errors);
  checkLink(config.hero.primaryCta, "hero.primaryCta", errors);
  checkLink(config.hero.secondaryCta, "hero.secondaryCta", errors);
  checkLink(config.event.cta, "event.cta", errors);
  checkLink(config.speaking.bookingCta, "speaking.bookingCta", errors);
  checkLink(config.newsletter.secondaryCta, "newsletter.secondaryCta", errors);
  config.featuredResources?.items.forEach((link, i) =>
    checkLink(link, `featuredResources.items[${i}]`, errors),
  );
  config.nav.items?.forEach((item, i) => {
    if ("children" in item) {
      if (!isNonEmpty(item.label))
        errors.push(`nav.items[${i}].label must not be empty`);
      if (!item.children.length)
        errors.push(`nav.items[${i}].children must not be empty`);
      item.children.forEach((link, j) =>
        checkLink(link, `nav.items[${i}].children[${j}]`, errors),
      );
    } else {
      checkLink(item, `nav.items[${i}]`, errors);
    }
  });
  config.nav.hashLinks.forEach((l, i) =>
    checkLink(l, `nav.hashLinks[${i}]`, errors),
  );
  config.nav.routeLinks.forEach((l, i) =>
    checkLink(l, `nav.routeLinks[${i}]`, errors),
  );
  config.footer.hashLinks.forEach((l, i) =>
    checkLink(l, `footer.hashLinks[${i}]`, errors),
  );
  config.footer.routeLinks.forEach((l, i) =>
    checkLink(l, `footer.routeLinks[${i}]`, errors),
  );

  for (const key of ["privacyUrl", "termsUrl"] as const) {
    const value = config.footer[key];
    if (value !== null && !isValidHref(value)) {
      errors.push(
        `footer.${key} must be a valid URL/path or null (null omits the link)`,
      );
    }
  }

  if (config.hero.headlineLines.length === 0)
    errors.push("hero.headlineLines must have at least one line");
  if (config.sections.story && config.story.timeline.length === 0) {
    errors.push("sections.story is enabled but story.timeline is empty");
  }
  if (config.sections.expertise && config.expertise.cards.length === 0) {
    errors.push("sections.expertise is enabled but expertise.cards is empty");
  }
  if (config.sections.results && config.results.length === 0) {
    errors.push("sections.results is enabled but results is empty");
  }
  if (config.sections.event && config.event.days.length === 0) {
    errors.push("sections.event is enabled but event.days is empty");
  }
  if (config.sections.speaking && config.speaking.topics.length === 0) {
    errors.push("sections.speaking is enabled but speaking.topics is empty");
  }
  if (config.sections.proofBar && config.proofBadges.length === 0) {
    errors.push("sections.proofBar is enabled but proofBadges is empty");
  }

  if (errors.length > 0) {
    throw new SiteConfigError(
      `Invalid site config "${config.preset}":\n- ${errors.join("\n- ")}`,
    );
  }
  return config;
}
