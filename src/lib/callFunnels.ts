export * from "../../supabase/functions/_shared/callFunnels";
import type { CallFunnelConfig } from "../../supabase/functions/_shared/callFunnels";
import { emptyCallFunnelScripts } from "./callFunnelScripts";
import { emptyCallPreparationExtras } from "../../supabase/functions/_shared/callFunnels";

/** An owner-neutral template. Identity, media and proof are explicitly chosen. */
export function emptyCallFunnelConfig(): CallFunnelConfig {
  const media = () => ({ url: "", poster: "", transcript: "" });
  return {
    version: 1,
    theme: { mode: "dark", accent: "#8b5cf6", font: "sans" },
    brand: {
      name: "Your business",
      hostName: "",
      hostRole: "",
      hostBio: "",
      hostImage: "",
    },
    invitation: {
      audience: "For business owners ready for a practical next step",
      headline: "Turn the work slowing you down into a clear plan forward.",
      description:
        "See how the approach works, tell us what you want to improve, and find out whether a conversation would be useful.",
      watchPrompt: "Watch the approach below.",
      video: media(),
      promise:
        "Bring a real problem. Leave the conversation with a clearer next step.",
      cta: "Explore a strategy call",
      ctaSubline: "Answer a few questions, then choose a time",
      reassurance:
        "We’ll discuss your situation, explain what working together involves, and help you decide whether it fits. You choose what happens next.",
      proofHeading: "Experiences worth hearing",
      closingHeadline: "What would you like to improve first?",
    },
    application: {
      heading: "Let’s find your next step",
      intro: "A few questions will help us make the conversation useful.",
      consentText:
        "I agree to be contacted about this application and any call I arrange. This does not subscribe me to marketing.",
      privacyUrl: "/privacy",
    },
    questions: [
      {
        id: "business",
        label:
          "Do you have an existing business and an offer you are actively selling?",
        help: "This helps us point you toward a useful next step.",
        type: "single",
        required: true,
        options: [
          { id: "active", label: "Yes, I have an active business and offer" },
          { id: "exploring", label: "I’m still building or exploring" },
        ],
      },
      {
        id: "priority",
        label: "What would you most like to improve?",
        help: "Share a task, obstacle, or result that matters to your business.",
        type: "textarea",
        required: true,
        options: [],
      },
      {
        id: "timing",
        label: "When would you be ready to take the next step?",
        help: "Choose the answer that best matches your situation.",
        type: "single",
        required: true,
        options: [
          { id: "soon", label: "I’m ready to explore getting help" },
          { id: "learning", label: "I’m gathering ideas and learning first" },
        ],
      },
    ],
    qualificationRules: [
      { questionId: "business", optionId: "exploring", outcome: "alternative" },
      { questionId: "timing", optionId: "learning", outcome: "alternative" },
    ],
    booking: {
      url: "",
      label: "Choose a call time",
      minutes: 30,
      agenda:
        "Bring the situation you want to improve. We’ll discuss your goals, what you’ve tried, and whether our approach is a useful fit.",
    },
    preparation: {
      headline: "Get ready for a useful conversation",
      intro:
        "Use this short checklist so we can spend the call on what matters to you.",
      video: media(),
      checklist: [
        "Check your booking confirmation for the time and meeting link.",
        "Invite anyone involved in deciding the next step.",
        "Bring one example of the work you want to improve.",
        "Watch the training and note your questions.",
      ],
      extras: {
        ...emptyCallPreparationExtras(),
        objections: {
          enabled: true,
          heading: "Questions before your call",
          intro:
            "Start with the answer that matters most to you. Bring any other questions to the conversation.",
          items: [
            [
              "What should I bring to the call?",
              "Bring one specific example of what you want to improve, what you have already tried, and the result you would like instead.",
            ],
            [
              "Will this fit my situation?",
              "Use the call to explain your current situation, goals and constraints. Ask how the approach would apply to your work and where it may not fit.",
            ],
            [
              "What would implementation involve?",
              "Ask which steps you would own, what support is included, and what your team would need to prepare before getting started.",
            ],
            [
              "What should I know about the investment?",
              "Review the current offer terms and bring questions about the total cost, billing schedule and scope. Make sure you understand the details before deciding.",
            ],
            [
              "Who else should attend?",
              "If someone else shares responsibility for the decision or implementation, consider inviting them so you can discuss the next step together.",
            ],
          ].map(([question, answer]) => ({
            enabled: true,
            question,
            answer,
            video: media(),
            captions: "",
          })),
        },
      },
    },
    training: {
      headline: "Your pre-call training",
      intro:
        "Get familiar with the approach before we talk about your situation.",
      video: media(),
      chapters: [
        { id: "approach", title: "The approach", seconds: 0 },
        {
          id: "implementation",
          title: "What implementation involves",
          seconds: 120,
        },
        { id: "questions", title: "Preparing your questions", seconds: 300 },
      ],
      notesPrompt: "What would you like to discuss?",
    },
    alternative: {
      headline: "A useful place to start, at your own pace.",
      intro:
        "If a call isn’t your next step, explore this resource and decide whether it fits what you need now.",
      video: media(),
      story:
        "Choose one practical task to work on. A resource, workshop, or membership can help you explore the approach before deciding whether you need personal support.",
      benefits: [
        {
          title: "Choose a manageable starting point",
          body: "Review what the resource includes and pick the part that fits your current situation.",
        },
        {
          title: "Decide what comes next",
          body: "Use what you learn to decide whether more support would be useful.",
        },
      ],
      faq: [
        {
          question: "Do I have to take this step?",
          answer:
            "No. This is an optional alternative. You can leave or return when a conversation is more useful.",
        },
      ],
      cta: "Explore this next step",
      url: "",
      price: "",
      billing: "",
      proofIds: [],
    },
    proofIds: [],
    proofImages: {},
    scripts: { ...emptyCallFunnelScripts() },
  };
}
