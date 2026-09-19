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
    defaultTitle: "Brian Hanson | AI for Business Educator & Keynote Speaker",
    defaultDescription:
      "Learn practical AI for marketing, sales, and everyday business with Brian Hanson. Explore free training, useful guides, and keynote speaking.",
    socialDescription:
      "Practical AI education for business owners. Join Brian Hanson for free training, explore step-by-step guides, or bring him to your next event.",
    socialImageUrl: "https://brianhanson.com/og-default.png",
    faviconHref: "/brian-favicon-v1.png",
    appleTouchIconHref: "/brian-touch-icon-v1.png",
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
    ],
    routeLinks: [
      { label: "Shop", href: "/shop" },
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
      { text: "Put AI to work" },
      { text: "in your business.", gold: true, italic: true },
    ],
    subtitle:
      "Learn how to create better marketing, simplify repetitive work, and build useful tools with Brian Hanson. No coding background required.",
    primaryCta: {
      label: "Join Free 3-Day AI Event",
      href: "https://aiforbeginners.com",
      external: true,
    },
    secondaryCta: { label: "Book Brian to Speak", href: "#speaking" },
    socialProof: "150,000+ in the AI For Business community",
    videoSrc: "/videos/hero-bg.mp4",
    posterSrc: "/videos/hero-poster.jpg",
  },

  proofBadges: [
    "4× Inc. 5000 · Real Advisors",
    "150,000+ AI For Business community",
    "3,000+ Revven users",
  ],

  // Source documents and excerpt boundaries are recorded in docs/TESTIMONIALS.md.
  // These belong to Brian's site; member presets must use their own feedback.
  homepageTestimonials: {
    overline: "From the Community",
    heading: "What attendees are taking away.",
    intro:
      "Feedback from AI For Business training and events, in attendees' own words.",
    items: [
      {
        quote:
          "This training has been awesome. I did not know much about AI and I now feel like I at least know where to start. Awesome... Brian!",
        attribution: "Robin Leal",
        context: "Summit attendee · January 2026",
      },
      {
        quote:
          "Your intro to the tools is great Brian… it is so helpful to have the voice over and quick suggestions and examples for possible uses makes them so much more easy to get acquainted with them…",
        attribution: "James Linton",
        context: "Summit attendee · April 2026",
      },
      {
        quote:
          "@BrianHanson built me an Accountability App for Network Marketers that was Absolutely Brilliant... in about 30 mins!",
        attribution: "Steve Cunningham",
        context: "App-building feedback · January 2026",
      },
      {
        quote:
          "I have been working with Claude over a year and I learn something new this morning. Thanks, Brian!",
        attribution: "Lynda Menge",
        context: "Summit attendee · July 2026",
      },
      {
        quote:
          "No longer want to reinvent the wheel. I am able to move faster and still put my spin on things and it is curated.",
        attribution: "lisa bond",
        context: "Summit attendee · April 2026",
      },
      {
        quote:
          "Today's content was beyond my expectations. Fantastic details I haven't gotten in any other presentation.",
        attribution: "Wendy Kazi",
        context: "Summit attendee · February 2026",
      },
    ],
  },

  story: {
    overline: "The Story",
    headingLead: "Built businesses.",
    headingAccent: "Started over. Kept building.",
    intro:
      "I teach the way I had to learn: choose a real problem, try a practical solution, and keep what works.",
    timeline: [
      {
        icon: "award",
        tag: "Build",
        time: "From Iowa to Real Advisors",
        text: "I grew up in small-town Iowa without money or connections. Building an engine and transmission business taught me systems and selling. Real Advisors later earned four Inc. 5000 appearances, reaching #80.",
      },
      {
        icon: "flame",
        tag: "Rebuild",
        time: "2020",
        text: "When COVID shut down my live events business, I faced more than $1 million in debt. I chose to rebuild. That experience still shapes how I think about risk, resilience, and useful work.",
      },
      {
        icon: "sparkles",
        tag: "Teach",
        time: "AI For Business & Revven",
        accent: true,
        text: "Today, AI For Business brings together a community of 150,000+ people. I also built Revven, a software platform with 3,000+ users, without writing code. I share the practical lessons so you can start applying them to your own business.",
      },
    ],
    pullQuote:
      "I didn't come from money, connections, or a degree. I came from necessity and a refusal to stay stuck.",
  },

  expertise: {
    overline: "Core Expertise",
    headingLead: "Start with the work",
    headingAccent: "on your desk.",
    intro:
      "Choose a task you already understand. Use AI to help with it, check the result, and build from there.",
    cards: [
      {
        icon: "brain",
        title: "Simplify repetitive work",
        text: "Organize customer information, summarize a meeting, or draft a follow-up. Keep your team in control of the decisions that matter.",
      },
      {
        icon: "target",
        title: "Create clearer marketing",
        text: "Turn customer questions into useful articles, emails, and offers. Bring your experience; use AI to help shape the draft.",
      },
      {
        icon: "code",
        title: "Build a useful tool",
        text: "Explore a simple calculator, intake form, or internal app. Start with one job the tool needs to do, then test it before expanding.",
      },
      {
        icon: "users",
        title: "Learn with a practical example",
        text: "Follow a demonstration, try the steps in your own business, and learn what to check before relying on the output.",
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
      sub: "AI For Business community",
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
    headingRest: "to Get Started with AI",
    intro:
      "A free virtual training for business owners who want to understand the tools and put them to work. Follow practical demonstrations, then plan your next step.",
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
          "Check the output before using it",
        ],
      },
      {
        day: "Day 3",
        title: "Scale & Automate",
        bullets: [
          "Choose which tasks to automate next",
          "Keep a human review where it matters",
          "Your 90-day implementation roadmap",
        ],
      },
    ],
    cta: {
      label: "See Dates & Register Free",
      href: "https://aiforbeginners.com",
      external: true,
    },
    ctaNote:
      "Free virtual training. Visit the event page for current dates and registration details.",
  },

  speaking: {
    overline: "Keynotes & Workshops",
    headingLead: "Bring Brian",
    headingAccent: "to Your Stage",
    intro:
      "Practical AI talks for business owners and teams. I use demonstrations, business examples, and lessons from building and rebuilding companies to make the next step clear.",
    topics: [
      {
        title: "AI for Business Leaders",
        desc: "Understand where AI can help your team, where it needs oversight, and how to choose a useful first project.",
      },
      {
        title: "From Idea to Useful Tool",
        desc: "See how business knowledge, clear instructions, and no-code tools can turn a recurring problem into a working prototype.",
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
    testimonial: null,
  },

  newsletter: {
    headingLead: "A practical AI idea",
    headingAccent: "for your week.",
    intro:
      "Get a weekly selection of useful AI articles, tools, and business workflows. See what they can help with and what to check before trying them.",
    privacyNote: "No spam, ever. Unsubscribe anytime.",
    secondaryCta: {
      label: "Join the Free 3-Day AI Event",
      href: "https://aiforbeginners.com",
      external: true,
    },
    secondaryCtaLabel: "Prefer to learn live?",
  },

  featuredResources: {
    overline: "Useful starting points",
    heading: "Pick one problem. Try one idea.",
    intro: "Start with a guide you can use in the work you already do.",
    items: [
      {
        label: "Start using AI in your business",
        href: "/guides/ai-for-small-business",
        description:
          "Choose a manageable first project and decide how you will check the result.",
        category: "Start here",
      },
      {
        label: "Build a marketing workflow",
        href: "/guides/ai-marketing-automation",
        description:
          "Connect your research, drafting, review, and publishing into a repeatable process.",
        category: "Marketing",
      },
      {
        label: "Improve sales and customer service",
        href: "/guides/ai-sales-customer-service",
        description:
          "Plan helpful follow-ups and answers, with clear points for human review.",
        category: "Sales & service",
      },
    ],
  },

  footer: {
    hashLinks: [
      { label: "Story", href: "#story" },
      { label: "Expertise", href: "#expertise" },
      { label: "Speaking", href: "#speaking" },
    ],
    routeLinks: [
      { label: "Shop", href: "/shop" },
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
    results: false,
    event: true,
    speaking: true,
    newsletter: true,
  },
};
