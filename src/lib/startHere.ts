import type { ShopOffer } from "./shop";

export const START_HERE_GOALS = [
  {
    id: "follow-up",
    label: "Write better follow-ups",
    detail: "Turn notes into a useful next step",
  },
  {
    id: "build",
    label: "Build a website or app",
    detail: "Give your first project a clear scope",
  },
  {
    id: "marketing",
    label: "Improve my marketing",
    detail: "Make a repeatable workflow",
  },
] as const;

export type StartHereGoal = (typeof START_HERE_GOALS)[number]["id"];

export function startHereGoal(value: string | null): StartHereGoal {
  return START_HERE_GOALS.find((goal) => goal.id === value)?.id ?? "follow-up";
}

export function startHereGoalHref(
  goal: StartHereGoal,
  search: URLSearchParams,
): string {
  const next = new URLSearchParams(search);
  next.set("goal", goal);
  return `/start-here?${next}`;
}

/** Owner-only paths use actual public listings, never an unrelated first offer. */
export function startHereRecommendation(
  goal: StartHereGoal,
  offers: ShopOffer[],
) {
  const kit = offers.find(
    (offer) =>
      offer.slug === "ai-follow-up-starter-kit" && offer.kind === "free",
  );
  const workshop = offers.find(
    (offer) => offer.slug === "app-building-workshop",
  );
  if (goal === "build")
    return {
      heading: "Start with one page and one job",
      description:
        "Before choosing tools, describe who will use your site or app and the one thing it should help them do. Keep the first version small enough to try yourself.",
      tasks: [
        "Name the person you’re building for and their immediate problem",
        "Sketch the first screen and its main action",
        "Decide what a successful test would look like",
      ],
      check:
        "Can someone tell you what the page does and complete its main action without your explanation?",
      resource: workshop
        ? {
            title: workshop.title,
            summary: workshop.summary,
            href: `/offers/${workshop.slug}`,
            label: "See what the workshop includes",
            type:
              workshop.kind === "free"
                ? "Free training"
                : "Paid training · review the details first",
          }
        : {
            title: "AI for small business",
            summary:
              "Choose a manageable first project and decide how you’ll check the result.",
            href: "/guides/ai-for-small-business",
            label: "Read the free planning guide",
            type: "Free guide · read on this site",
          },
    };
  if (goal === "marketing")
    return {
      heading: "Build a process you can repeat",
      description:
        "Choose one marketing task you already do. Use AI for a first draft, then add your experience and check every claim before anything reaches a customer.",
      tasks: [
        "Pick one audience, one question, and one useful next action",
        "Draft from your own product facts and examples",
        "Review the message, links, and next step before publishing",
      ],
      check:
        "Does it answer a real customer question and make the next action clear? Keep a record of responses so you can improve it.",
      resource: {
        title: "AI marketing automation",
        summary:
          "Connect research, drafting, review, and publishing into a repeatable process.",
        href: "/guides/ai-marketing-automation",
        label: "Read the free marketing guide",
        type: "Free guide · read on this site",
      },
    };
  return {
    heading: "Turn rough notes into a clear follow-up",
    description:
      "Start with a conversation you understand. Use the facts to draft a short message, check what it says, and end with one clear question.",
    tasks: [
      "Collect the decisions, open questions, and agreed next step",
      "Ask for a short draft using only those facts",
      "Check names, dates, and promises before sending",
    ],
    check:
      "Could the recipient tell you what happens next? Remove anything that wasn’t agreed and fill in missing facts yourself.",
    resource: kit
      ? {
          title: kit.title,
          summary: kit.summary,
          href: `/offers/${kit.slug}`,
          label: "Get the free follow-up kit",
          type: "Free resource · see access details",
        }
      : {
          title: "AI for sales and customer service",
          summary:
            "Plan helpful follow-ups and answers, with clear points for human review.",
          href: "/guides/ai-sales-customer-service",
          label: "Read the free follow-up guide",
          type: "Free guide · read on this site",
        },
  };
}
