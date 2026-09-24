/**
 * The approved testimonial selection, copied character for character from
 * the Sep 23 2026 spec (source: the Drive master list compiled that day plus
 * the Zoom chat screenshots). Quotes keep each speaker's own spelling and
 * casing. Never "fix" them here: these fixtures are the reference the site
 * data is checked against
 */

export const SPEC_DISCLOSURE =
  "These are individual results. They aren't typical, and they aren't a promise. What you earn depends on your skills, effort and market";

export const SPEC_CONTEXT = {
  bbs: "Build It. Brand It. Sell It. training chat · September 2026",
  communitySep: "Community chat · September 2026",
  communityJul: "Community chat · July 2026",
  masterskill: "Masterskill Workshop · May 2026",
  liveJune: "Live training · June 2026",
  liveMay: "Live training · May 2026",
  appMarch: "App Building Workshop · March 2026",
  pushTenOverview: "PushTen product overview · May 2026",
} as const;

export const SPEC_RESULTS = [
  {
    attribution: "Kathy Bryant",
    quote:
      "I remixed Brian's SEO/AEO report app, I modified for my brand and have closed 2 clients for SEO/AEO work. Over $2k. This is the real deal.",
    context: SPEC_CONTEXT.bbs,
    screenshot: {
      src: "/testimonials/kathy-results.webp",
      width: 528,
      height: 306,
      alt: "I remixed Brian’s SEO/AEO report app, I modified for my brand and have closed 2 clients for SEO/AEO work. Over $2k. This is the real deal.",
    },
  },
  {
    attribution: "Heiko Katins",
    quote:
      "...now that works ... already made 2,5K till now... not becoming a millionaire but not so bad either",
    context: SPEC_CONTEXT.communitySep,
    screenshot: {
      src: "/testimonials/heiko-results.webp",
      width: 594,
      height: 272,
      alt: "… now that works … already made 2,5K till now … not becoming a millionaire but not so bad either 😝 😂",
    },
  },
  {
    attribution: "Randi Winter",
    quote:
      "someone told me their website sucked except for the drone footage, so I did this and he offered to pay me to rebuild his site!",
    context: SPEC_CONTEXT.masterskill,
  },
  {
    attribution: "Jayme Johnson",
    quote:
      "You've up-leveled my business. I've been trying to figure out for the last six years how to create a sustainable business model where I could protect my IP but also collaborate with others, and it's through this program here that I've locked into that missing piece.",
    context: SPEC_CONTEXT.liveJune,
  },
  {
    attribution: "Alim Haji",
    quote:
      "Thank you for really inspiring this group to really get out there and start building things. I've built about 5 or 6 digital assets already, so thank you for inspiring us to do that.",
    context: SPEC_CONTEXT.appMarch,
  },
];

export const SPEC_NOT_A_TECHIE = [
  {
    attribution: "Susie Satram",
    quote:
      "From a newbie in AI...Push Ten has taught me to build websites in a couple hours. I had no experience in this, but I really feel more confident now. Brian really treats all of us like family. He doesn't care what your AI level is...he will hold your hand until you feel comfortable. He gives so many bonuses and we are already over 40 Apps/Templates already. Jump in now, you will not regret it.",
    context: SPEC_CONTEXT.bbs,
    screenshot: {
      src: "/testimonials/susie-1.webp",
      width: 528,
      height: 706,
      alt: "From a newbie in AI…Push Ten has taught me to build websites in a couple hours. I had no experience in this, but I really feel more confident now. Brian really treats all of us like family. He doesn't care what your AI level is…he will hold your hand until you feel comfortable. He gives so many bonuses and we are already over 40 Apps/Templates already. Jump in now, you will not regret it.",
    },
  },
  {
    attribution: "Heshie Segal",
    quote:
      "This is the BEST investment you can make, These guys are the real thing. I am NOT a techie. I have to listen to things several times so if I can do something like this, anyone can do this!",
    context: SPEC_CONTEXT.communityJul,
    screenshot: {
      src: "/testimonials/heshie.webp",
      width: 592,
      height: 466,
      alt: "This is the BEST investment you can make, These guys are the real thing. I am NOT a techie. I have to listen to things several times so if I can do something like this, anyone can do this! Francis is amazing. Brian is a non-stop firehose. T Therre is non-stop giving here",
      showQuote: true,
    },
  },
  {
    attribution: "Heiko Katins",
    quote:
      "I'm 59, and I didn't like AI until December, and when I joined you guys in January, that changed completely. So I'm vibe coding, I'm doing all that stuff, and thanks to you!",
    context: SPEC_CONTEXT.masterskill,
  },
  {
    attribution: "Kathleen Stapleton",
    quote:
      "I am a tech challenged. The community and Brian are always helpful and encouraging. They will help if you get stuck. It's an incredible community.",
    context: SPEC_CONTEXT.pushTenOverview,
  },
];

/** Randi's line is the pull quote; the rest follow in order */
export const SPEC_ABOUT = [
  {
    attribution: "Randi Winter",
    quote: "People can teach how, but they can't teach heart.",
    context: SPEC_CONTEXT.masterskill,
  },
  {
    attribution: "Lisa Wald",
    quote:
      "the value Brian is giving us is amazing. Ive been in the business launch and advising world for many years working at the SBA. This is totally amazing, nothing like it.",
    context: SPEC_CONTEXT.appMarch,
  },
  {
    attribution: "Dana Larew",
    quote:
      "Your intelligence educates on where to find, how to execute, provide human interaction. No APP can replace YOU, Brian.",
    context: SPEC_CONTEXT.masterskill,
  },
  {
    attribution: "Lisa Wald",
    quote:
      "brian has given us all what I call the 'Brian Bug'. Im staying up late at night, pop out of bed again at 6 AM, just building apps and sites. I haven't been this passionate in awhile.",
    context: SPEC_CONTEXT.appMarch,
  },
  {
    attribution: "Kurtis Rudd",
    quote:
      "Brian and the AI4B team always give much more than you paid for. I'm so happy to be part of this community.",
    context: SPEC_CONTEXT.liveMay,
  },
  {
    attribution: "Sara B. Gochberg",
    quote:
      "thank you @Brian Hanson.. over delivering is an understatement! I thought I was fired up before... now OMG!",
    context: SPEC_CONTEXT.appMarch,
  },
];

/** Randi's pull quote and Lisa Wald's SBA line */
export const SPEC_SPEAKING = [SPEC_ABOUT[0], SPEC_ABOUT[1]];

/** Group 4 short lines plus the two PushTen bonus lines */
export const SPEC_WALL = [
  { quote: "Brian is the Lovable Whisperer", attribution: "Jessica Farrone" },
  {
    quote: "BRIAN is AI4B biggest Motivator and Energy",
    attribution: "Heiko Katins",
  },
  { quote: "worth your weight three fold in gold!", attribution: "Lisa Wald" },
  {
    quote: "Its like Christmas every day with Brian Claus around",
    attribution: "Heather Olson",
  },
  {
    quote: "No one will be like Brian - he is unique!",
    attribution: "Ingrid Horn",
  },
  {
    quote: "This is the BEST investment you can make",
    attribution: "Heshie Segal",
  },
  {
    quote: "OMG!  PushTen has so much value, it’s truly a no brainer!",
    attribution: "SE Hartley",
  },
  {
    quote: "I love this app!! PushTen is AWESOME!!!",
    attribution: "Julie Cooper-Bierman",
  },
];

/**
 * The six quotes that led the homepage before this selection. They move,
 * unchanged, into the collapsed "More from the community" list
 */
export const SPEC_COMMUNITY = [
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
];
