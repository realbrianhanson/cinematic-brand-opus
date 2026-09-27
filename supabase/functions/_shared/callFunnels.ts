/** Shared, versioned contracts for the Video + Application template. */
export type CallMedia = { url: string; poster: string; transcript: string };
export type CallPreparationExtras = {
  overview: {
    enabled: boolean;
    heading: string;
    description: string;
    button: string;
    url: string;
  };
  objections: {
    enabled: boolean;
    heading: string;
    intro: string;
    items: {
      enabled: boolean;
      question: string;
      answer: string;
      video: CallMedia;
      captions: string;
    }[];
  };
  proofHeading: string;
  proofIds: string[];
};
/** Optional modules stay absent on older saved funnels until the owner enables them. */
export function emptyCallPreparationExtras(): CallPreparationExtras {
  return {
    overview: {
      enabled: false,
      heading: "Review the offer before we talk",
      description:
        "See what is included and note anything you would like to clarify.",
      button: "Read the offer overview",
      url: "",
    },
    objections: {
      enabled: false,
      heading: "Questions before your call",
      intro: "Explore the answers that matter to your decision.",
      items: [],
    },
    proofHeading: "Experiences relevant to your next step",
    proofIds: [],
  };
}
export type CallQuestion = {
  id: string;
  label: string;
  help: string;
  type: "single" | "text" | "textarea";
  required: boolean;
  options: { id: string; label: string }[];
  showWhen?: { questionId: string; optionId: string };
};
export type CallAnswers = Record<string, string>;
export type CallContact = { name: string; email: string };
export type CallProof = {
  id: string;
  title: string;
  content: string;
  attribution: string;
  source_url: string;
};
export type CallFunnelConfig = {
  version: 1;
  theme: {
    mode: "dark" | "light" | "site";
    accent: string;
    font: "sans" | "serif" | "brand";
  };
  brand: {
    name: string;
    hostName: string;
    hostRole: string;
    hostBio: string;
    hostImage: string;
  };
  invitation: {
    audience: string;
    headline: string;
    description: string;
    watchPrompt: string;
    video: CallMedia;
    promise: string;
    cta: string;
    ctaSubline: string;
    reassurance: string;
    proofHeading: string;
    closingHeadline: string;
  };
  application: {
    heading: string;
    intro: string;
    consentText: string;
    privacyUrl: string;
  };
  questions: CallQuestion[];
  qualificationRules: {
    questionId: string;
    optionId: string;
    outcome: "alternative";
  }[];
  booking: { url: string; label: string; minutes: number; agenda: string };
  preparation: {
    headline: string;
    intro: string;
    video: CallMedia;
    checklist: string[];
    extras?: CallPreparationExtras;
  };
  training: {
    headline: string;
    intro: string;
    video: CallMedia;
    chapters: { id: string; title: string; seconds: number }[];
    notesPrompt: string;
  };
  alternative: {
    headline: string;
    intro: string;
    video: CallMedia;
    story: string;
    benefits: { title: string; body: string }[];
    faq: { question: string; answer: string }[];
    cta: string;
    url: string;
    price: string;
    billing: string;
    proofIds: string[];
  };
  proofIds: string[];
  proofImages: Record<string, string>;
  scripts: Record<string, string | number>;
};
export type PublicCallConfig = Omit<
  CallFunnelConfig,
  "scripts" | "qualificationRules"
>;
export type CallPublication = {
  id: string;
  slug: string;
  title: string;
  revision: number;
  config: PublicCallConfig;
  proof: CallProof[];
};
export type CallFunnelDraft = {
  id: string;
  slug: string;
  title: string;
  version: number;
  published_version: number | null;
  active: boolean;
  draft_config: CallFunnelConfig;
  updated_at: string;
};
export type CallApplicationState = {
  id: string;
  outcome: "qualified" | "alternative";
  revision: number;
  slug: string;
  title: string;
  config: PublicCallConfig;
  proof: CallProof[];
  submittedAt: string;
  booking: {
    status: "unconfirmed" | "booked" | "cancelled";
    startsAt: string | null;
    timezone?: string;
    meetingUrl?: string | null;
    manageUrl?: string | null;
    source: "signed_webhook" | "admin" | null;
  };
  attendance?: { status: string; source: string | null };
  sale?: { status: string; source: string | null };
};
export type CallOutcomeKind =
  "booked" | "cancelled" | "rescheduled" | "attended" | "no_show" | "sale";
const idPattern = /^[a-z][a-z0-9-]{0,47}$/;
const uuidPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function callUrl(value: unknown, local = false): boolean {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\s\\]/.test(value) ||
    [...value].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return false;
  if (!value) return true;
  if (local && /^\/(?!\/)[a-zA-Z0-9/_.,?=#%&+-]*$/.test(value)) return true;
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" && !!u.hostname && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
/** Bounded exact-shape validation before any private draft becomes public. */
export function callConfigIssues(value: unknown, publish = false): string[] {
  const errors: string[] = [];
  function shape(
    v: unknown,
    fields: string[],
    path: string,
    optional: string[] = [],
  ): v is Record<string, unknown> {
    if (
      !obj(v) ||
      Object.keys(v).some(
        (k) => !fields.includes(k) && !optional.includes(k),
      ) ||
      fields.some((k) => !Object.hasOwn(v, k))
    ) {
      errors.push(`${path}: check the required fields.`);
      return false;
    }
    return true;
  }
  function text(v: unknown, max: number, path: string, required = false) {
    if (
      typeof v !== "string" ||
      v.includes(String.fromCharCode(0)) ||
      v.length > max ||
      (required && !v.trim())
    )
      errors.push(
        `${path}: ${required ? "enter text, " : ""}up to ${max} characters.`,
      );
  }
  function url(v: unknown, path: string, local = false) {
    if (!callUrl(v, local))
      errors.push(
        `${path}: use a complete HTTPS address${local ? " or a site path" : ""}.`,
      );
  }
  function media(v: unknown, path: string) {
    if (!shape(v, ["url", "poster", "transcript"], path)) return;
    url(v.url, `${path} video`);
    url(v.poster, `${path} poster`, true);
    text(v.transcript, 12000, `${path} transcript`);
  }
  function list(v: unknown, max: number, path: string): v is unknown[] {
    if (!Array.isArray(v) || v.length > max) {
      errors.push(`${path}: use up to ${max} items.`);
      return false;
    }
    return true;
  }
  function proofs(v: unknown, path: string) {
    if (
      list(v, 12, path) &&
      (v.some((id) => typeof id !== "string" || !uuidPattern.test(id)) ||
        new Set(v).size !== v.length)
    )
      errors.push(`${path}: select unique proof items.`);
  }
  if (
    !shape(
      value,
      [
        "version",
        "theme",
        "brand",
        "invitation",
        "application",
        "questions",
        "qualificationRules",
        "booking",
        "preparation",
        "training",
        "alternative",
        "proofIds",
        "proofImages",
        "scripts",
      ],
      "Template",
    )
  )
    return errors;
  if (value.version !== 1) errors.push("Unsupported template version.");
  if (shape(value.theme, ["mode", "accent", "font"], "Design")) {
    if (
      typeof value.theme.mode !== "string" ||
      !["dark", "light", "site"].includes(value.theme.mode) ||
      typeof value.theme.font !== "string" ||
      !["sans", "serif", "brand"].includes(value.theme.font) ||
      typeof value.theme.accent !== "string" ||
      !/^#[a-f0-9]{6}$/i.test(value.theme.accent)
    )
      errors.push("Design: select a theme, font and six-digit accent color.");
  }
  if (
    shape(
      value.brand,
      ["name", "hostName", "hostRole", "hostBio", "hostImage"],
      "Brand",
    )
  ) {
    for (const k of ["name", "hostName", "hostRole"])
      text(value.brand[k], 160, `Brand ${k}`, publish && k === "name");
    text(value.brand.hostBio, 3000, "Host introduction");
    url(value.brand.hostImage, "Host image", true);
  }
  if (
    shape(
      value.invitation,
      [
        "audience",
        "headline",
        "description",
        "watchPrompt",
        "video",
        "promise",
        "cta",
        "ctaSubline",
        "reassurance",
        "proofHeading",
        "closingHeadline",
      ],
      "Invitation",
    )
  ) {
    for (const k of [
      "audience",
      "headline",
      "description",
      "watchPrompt",
      "promise",
      "cta",
      "ctaSubline",
      "reassurance",
      "proofHeading",
      "closingHeadline",
    ])
      text(
        value.invitation[k],
        k === "description" || k === "reassurance" ? 2000 : 500,
        `Invitation ${k}`,
        publish && ["headline", "cta"].includes(k),
      );
    media(value.invitation.video, "Invitation");
  }
  if (
    shape(
      value.application,
      ["heading", "intro", "consentText", "privacyUrl"],
      "Application",
    )
  ) {
    text(value.application.heading, 300, "Application heading", publish);
    text(value.application.intro, 1200, "Application introduction");
    text(value.application.consentText, 1200, "Application consent", publish);
    url(value.application.privacyUrl, "Privacy notice", true);
    if (publish && !value.application.privacyUrl)
      errors.push("Application: add a privacy notice.");
  }
  const questions: CallQuestion[] = [];
  if (list(value.questions, 15, "Questions")) {
    if (!value.questions.length) errors.push("Add at least one question.");
    for (const q of value.questions) {
      const before = errors.length;
      if (
        !obj(q) ||
        Object.keys(q).some(
          (k) =>
            ![
              "id",
              "label",
              "help",
              "type",
              "required",
              "options",
              "showWhen",
            ].includes(k),
        )
      ) {
        errors.push("Question: unsupported fields.");
        continue;
      }
      if (
        typeof q.id !== "string" ||
        !idPattern.test(q.id) ||
        questions.some((x) => x.id === q.id)
      )
        errors.push("Question: use a unique stable ID.");
      text(q.label, 500, "Question label", true);
      text(q.help, 1000, "Question help");
      if (
        typeof q.type !== "string" ||
        !["single", "text", "textarea"].includes(q.type) ||
        typeof q.required !== "boolean"
      )
        errors.push("Question: choose a supported answer type.");
      if (list(q.options, 8, "Answer choices")) {
        if (
          (q.type === "single" && q.options.length < 2) ||
          (q.type !== "single" && q.options.length !== 0)
        )
          errors.push(
            "Use 2–8 choices for a choice question and none for text answers.",
          );
        const ids = new Set<string>();
        for (const o of q.options) {
          if (!shape(o, ["id", "label"], "Choice")) continue;
          if (
            typeof o.id !== "string" ||
            !idPattern.test(o.id) ||
            ids.has(o.id)
          )
            errors.push("Choice: use unique stable IDs.");
          else ids.add(o.id);
          text(o.label, 300, "Choice label", true);
        }
      }
      if (q.showWhen !== undefined) {
        const condition = q.showWhen;
        if (
          shape(condition, ["questionId", "optionId"], "Conditional question")
        ) {
          const prior = questions.find((x) => x.id === condition.questionId);
          if (
            !prior ||
            prior.type !== "single" ||
            !prior.options.some((o) => o.id === condition.optionId)
          )
            errors.push(
              "Conditional question: choose an answer from an earlier choice question.",
            );
        }
      }
      if (errors.length === before)
        questions.push(q as unknown as CallQuestion);
    }
  }
  if (list(value.qualificationRules, 30, "Fit rules"))
    for (const r of value.qualificationRules) {
      if (!shape(r, ["questionId", "optionId", "outcome"], "Fit rule"))
        continue;
      const q = questions.find((q) => q.id === r.questionId);
      if (
        r.outcome !== "alternative" ||
        q?.type !== "single" ||
        !q.options.some((o) => o.id === r.optionId)
      )
        errors.push("Fit rule: select an existing choice answer.");
    }
  if (shape(value.booking, ["url", "label", "minutes", "agenda"], "Booking")) {
    url(value.booking.url, "Booking URL");
    text(value.booking.label, 120, "Booking button", publish);
    text(value.booking.agenda, 3000, "Call agenda");
    if (
      !Number.isInteger(value.booking.minutes) ||
      Number(value.booking.minutes) < 5 ||
      Number(value.booking.minutes) > 240
    )
      errors.push("Call length: use 5–240 minutes.");
    if (publish && !value.booking.url)
      errors.push("Booking: connect your calendar before publishing.");
  }
  if (
    shape(
      value.preparation,
      ["headline", "intro", "video", "checklist"],
      "Preparation",
      ["extras"],
    )
  ) {
    text(value.preparation.headline, 300, "Preparation heading", publish);
    text(value.preparation.intro, 2000, "Preparation introduction");
    media(value.preparation.video, "Preparation");
    if (list(value.preparation.checklist, 12, "Checklist"))
      value.preparation.checklist.forEach((v) =>
        text(v, 500, "Checklist item", true),
      );
    if (Object.hasOwn(value.preparation, "extras")) {
      const extra = value.preparation.extras;
      if (
        shape(
          extra,
          ["overview", "objections", "proofHeading", "proofIds"],
          "Preparation extras",
        )
      ) {
        text(extra.proofHeading, 300, "Preparation proof heading");
        proofs(extra.proofIds, "Preparation proof");
        if (
          shape(
            extra.overview,
            ["enabled", "heading", "description", "button", "url"],
            "Offer overview",
          )
        ) {
          const overview = extra.overview;
          if (typeof overview.enabled !== "boolean")
            errors.push("Offer overview: choose whether to show it.");
          text(
            overview.heading,
            300,
            "Offer overview heading",
            publish && overview.enabled === true,
          );
          text(overview.description, 2000, "Offer overview description");
          text(
            overview.button,
            120,
            "Offer overview button",
            publish && overview.enabled === true,
          );
          url(overview.url, "Offer overview URL");
          if (publish && overview.enabled === true && !overview.url)
            errors.push(
              "Offer overview: add the HTTPS document or presentation link.",
            );
        }
        if (
          shape(
            extra.objections,
            ["enabled", "heading", "intro", "items"],
            "Preparation questions",
          )
        ) {
          const objections = extra.objections;
          if (typeof objections.enabled !== "boolean")
            errors.push("Preparation questions: choose whether to show them.");
          text(
            objections.heading,
            300,
            "Preparation questions heading",
            publish && objections.enabled === true,
          );
          text(objections.intro, 2000, "Preparation questions introduction");
          if (list(objections.items, 8, "Preparation questions")) {
            for (const item of objections.items) {
              if (
                !shape(
                  item,
                  ["enabled", "question", "answer", "video", "captions"],
                  "Preparation answer",
                )
              )
                continue;
              if (typeof item.enabled !== "boolean")
                errors.push("Preparation answer: choose whether to show it.");
              const required =
                publish && objections.enabled === true && item.enabled === true;
              text(item.question, 300, "Preparation question", required);
              text(item.answer, 3000, "Preparation answer", required);
              media(item.video, "Preparation answer");
              url(item.captions, "Preparation captions");
            }
          }
        }
      }
    }
  }
  if (
    shape(
      value.training,
      ["headline", "intro", "video", "chapters", "notesPrompt"],
      "Training",
    )
  ) {
    text(value.training.headline, 300, "Training heading", publish);
    text(value.training.intro, 2000, "Training introduction");
    text(value.training.notesPrompt, 500, "Notes prompt");
    media(value.training.video, "Training");
    if (list(value.training.chapters, 20, "Chapters")) {
      const ids = new Set();
      for (const c of value.training.chapters) {
        if (!shape(c, ["id", "title", "seconds"], "Chapter")) continue;
        if (typeof c.id !== "string" || !idPattern.test(c.id) || ids.has(c.id))
          errors.push("Chapter: use unique IDs.");
        ids.add(c.id);
        text(c.title, 300, "Chapter title", true);
        if (
          !Number.isInteger(c.seconds) ||
          Number(c.seconds) < 0 ||
          Number(c.seconds) > 86400
        )
          errors.push("Chapter time: use seconds from 0 to 86400.");
      }
    }
  }
  if (
    shape(
      value.alternative,
      [
        "headline",
        "intro",
        "video",
        "story",
        "benefits",
        "faq",
        "cta",
        "url",
        "price",
        "billing",
        "proofIds",
      ],
      "Alternative offer",
    )
  ) {
    for (const k of ["headline", "intro", "story", "cta", "price", "billing"])
      text(
        value.alternative[k],
        k === "story" ? 6000 : 2000,
        `Alternative ${k}`,
        publish && ["headline", "cta"].includes(k),
      );
    media(value.alternative.video, "Alternative");
    url(value.alternative.url, "Alternative destination", true);
    proofs(value.alternative.proofIds, "Alternative proof");
    if (list(value.alternative.benefits, 8, "Benefits"))
      for (const b of value.alternative.benefits) {
        if (shape(b, ["title", "body"], "Benefit")) {
          text(b.title, 300, "Benefit heading", true);
          text(b.body, 2000, "Benefit description");
        }
      }
    if (list(value.alternative.faq, 12, "FAQs"))
      for (const f of value.alternative.faq) {
        if (shape(f, ["question", "answer"], "FAQ")) {
          text(f.question, 300, "FAQ question", true);
          text(f.answer, 3000, "FAQ answer", true);
        }
      }
    if (publish && !value.alternative.url)
      errors.push("Alternative offer: choose a useful next destination.");
  }
  proofs(value.proofIds, "Invitation proof");
  if (!obj(value.proofImages) || Object.keys(value.proofImages).length > 36)
    errors.push("Proof portraits: use up to 36 images.");
  else
    for (const [id, v] of Object.entries(value.proofImages)) {
      if (!uuidPattern.test(id))
        errors.push("Proof portrait: choose a proof item.");
      url(v, "Proof portrait", true);
    }
  const scriptKeys = [
    "inspirationSource",
    "inspirationPattern",
    "experimentNote",
    "buyer",
    "problem",
    "trigger",
    "mechanism",
    "deliverables",
    "evidence",
    "callOutcome",
    "voice",
    "riskTerms",
    "invitation",
    "welcome",
    "training",
    "wordsPerMinute",
  ];
  if (
    !obj(value.scripts) ||
    Object.keys(value.scripts).some((k) => !scriptKeys.includes(k))
  )
    errors.push("Scripts: unsupported fields.");
  else
    for (const [k, v] of Object.entries(value.scripts)) {
      if (k === "inspirationSource") {
        if (
          typeof v !== "string" ||
          !["", "closers", "wojo", "justin", "acquisition"].includes(v)
        )
          errors.push("Inspiration source: select a reviewed source.");
      } else if (k === "wordsPerMinute") {
        if (!Number.isInteger(v) || Number(v) < 80 || Number(v) > 220)
          errors.push("Speaking pace: use 80–220 words per minute.");
      } else
        text(
          v,
          ["invitation", "welcome", "training"].includes(k) ? 12000 : 1200,
          `Script ${k}`,
        );
    }
  return [...new Set(errors)];
}
export function parseCallConfig(v: unknown, publish = false): CallFunnelConfig {
  const issues = callConfigIssues(v, publish);
  if (issues.length) throw new Error(issues.join(" "));
  return v as CallFunnelConfig;
}
export function publicCallConfig(c: CallFunnelConfig): PublicCallConfig {
  const { scripts: _scripts, qualificationRules: _rules, ...safe } = c;
  return safe;
}
export function visibleCallQuestions(
  config: Pick<CallFunnelConfig, "questions">,
  answers: CallAnswers,
): CallQuestion[] {
  const visible: CallQuestion[] = [];
  for (const q of config.questions)
    if (
      !q.showWhen ||
      (visible.some((p) => p.id === q.showWhen!.questionId) &&
        answers[q.showWhen.questionId] === q.showWhen.optionId)
    )
      visible.push(q);
  return visible;
}
export function cleanCallAnswers(
  config: Pick<CallFunnelConfig, "questions">,
  answers: CallAnswers,
): CallAnswers {
  return Object.fromEntries(
    visibleCallQuestions(config, answers)
      .filter((q) => Object.hasOwn(answers, q.id))
      .map((q) => [q.id, answers[q.id]]),
  );
}
export function callAnswerError(q: CallQuestion, answer: unknown): string {
  if (answer === undefined || answer === "")
    return q.required ? "Please answer this question." : "";
  if (
    typeof answer !== "string" ||
    answer.includes(String.fromCharCode(0)) ||
    answer.length > 2000
  )
    return "Use up to 2,000 characters.";
  if (q.type === "single" && !q.options.some((o) => o.id === answer))
    return "Choose one of the available answers.";
  if (q.required && !answer.trim()) return "Please answer this question.";
  return "";
}
export function evaluateCallApplication(
  config: CallFunnelConfig,
  raw: unknown,
  contact: unknown,
): {
  answers: CallAnswers;
  contact: CallContact;
  outcome: "qualified" | "alternative";
} {
  if (
    !obj(raw) ||
    Object.keys(raw).length > 15 ||
    !obj(contact) ||
    Object.keys(contact).some((k) => !["name", "email"].includes(k))
  )
    throw new Error("Check your application details.");
  if (
    typeof contact.name !== "string" ||
    contact.name.includes(String.fromCharCode(0)) ||
    !contact.name.trim() ||
    contact.name.length > 160 ||
    typeof contact.email !== "string" ||
    contact.email.includes(String.fromCharCode(0)) ||
    contact.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)
  )
    throw new Error("Enter your name and a valid email address.");
  const visible = visibleCallQuestions(config, raw as CallAnswers);
  if (Object.keys(raw).some((id) => !visible.some((q) => q.id === id)))
    throw new Error("Your answers changed. Review the visible questions.");
  for (const q of visible) {
    const error = callAnswerError(q, raw[q.id]);
    if (error) throw new Error(`${q.label}: ${error}`);
  }
  const answers = cleanCallAnswers(config, raw as CallAnswers);
  const alternative = config.qualificationRules.some(
    (r) =>
      Object.hasOwn(answers, r.questionId) &&
      answers[r.questionId] === r.optionId,
  );
  return {
    answers,
    contact: {
      name: contact.name.trim(),
      email: contact.email.trim().toLowerCase(),
    },
    outcome: alternative ? "alternative" : "qualified",
  };
}
