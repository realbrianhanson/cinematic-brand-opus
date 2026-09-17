import { z } from "zod";
// AI/custom JSON is an input boundary: malformed fields must not crash public pages.
const text = z.string().catch("");
const strings = z.array(z.string()).catch([]);
const itemSchema = z.object({
  name: text,
  title: text,
  tool_name: text,
  idea: text,
  strategy: text,
  step: text,
  task: text,
  template_name: text,
  tactic: text,
  heading: text,
  question: text,
  mistake: text,
  description: text,
  content: text,
  text: text,
  answer: text,
  category: text,
  difficulty: text,
  priority: text,
  estimated_time: text,
  expected_impact: text,
  pro_tip: text,
  link: text,
  template: text,
  use_case: text,
  customization_tips: text,
  verdict: text,
  pricing: text,
  best_for: text,
  pros: strings,
  cons: strings,
  related_questions: strings,
  why: text,
  explanation: text,
});
const items = z.array(itemSchema).catch([]).optional();
const sectionSchema = z.object({
  name: text,
  title: text,
  heading: text,
  description: text,
  content: text,
  key_points: strings,
  items,
  tools: items,
  templates: items,
  steps: items,
  questions: items,
  checklist_items: items,
  faqs: items,
});
const sections = z.array(sectionSchema).catch([]).optional();
export const contentDocumentSchema = z
  .object({
    title: text,
    introduction: text,
    intro: text,
    hero_image: text,
    hero_image_alt: text,
    expert_callout: z.object({ quote: text }).catch({ quote: "" }),
    sources: z.array(z.object({ url: text, title: text })).catch([]),
    conclusion: text,
    summary: text,
    sections,
    categories: sections,
    phases: sections,
    items,
    tools: items,
    common_mistakes: items,
    frequently_asked_questions: z
      .array(z.object({ question: text, answer: text }))
      .catch([]),
    pro_tips: z
      .array(z.union([z.string(), z.object({ tip: text, text })]))
      .catch([]),
  })
  .catch({
    title: "",
    introduction: "",
    intro: "",
    hero_image: "",
    hero_image_alt: "",
    expert_callout: { quote: "" },
    sources: [],
    conclusion: "",
    summary: "",
    frequently_asked_questions: [],
    pro_tips: [],
  });
export type ContentDocument = z.infer<typeof contentDocumentSchema>;
export type ContentItem = z.infer<typeof itemSchema>;
export const parseContentDocument = (input: unknown): ContentDocument =>
  contentDocumentSchema.parse(input);
export const seoDocumentSchema = z
  .object({
    title: text,
    description: text,
    og_image: text,
    canonical_url: text,
    keywords: strings,
  })
  .catch({
    title: "",
    description: "",
    og_image: "",
    canonical_url: "",
    keywords: [],
  });
