import type { SiteConfig } from "../types";
import brianHeadshot from "@/assets/brian-headshot.jpeg";
import eventCrowd from "@/assets/event-crowd.jpg";

/**
 * LIVE PRESET — Brian Hanson (brianhanson.com).
 *
 * Every claim, metric and link here is Brian's own. PushTen members must not
 * copy this file: start from `member.ts` instead and fill in your own facts.
 */
export const brianPreset: SiteConfig = {
  preset: "brian",

  content: {
    blogDescription:
      "AI, marketing, and building businesses that matter. Playbooks, frameworks, and applied strategy from Brian Hanson.",
    newsDescription:
      "A daily signal feed of global AI, marketing, and sales news — curated and summarized in one place.",
    resourceDescription: "Practical AI guides for every industry.",
    newsBuckets: [
      { value: "ai", label: "AI", lanes: ["ai_tools", "ai_training"] },
      { value: "marketing", label: "Marketing", lanes: ["smb_marketing"] },
      { value: "sales", label: "Sales", lanes: ["sales"] },
    ],
  },
  identity: {
    name: "Brian Hanson",
    role: "Keynote Speaker, Advisor & Operator",
    tagline: "AI · Marketing · Business Growth",
    logoInitials: "B",
    siteUrl: "https://brianhanson.com",
    contactEmail: "brian@brianhanson.com",
    foundedYear: 2026,
    knowsAbout: [
      "Artificial Intelligence",
      "Leadership",
      "Marketing Strategy",
      "Business Growth",
      "Personal Branding",
    ],
  },

  metadata: {
    googleSiteVerification: "K_UDj1XvNR1AVquMTg9QMT_LfxDmHKiPwdzM3pcOQW4",
    defaultTitle: "Brian Hanson | Authority, Leadership, Legacy",
    defaultDescription:
      "Brian Hanson helps founders build authority, lead with clarity, and grow durable businesses with applied A.I. and modern leadership.",
    socialDescription:
      "Keynote speaker and advisor Brian Hanson helps founders build authority, lead with clarity, and grow durable businesses through applied A.I. and modern leadership.",
    socialImageUrl: "https://brianhanson.com/og-default.png",
    faviconHref: "/brian-headshot.webp",
    rssTitle: "Brian Hanson — Blog",
  },

  brand: {
    accent: "#D4AF55",
    accentLight: "#E8C96A",
    accentDark: "#B8962E",
    backdrop: "#07070E",
  },

  nav: {
    hashLinks: [
      { label: "Story", href: "#story" },
      { label: "Expertise", href: "#expertise" },
      { label: "Speaking", href: "#speaking" },
      { label: "Results", href: "#results" },
    ],
    routeLinks: [
      { label: "Resources", href: "/resources" },
      { label: "Blog", href: "/blog" },
      { label: "News", href: "/news" },
    ],
    cta: {
      label: "Free AI Event",
      href: "https://aiforbeginners.com",
      external: true,
    },
    mobileCtaLabel: "Free 3-Day AI Event →",
  },

  hero: {
    overline: "4× Inc. 5000 · AI Educator · Keynote Speaker",
    headlineLines: [
      { text: "AI Doesn't" },
      { text: "Replace People." },
      {
        text: "It Replaces",
        gold: true,
        italic: true,
        spring: true,
        springDelay: 0.9,
      },
      {
        text: "Inefficiency.",
        gold: true,
        italic: true,
        spring: true,
        springDelay: 1.1,
      },
    ],
    subtitle:
      "Multi-million dollar companies built. 4× Inc. 5000 earned. Now helping 150,000+ business owners use AI to scale. No coding required.",
    primaryCta: {
      label: "Join Free 3-Day AI Event",
      href: "https://aiforbeginners.com",
      external: true,
    },
    secondaryCta: { label: "Book Brian to Speak", href: "#speaking" },
    socialProof: "150,000+ business owners in the community",
    videoSrc: "/videos/hero-bg.mp4",
    posterSrc: "/videos/hero-poster.jpg",
  },

  proofBadges: [
    "4× INC. 5000",
    "150,000+ COMMUNITY",
    "REAL ADVISORS",
    "AI FOR BUSINESS",
    "REVVEN — 3,000+ USERS",
    "$50M+ REVENUE INFLUENCED",
    "20+ YEARS MARKETING",
    "BUILT WITHOUT CODE",
  ],

  story: {
    overline: "The Story",
    headingLead: "From Nothing to",
    headingAccent: "150,000 Strong",
    intro:
      "Every chapter taught me one thing: the rules only apply if you accept them. I never did.",
    timeline: [
      {
        icon: "flame",
        tag: "The Beginning",
        time: "Small-Town Iowa",
        text: "No money. No connections. No degree. Just necessity and an obsession with figuring out what actually works.",
      },
      {
        icon: "zap",
        tag: "First Bet",
        time: "Mid-20s",
        text: "Built one of the largest engine and transmission companies in the US, without knowing how to change my own oil. Systems and selling beat credentials every time.",
      },
      {
        icon: "award",
        tag: "The Scale",
        time: "Real Advisors",
        accent: true,
        text: "Earned 4× Inc. 5000 recognition, highest ranking #80 in the nation. Mastered direct response marketing from the legends: Halbert, Schwartz, Kennedy, Cialdini.",
      },
      {
        icon: "flame",
        tag: "The Fire",
        time: "2020",
        text: "COVID destroyed my live events business. Over $1 million in debt. Could have filed bankruptcy. Chose to rebuild. Let it burn, then build something better from the ashes.",
      },
      {
        icon: "sparkles",
        tag: "The Rebuild",
        time: "Now · Age 46",
        accent: true,
        text: "Built AI For Business, 150,000+ members strong. Created Revven, a SaaS with 3,000+ users, without writing a single line of code. The playing field has never been more level.",
      },
    ],
    pullQuote:
      "I didn't come from money, connections, or a degree. I came from necessity and a refusal to stay stuck.",
  },

  expertise: {
    overline: "Core Expertise",
    headingLead: "Where AI Meets",
    headingAccent: "Real Results",
    intro:
      "Four disciplines. One unfair advantage. The intersection most \u2018experts\u2019 can\u2019t touch.",
    cards: [
      {
        icon: "brain",
        title: "AI Implementation",
        text: "Practical AI workflows, automation stacks, and custom tools that replace entire departments. No PhD. Just results.",
      },
      {
        icon: "target",
        title: "Direct Response Marketing",
        text: "20+ years of frameworks that convert strangers into customers. The psychology behind $50M+ in revenue influenced.",
      },
      {
        icon: "code",
        title: "No-Code Building",
        text: "I built Revven, a full SaaS platform with 3,000+ users, without writing a single line of code. I teach others to do the same.",
      },
      {
        icon: "users",
        title: "Community & Education",
        text: "150,000+ business owners trained through live events, workshops, and virtual summits. Real education that creates immediate ROI.",
      },
    ],
  },

  results: [
    {
      end: 4,
      suffix: "×",
      label: "Inc. 5000",
      sub: "Highest: #80 in the nation",
    },
    {
      end: 150,
      suffix: "K+",
      label: "Community",
      sub: "Business owners trained",
    },
    {
      end: 50,
      prefix: "$",
      suffix: "M+",
      label: "Revenue",
      sub: "Influenced across ventures",
    },
    {
      end: 3000,
      suffix: "+",
      label: "Revven Users",
      sub: "Built with zero code",
      locale: true,
    },
  ],

  event: {
    overline: "Free Virtual Event",
    headingAccent: "3 Days",
    headingRest: "That Will Change How You Do Business",
    intro:
      "Simple, push-button AI solutions with high impact. No tech background needed...",
    imageSrc: eventCrowd,
    imageAlt:
      "Brian Hanson's AI for Business live event with hundreds of attendees",
    days: [
      {
        day: "Day 1",
        title: "AI Foundations",
        bullets: [
          "What AI can actually do for YOUR business",
          "The tools that matter (skip the noise)",
          "Your first AI workflow — live",
        ],
      },
      {
        day: "Day 2",
        title: "Implementation",
        bullets: [
          "Hands-on building with push-button tools",
          "Automate content, marketing, and ops",
          "Real results before the day ends",
        ],
      },
      {
        day: "Day 3",
        title: "Scale & Automate",
        bullets: [
          "Systems that run while you live",
          "The AI stack that replaces busywork",
          "Your 90-day implementation roadmap",
        ],
      },
    ],
    cta: {
      label: "Register Free — AIForBeginners.com",
      href: "https://aiforbeginners.com",
      external: true,
    },
    ctaNote: "100% free. No credit card. Just show up ready to learn.",
  },

  speaking: {
    overline: "Keynotes & Workshops",
    headingLead: "Bring Brian",
    headingAccent: "to Your Stage",
    intro:
      "On stage, I make complex AI simple. I blend hard-won lessons with humor and deliver frameworks audiences use immediately. No recycled TED talks.",
    topics: [
      {
        title: "AI for Business Leaders",
        desc: "Making AI profitable and actionable for non-technical executives. Walk away knowing exactly what to implement Monday morning.",
      },
      {
        title: "The Unfair Advantage",
        desc: "How to build systems that let you compete against anyone, regardless of size or budget. Technology, psychology, and strategy combined.",
      },
      {
        title: "From Burnout to Breakthrough",
        desc: "The story of losing everything, choosing to rebuild, and using AI as the foundation. Resilience, reinvention, and reclaiming your life.",
      },
    ],
    bookingCta: {
      label: "Inquire About Booking",
      href: "mailto:brian@brianhanson.com?subject=Speaking%20Inquiry",
    },
    portraitSrc: brianHeadshot,
    portraitAlt: "Brian Hanson",
    testimonial: {
      quote: "Brian's keynote was the highlight of our entire conference.",
      attribution: "Event Director, Fortune 500 Company",
    },
  },

  newsletter: {
    headingLead: "Ready for Your",
    headingAccent: "Unfair Advantage?",
    intro:
      "Weekly AI strategies, tools, and frameworks from the front lines. No spam. No fluff. Just what moves the needle.",
    privacyNote: "No spam, ever. Unsubscribe anytime.",
    secondaryCta: {
      label: "Join the Free 3-Day AI Event",
      href: "https://aiforbeginners.com",
      external: true,
    },
    secondaryCtaLabel: "Or skip ahead",
  },

  footer: {
    hashLinks: [
      { label: "Story", href: "#story" },
      { label: "Expertise", href: "#expertise" },
      { label: "Speaking", href: "#speaking" },
      { label: "Results", href: "#results" },
    ],
    routeLinks: [
      { label: "Blog", href: "/blog" },
      { label: "News", href: "/news" },
      { label: "Resources", href: "/resources" },
      { label: "Sitemap", href: "/sitemap" },
    ],
    contactNote: "Speaking · Partnerships · Media",
    // Not published yet: the links stay hidden until real policy pages exist.
    privacyUrl: null,
    termsUrl: null,
  },

  sections: {
    proofBar: true,
    story: true,
    expertise: true,
    results: true,
    event: true,
    speaking: true,
    newsletter: true,
  },
};
