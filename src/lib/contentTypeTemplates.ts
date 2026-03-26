export interface SchemaTemplate {
  name: string;
  slug: string;
  description: string;
  renderer_component: string;
  items_per_section: number;
  title_template: string;
  description_template: string;
  schema_definition: object;
}

export const CONTENT_TYPE_TEMPLATES: SchemaTemplate[] = [
  {
    name: "Tool Roundups",
    slug: "tool-roundups",
    description: "Curated collections of the best tools for specific topics, with pricing, pros/cons, and use cases.",
    renderer_component: "ToolRoundupRenderer",
    items_per_section: 10,
    title_template: "{{count}} Best Tools for {{niche_name}} in {{year}}",
    description_template: "Discover the {{count}} best tools for {{niche_name}} in {{year}}. Expert-curated with pricing, pros/cons, and real use cases.",
    schema_definition: {"type":"object","required":["intro","sections","frequently_asked_questions","pro_tips"],"properties":{"intro":{"type":"string","description":"2-3 sentence direct answer to the search query. Include a specific number or stat."},"sections":{"type":"array","description":"Tool categories grouped by function or use case","items":{"type":"object","required":["title","description","tools"],"properties":{"title":{"type":"string"},"description":{"type":"string","description":"1-2 sentences explaining this category"},"tools":{"type":"array","items":{"type":"object","required":["name","description","best_for","pricing","pros","cons"],"properties":{"name":{"type":"string"},"description":{"type":"string","description":"2-3 sentences on what it does"},"best_for":{"type":"string","description":"One sentence on ideal user"},"pricing":{"type":"string","description":"Free tier, starting price, or price range"},"pros":{"type":"array","items":{"type":"string"},"minItems":2,"maxItems":3},"cons":{"type":"array","items":{"type":"string"},"minItems":1,"maxItems":2},"link":{"type":"string","description":"URL to the tool"}}}}}}},"pro_tips":{"type":"array","items":{"type":"object","required":["title","tip"],"properties":{"title":{"type":"string"},"tip":{"type":"string","description":"Non-obvious, actionable advice"}}},"minItems":3,"maxItems":5},"frequently_asked_questions":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string"},"answer":{"type":"string","description":"2-4 sentence factual answer"}}},"minItems":5,"maxItems":5}}},
  },
  {
    name: "Implementation Checklists",
    slug: "implementation-checklists",
    description: "Step-by-step checklists readers can follow to implement strategies in specific areas.",
    renderer_component: "ChecklistRenderer",
    items_per_section: 12,
    title_template: "The Complete {{niche_name}} Checklist for {{year}} ({{count}}+ Steps)",
    description_template: "Follow this {{niche_name}} checklist with {{count}}+ actionable steps. Updated for {{year}} with expert tips.",
    schema_definition: {"type":"object","required":["intro","sections","frequently_asked_questions","pro_tips"],"properties":{"intro":{"type":"string","description":"2-3 sentence direct answer. Include how long implementation takes or expected ROI."},"sections":{"type":"array","description":"Checklist phases (e.g. Setup, Configuration, Launch, Optimize)","items":{"type":"object","required":["title","description","checklist_items"],"properties":{"title":{"type":"string"},"description":{"type":"string"},"checklist_items":{"type":"array","items":{"type":"object","required":["task","description","priority"],"properties":{"task":{"type":"string","description":"Action item starting with a verb"},"description":{"type":"string","description":"1-2 sentences explaining why and how"},"priority":{"type":"string","enum":["critical","important","nice-to-have"]},"time_estimate":{"type":"string","description":"e.g. 15 min, 1 hour, 1 day"},"pro_tip":{"type":"string","description":"Optional insider advice"}}}}}}},"pro_tips":{"type":"array","items":{"type":"object","required":["title","tip"],"properties":{"title":{"type":"string"},"tip":{"type":"string"}}},"minItems":3,"maxItems":5},"frequently_asked_questions":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string"},"answer":{"type":"string"}}},"minItems":5,"maxItems":5}}},
  },
  {
    name: "Strategy Guides",
    slug: "strategy-guides",
    description: "In-depth guides teaching readers how to build and execute strategies for specific topics.",
    renderer_component: "GuideRenderer",
    items_per_section: 8,
    title_template: "{{niche_name}}: The Complete Guide for {{year}}",
    description_template: "Master {{niche_name}} with this comprehensive {{year}} guide. Step-by-step strategies, tools, and expert insights.",
    schema_definition: {"type":"object","required":["intro","sections","common_mistakes","frequently_asked_questions","pro_tips"],"properties":{"intro":{"type":"string","description":"2-3 sentence direct answer positioning this as the definitive guide. Include a stat or timeframe."},"sections":{"type":"array","description":"Guide chapters covering the topic comprehensively","items":{"type":"object","required":["title","content","key_points"],"properties":{"title":{"type":"string","description":"Chapter heading, ideally phrased as a question or how-to"},"content":{"type":"string","description":"3-5 sentences of substantive explanation"},"key_points":{"type":"array","items":{"type":"string"},"minItems":3,"maxItems":5,"description":"Actionable takeaways from this section"},"tools":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"description":{"type":"string"},"link":{"type":"string"}}},"description":"Optional: specific tools relevant to this section"}}}},"common_mistakes":{"type":"array","items":{"type":"object","required":["mistake","why"],"properties":{"mistake":{"type":"string"},"why":{"type":"string","description":"Why this is a problem and what to do instead"}}},"minItems":3,"maxItems":5},"pro_tips":{"type":"array","items":{"type":"object","required":["title","tip"],"properties":{"title":{"type":"string"},"tip":{"type":"string"}}},"minItems":3,"maxItems":5},"frequently_asked_questions":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string"},"answer":{"type":"string"}}},"minItems":5,"maxItems":5}}},
  },
  {
    name: "Ideas & Use Cases",
    slug: "ideas-and-use-cases",
    description: "Curated lists of ideas, use cases, and opportunities organized by topic.",
    renderer_component: "IdeaListRenderer",
    items_per_section: 15,
    title_template: "{{count}} {{niche_name}} Ideas to Try in {{year}}",
    description_template: "Explore {{count}} proven {{niche_name}} ideas for {{year}}. Actionable use cases with difficulty ratings and potential.",
    schema_definition: {"type":"object","required":["intro","categories","frequently_asked_questions","pro_tips"],"properties":{"intro":{"type":"string","description":"2-3 sentences directly answering the implied search query with a specific number or stat."},"categories":{"type":"array","description":"Grouped categories of ideas","items":{"type":"object","required":["title","description","items"],"properties":{"title":{"type":"string"},"description":{"type":"string"},"items":{"type":"array","items":{"type":"object","required":["name","description","difficulty","revenue_potential"],"properties":{"name":{"type":"string"},"description":{"type":"string","description":"2-3 sentences on the idea and how to execute"},"difficulty":{"type":"string","enum":["beginner","intermediate","advanced"]},"revenue_potential":{"type":"string","description":"e.g. $500-2K/mo, $5K+/mo"},"tools_needed":{"type":"string","description":"Key tools or platforms required"},"pro_tip":{"type":"string","description":"Insider advice for this specific idea"}}}}}}},"pro_tips":{"type":"array","items":{"type":"object","required":["title","tip"],"properties":{"title":{"type":"string"},"tip":{"type":"string"}}},"minItems":3,"maxItems":5},"frequently_asked_questions":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string"},"answer":{"type":"string"}}},"minItems":5,"maxItems":5}}},
  },
  {
    name: "Templates & Frameworks",
    slug: "templates-and-frameworks",
    description: "Ready-to-use templates readers can copy and customize for specific tasks.",
    renderer_component: "TemplateRenderer",
    items_per_section: 10,
    title_template: "{{count}} {{niche_name}} Templates You Can Copy Today ({{year}})",
    description_template: "Grab {{count}} ready-to-use {{niche_name}} templates for {{year}}. Copy, customize, and deploy immediately.",
    schema_definition: {"type":"object","required":["intro","sections","frequently_asked_questions","pro_tips"],"properties":{"intro":{"type":"string","description":"2-3 sentences explaining what these templates do and the time they save."},"sections":{"type":"array","description":"Template categories grouped by use case","items":{"type":"object","required":["title","description","templates"],"properties":{"title":{"type":"string"},"description":{"type":"string"},"templates":{"type":"array","items":{"type":"object","required":["name","description","template_text","how_to_use"],"properties":{"name":{"type":"string"},"description":{"type":"string","description":"What this template accomplishes"},"template_text":{"type":"string","description":"The actual template text with [PLACEHOLDER] variables"},"how_to_use":{"type":"string","description":"1-2 sentences on how to customize and deploy"},"best_for":{"type":"string","description":"Ideal scenario or business type"},"pro_tip":{"type":"string"}}}}}}},"pro_tips":{"type":"array","items":{"type":"object","required":["title","tip"],"properties":{"title":{"type":"string"},"tip":{"type":"string"}}},"minItems":3,"maxItems":5},"frequently_asked_questions":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string"},"answer":{"type":"string"}}},"minItems":5,"maxItems":5}}},
  },
  {
    name: "FAQ Collections",
    slug: "faq-collections",
    description: "Comprehensive FAQ pages answering the most common questions about specific topics.",
    renderer_component: "FAQRenderer",
    items_per_section: 10,
    title_template: "{{niche_name}}: {{count}} Questions Answered ({{year}} Guide)",
    description_template: "Get answers to {{count}} common questions about {{niche_name}}. Expert answers updated for {{year}}.",
    schema_definition: {"type":"object","required":["intro","sections","frequently_asked_questions","pro_tips"],"properties":{"intro":{"type":"string","description":"2-3 sentences framing why these questions matter and who this is for."},"sections":{"type":"array","description":"FAQ categories (e.g. Getting Started, Costs, Tools, Strategy)","items":{"type":"object","required":["title","description","faqs"],"properties":{"title":{"type":"string"},"description":{"type":"string"},"faqs":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string","description":"Natural language question people actually search"},"answer":{"type":"string","description":"3-5 sentence authoritative answer with specifics"},"related_tip":{"type":"string","description":"Optional bonus insight"}}}}}}},"pro_tips":{"type":"array","items":{"type":"object","required":["title","tip"],"properties":{"title":{"type":"string"},"tip":{"type":"string"}}},"minItems":3,"maxItems":5},"frequently_asked_questions":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string"},"answer":{"type":"string"}}},"minItems":5,"maxItems":5}}},
  },
];
