import type { SiteConfig } from "../types";
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
    items: [
      { label: "Shop", href: "/shop" },
      {
        label: "Free Resources",
        children: [
          {
            label: "Start Here",
            href: "/start-here",
            description: "Find the right next step.",
          },
          {
            label: "Guides & Resources",
            href: "/resources",
            description: "Practical ideas you can put to work.",
          },
          {
            label: "Articles",
            href: "/blog",
            description: "Go deeper on the topics that matter.",
          },
          {
            label: "AI News",
            href: "/news",
            description: "See what is changing and why it matters.",
          },
        ],
      },
      { label: "About Brian", href: "#story" },
      { label: "Speaking", href: "/speaking" },
    ],
    hashLinks: [{ label: "About Brian", href: "#story" }],
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
      href: freeSummitUrl,
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

  // Source documents and excerpt boundaries are recorded in docs/TESTIMONIALS.md.
  // These belong to Brian's site; member presets must use their own feedback.
  homepageTestimonials: {
    overline: "From the Community",
    heading: "Less overwhelm. More “I can do this.”",
    intro:
      "Feedback from live training, events, and PushTen, in participants' own words.",
    items: [
      {
        quote:
          "@BrianHanson built me an Accountability App for Network Marketers that was Absolutely Brilliant... in about 30 mins!",
        attribution: "Steve Cunningham",
        context: "App-building feedback · January 2026",
      },
      {
        quote:
          "Brian is just giving out GOLD! To me, the tips he's giving has taken a long time to gather. If you are on the fence, talk to him.",
        attribution: "E B Soloway",
        context: "Training feedback · May 2026",
      },
      {
        quote:
          "I have Brian's mindset now - I use to think I wanted to create everything from scratch. Nah - technology is moving so fast. I am the queen of leverage, modify, accentuate, customized. No longer want to reinvent the wheel. I am able to move faster and still put my spin on things and it is curated.",
        attribution: "lisa bond",
        context: "Summit attendee · April 2026",
      },
      {
        quote:
          "Brian's 2-day PushTen seminar was phenomenal. He covers from A-Z all of the steps of what to do to build your AI business using tools like Lovable, GoHighLevel, Claude, and many other AI tools and knowledge to successfully build your apps and take your ideas and businesses to market. I highly recommend it to anyone, both beginners and advanced, to the PushTen 2-day seminar program and to the PushTen program too.",
        attribution: "Lynn Hutchison",
        context: "PushTen seminar participant · Excerpt",
      },
      {
        quote:
          "This was amazing Brian!!! Thank you! Already invited three people to join!",
        attribution: "Marla Ray",
        context: "Summit attendee · July 2026",
      },
      {
        quote:
          "I almost scrolled right past this ad… I was so skeptical about the AI for Business Summit. But I signed up last minute anyway—and WOW. Mind blown. Practical, clear, and actually useful. Let's just say… I'm now signing up for Pro.",
        attribution: "Patricia Pisterzi",
        context: "Summit attendee · January 2026",
      },
    ],
  },

  story: {
    portraitSrc: "/portraits/brian-trail-clean-v1.webp",
    portraitAlt: "Brian Hanson standing on a sunlit wooded trail",
    portraitWidth: 960,
    portraitHeight: 1280,
    overline: "The operator behind the advice",
    headingLead: "I build what",
    headingAccent: "I teach.",
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
    overline: "Practical by design",
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
    overline: "Live · Online · Interactive",
    headingAccent: "Free 3-Day",
    headingRest: "AI for Business Summit",
    intro:
      "Learn how to use AI for marketing, sales, content, and lead generation. Join the live online summit for practical examples of tools, ads, funnels, and prospect follow-up—even if you're starting from scratch.",
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
      label: "Reserve Your Free 3-Day Pass",
      href: freeSummitUrl,
      external: true,
    },
    ctaNote:
      "Attend online for free. Check the registration page for the next dates and session times.",
  },

  speaking: {
    overline: "Keynotes & Workshops",
    headingLead: "Bring Brian",
    headingAccent: "to your stage.",
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
    headingLead: "A smarter start",
    headingAccent: "to your week.",
    intro:
      "Useful tools. Ideas worth trying. A weekly selection of AI articles and business workflows, straight to your inbox.",
    privacyNote: "No spam, ever. Unsubscribe anytime.",
    secondaryCta: {
      label: "Join the Free 3-Day AI Summit",
      href: freeSummitUrl,
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
    hashLinks: [{ label: "About Brian", href: "#story" }],
    routeLinks: [
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
      "Questions about a purchase, speaking, or working together? Get in touch.",
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
