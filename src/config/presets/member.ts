import type { SiteConfig } from "../types";

/**
 * MEMBER STARTER PRESET — copy this file, rename it, fill it in.
 *
 * Rules baked into this example on purpose:
 * - No proof, metrics, awards or testimonials. Everything here is either your
 *   own copy or nothing. Never carry over another person's numbers.
 * - Sections you have nothing truthful to say in are switched OFF
 *   (`sections`), so the homepage stays short and honest until you fill them.
 * - Legal links are `null`, so no dead "Privacy"/"Terms" anchors ship.
 *
 * Activate it by setting ACTIVE_PRESET in src/config/site.ts.
 */
export const memberPreset: SiteConfig = {
  preset: "member",

  identity: {
    name: "Your Name",
    role: "Your Role",
    tagline: "Your focus areas",
    logoInitials: "YN",
    siteUrl: "https://example.com",
    contactEmail: "",
    knowsAbout: ["Your Topic"],
  },

  metadata: {
    defaultTitle: "Your Name | Your Positioning",
    defaultDescription: "One sentence describing who you help and the result you deliver.",
    socialDescription: "One or two sentences for social previews describing who you help and how.",
    socialImageUrl: null,
    faviconHref: null,
    rssTitle: "Your Name — Blog",
  },

  brand: {
    accent: "#D4AF55",
    accentLight: "#E8C96A",
    accentDark: "#B8962E",
    backdrop: "#07070E",
  },

  nav: {
    hashLinks: [],
    routeLinks: [
      { label: "Resources", href: "/resources" },
      { label: "Blog", href: "/blog" },
      { label: "News", href: "/news" },
    ],
    cta: null,
    mobileCtaLabel: null,
  },

  hero: {
    overline: "",
    headlineLines: [
      { text: "Your Headline" },
      { text: "Goes Here.", gold: true, italic: true },
    ],
    subtitle: "One or two sentences describing who you help and what changes for them.",
    primaryCta: null,
    secondaryCta: null,
    socialProof: null,
    videoSrc: null,
    posterSrc: null,
  },

  proofBadges: [],

  story: {
    overline: "The Story",
    headingLead: "Your Story",
    headingAccent: "In Short",
    intro: "",
    timeline: [],
    pullQuote: null,
  },

  expertise: {
    overline: "Core Expertise",
    headingLead: "What I",
    headingAccent: "Do Best",
    intro: "",
    cards: [],
  },

  results: [],

  event: {
    overline: "",
    headingAccent: "",
    headingRest: "",
    intro: "",
    imageSrc: null,
    imageAlt: "",
    days: [],
    cta: null,
    ctaNote: null,
  },

  speaking: {
    overline: "Speaking",
    headingLead: "Invite Me",
    headingAccent: "to Your Stage",
    intro: "",
    topics: [],
    bookingCta: null,
    portraitSrc: null,
    portraitAlt: "",
    testimonial: null,
  },

  newsletter: {
    headingLead: "Stay in the",
    headingAccent: "Loop",
    intro: "A short note on what subscribers get and how often.",
    privacyNote: "No spam, ever. Unsubscribe anytime.",
    secondaryCta: null,
    secondaryCtaLabel: null,
  },

  footer: {
    hashLinks: [],
    routeLinks: [
      { label: "Blog", href: "/blog" },
      { label: "News", href: "/news" },
      { label: "Resources", href: "/resources" },
      { label: "Sitemap", href: "/sitemap" },
    ],
    contactNote: "",
    privacyUrl: null,
    termsUrl: null,
  },

  sections: {
    proofBar: false,
    story: false,
    expertise: false,
    results: false,
    event: false,
    speaking: false,
    newsletter: true,
  },
};
