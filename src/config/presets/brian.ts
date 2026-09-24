import type { SiteConfig } from "../types";
import { summitHref } from "../../lib/summitLink";
import {
  brianAboutTestimonials,
  brianHomepageTestimonials,
  brianSpeakingTestimonials,
} from "./brianTestimonials";
const brianHeadshot = "/brian-headshot.webp";

const freeSummitUrl = "https://go.aiforbusiness.com/summit?_go=brian60";

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
      "AI, marketing, and building businesses that matter. Playbooks, frameworks, and applied strategy from Brian Hanson",
    newsDescription:
      "Daily AI, marketing, and sales news from around the world, summarized in one place",
    resourceDescription: "Free AI guides and resources for business owners",
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
      "Learn practical AI for marketing, sales, and everyday business with Brian Hanson. Explore free training, useful guides, and keynote speaking",
    socialDescription:
      "Practical AI education for business owners. Join Brian Hanson for free training, explore step-by-step guides, or bring him to your next event",
    socialImageUrl: "https://brianhanson.com/og-default.png",
    faviconHref: "/brian-favicon-v1.png",
    appleTouchIconHref: "/brian-touch-icon-v1.png",
    rssTitle: "Brian Hanson | Blog",
  },

  brand: {
    accent: "#D4AF55",
    accentLight: "#E8C96A",
    accentDark: "#B8962E",
    backdrop: "#07070E",
  },

  nav: {
    items: [
      { label: "Shop", href: "/shop" },
      {
        label: "Free Resources",
        children: [
          {
            label: "Start Here",
            href: "/start-here",
            description: "Find the right next step",
          },
          {
            label: "Guides & Resources",
            href: "/resources",
            description: "Practical ideas you can put to work",
          },
          {
            label: "Articles",
            href: "/blog",
            description: "Go deeper on the topics that matter",
          },
          {
            label: "AI News",
            href: "/news",
            description: "See what’s changing and why it matters",
          },
        ],
      },
      { label: "About Brian", href: "/about" },
      { label: "Speaking", href: "/speaking" },
    ],
    hashLinks: [],
    routeLinks: [],
    cta: {
      label: "Free AI Summit",
      href: freeSummitUrl,
      external: true,
    },
    mobileCtaLabel: "Free 3-Day AI Summit →",
  },

  hero: {
    overline: "Brian Hanson · AI for Business",
    headlineLines: [
      { text: "Put AI to work" },
      { text: "in your business.", gold: true, italic: true },
    ],
    subtitle:
      "Make better marketing. Get time back. Build the tools your business needs. I’ll show you how to put AI to work—without a coding background.",
    primaryCta: {
      label: "Join Free 3-Day AI Summit",
      // Tagged here because the hero component itself stays untouched.
      href: summitHref(freeSummitUrl, "hero"),
      external: true,
    },
    secondaryCta: { label: "Explore Tools & Training", href: "/shop" },
    socialProof: "150,000+ in the AI For Business community",
    videoSrc: "/videos/hero-bg.mp4",
    posterSrc: "/videos/hero-poster.jpg",
  },

  proofBadges: [
    "4× Inc. 5000 · Real Advisors",
    "150,000+ AI For Business community",
    "3,000+ Revven users",
  ],

  // Source documents, excerpt rules and permissions: docs/TESTIMONIALS.md.
  homepageTestimonials: brianHomepageTestimonials,
  aboutTestimonials: brianAboutTestimonials,
  speakingTestimonials: brianSpeakingTestimonials,

  story: {
    portraitSrc: "/portraits/brian-trail-clean-v1.webp",
    portraitAlt: "Brian Hanson standing on a sunlit wooded trail",
    portraitWidth: 960,
    portraitHeight: 1280,
    overline: "The operator behind the advice",
    headingLead: "I build what",
    headingAccent: "I teach",
    intro:
      "I teach the way I had to learn: choose a real problem, try a practical solution, and keep what works",
    timeline: [
      {
        icon: "award",
        tag: "Build",
        time: "From Iowa to Real Advisors",
        text: "I grew up in small-town Iowa without money or connections. Building an engine and transmission business taught me systems and selling. Real Advisors later earned four Inc. 5000 appearances, reaching #80",
      },
      {
        icon: "flame",
        tag: "Rebuild",
        time: "2020",
        text: "When COVID shut down my live events business, I faced more than $1 million in debt. I chose to rebuild. That experience still shapes how I think about risk, resilience, and useful work",
      },
      {
        icon: "sparkles",
        tag: "Teach",
        time: "AI For Business & Revven",
        accent: true,
        text: "Today, AI For Business brings together a community of 150,000+ people. I also built Revven, a software platform with 3,000+ users, without writing code. I share the practical lessons so you can start applying them to your own business",
      },
    ],
    pullQuote:
      "I didn't come from money, connections, or a degree. I came from necessity and a refusal to stay stuck",
  },

  expertise: {
    overline: "Practical by design",
    headingLead: "Start with the work",
    headingAccent: "on your desk",
    intro:
      "Choose a task you already understand. Use AI to help with it, check the result, and build from there",
    cards: [
      {
        icon: "brain",
        title: "Simplify repetitive work",
        text: "Organize customer information, summarize a meeting, or draft a follow-up. Keep your team in control of the decisions that matter",
      },
      {
        icon: "target",
        title: "Create clearer marketing",
        text: "Turn customer questions into useful articles, emails, and offers. Bring your experience; use AI to help shape the draft",
      },
      {
        icon: "code",
        title: "Build a useful tool",
        text: "Explore a simple calculator, intake form, or internal app. Start with one job the tool needs to do, then test it before expanding",
      },
      {
        icon: "users",
        title: "Learn with a practical example",
        text: "Follow a demonstration, try the steps in your own business, and learn what to check before relying on the output",
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
    overline: "Live · Online · Interactive",
    headingAccent: "Free 3-Day",
    headingRest: "AI for Business Summit",
    intro:
      "Learn how to use AI for marketing, sales, content, and lead generation. Join live online for practical examples of tools, ads, funnels, and prospect follow-up. Starting from scratch is fine",
    imageSrc: null,
    imageAlt: "",
    days: [
      {
        day: "Day 1",
        title: "Master the tools",
        bullets: [
          "Understand the AI basics, even as a beginner",
          "Learn which tools to use and when",
          "Write prompts that produce more useful answers",
        ],
      },
      {
        day: "Day 2",
        title: "AI for marketing & sales",
        bullets: [
          "Create content, ads, and funnels with AI",
          "Find prospects and generate leads",
          "Put AI to work across your social media",
        ],
      },
      {
        day: "Day 3",
        title: "Turn prompts into profit",
        bullets: [
          "Write and sell in your authentic brand voice",
          "Follow up with prospects using AI",
          "Map out what to do first and what to do next",
        ],
      },
    ],
    cta: {
      label: "Save My Free Seat",
      href: freeSummitUrl,
      external: true,
    },
    ctaNote:
      "Free to attend online. The registration page lists the next dates and session times",
  },

  speaking: {
    overline: "Keynotes & Workshops",
    headingLead: "Bring Brian",
    headingAccent: "to your stage",
    intro:
      "AI talks for business owners and their teams. I show the tools working, then share what building, losing, and rebuilding companies taught me",
    topics: [
      {
        title: "AI for Business Leaders",
        desc: "Understand where AI can help your team, where it needs oversight, and how to choose a useful first project",
      },
      {
        title: "From Idea to Useful Tool",
        desc: "See how business knowledge, clear instructions, and no-code tools can turn a recurring problem into a working prototype",
      },
      {
        title: "From Burnout to Breakthrough",
        desc: "The story of losing everything, choosing to rebuild, and using AI as the foundation. Resilience, reinvention, and reclaiming your life",
      },
    ],
    bookingCta: {
      label: "Check Brian’s Availability",
      href: "mailto:brian@brianhanson.com?subject=Speaking%20Inquiry",
    },
    portraitSrc: brianHeadshot,
    portraitAlt: "Brian Hanson",
    testimonial: null,
  },

  newsletter: {
    headingLead: "Try one new AI idea",
    headingAccent: "every week",
    intro:
      "The AI articles and business workflows worth trying this week, in one email",
    privacyNote: "No spam. Unsubscribe in one click",
    secondaryCta: {
      label: "Join the Free 3-Day AI Summit",
      href: freeSummitUrl,
      external: true,
    },
    secondaryCtaLabel: "Prefer to learn live?",
  },

  featuredResources: {
    overline: "Useful starting points",
    heading: "Pick one problem and try one idea",
    intro: "Start with a guide you can use in the work you already do",
    items: [
      {
        label: "Start using AI in your business",
        href: "/guides/ai-for-small-business",
        description:
          "Choose a manageable first project and decide how you’ll check the result",
        category: "Start here",
      },
      {
        label: "Build a marketing workflow",
        href: "/guides/ai-marketing-automation",
        description:
          "Connect your research, drafting, review, and publishing into a repeatable process",
        category: "Marketing",
      },
      {
        label: "Improve sales and customer service",
        href: "/guides/ai-sales-customer-service",
        description:
          "Plan helpful follow-ups and answers, with clear points for human review",
        category: "Sales & service",
      },
    ],
  },

  footer: {
    hashLinks: [],
    routeLinks: [
      { label: "About Brian", href: "/about" },
      { label: "Start Here", href: "/start-here" },
      { label: "Shop", href: "/shop" },
      { label: "Speaking", href: "/speaking" },
      { label: "Blog", href: "/blog" },
      { label: "News", href: "/news" },
      { label: "Resources", href: "/resources" },
      { label: "Support", href: "/support" },
      { label: "Sitemap", href: "/sitemap" },
    ],
    contactNote:
      "Questions about a purchase, speaking, or working together? Get in touch",
    privacyUrl: "/privacy",
    termsUrl: "/terms",
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
