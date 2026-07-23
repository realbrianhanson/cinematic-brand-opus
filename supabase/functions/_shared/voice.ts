// Shared voice + quality utilities used by all content-generation functions.
// Keep this file dependency-light: it's imported by multiple edge functions.

export interface VoiceConfig {
  voice_profile: string;
  banned_phrases: string[];
}

export interface LintViolation {
  type: "banned_phrase" | "em_dash" | "not_x_but_y";
  match: string;
  index: number;
  message: string;
}

/**
 * Load voice_profile + banned_phrases from site_settings_private (admin-only).
 * Callers use the service role, which bypasses RLS. Anonymous readers can no
 * longer see these values via the public site_settings row.
 */
export async function loadVoiceConfig(supabase: any): Promise<VoiceConfig> {
  const { data } = await supabase
    .from("site_settings_private")
    .select("voice_profile, banned_phrases")
    .limit(1)
    .maybeSingle();
  return {
    voice_profile: (data?.voice_profile || "").trim(),
    banned_phrases: Array.isArray(data?.banned_phrases) ? data.banned_phrases : [],
  };
}

/**
 * Load the site-wide default expert POV (admin-only). Returns "" if unset.
 */
export async function loadDefaultExpertPov(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("site_settings_private")
    .select("default_expert_pov")
    .limit(1)
    .maybeSingle();
  return typeof data?.default_expert_pov === "string" ? data.default_expert_pov.trim() : "";
}

/**
 * Format the voice config as a prompt block to include in system prompts.
 */
export function formatVoiceBlock(cfg: VoiceConfig): string {
  if (!cfg.voice_profile && cfg.banned_phrases.length === 0) return "";

  const bannedList = cfg.banned_phrases.length
    ? cfg.banned_phrases.map((p) => `  - ${p}`).join("\n")
    : "  (none configured)";

  return `
═══ VOICE — WRITE IN THIS EXACT VOICE ═══
Any phrase on the banned list is a HARD FAILURE. Any em dash (— or –) is a HARD FAILURE.
Never fabricate personal stories, client wins, or first-person anecdotes; write from a
practitioner point of view using only facts from provided research or context.

VOICE PROFILE:
${cfg.voice_profile || "(no voice profile configured)"}

BANNED PHRASES (case-insensitive, whole-string match; never emit any of these):
${bannedList}

BANNED PUNCTUATION:
  - Em dash (—) and en dash (–) — use commas, colons, periods, or parentheses instead.

BANNED STRUCTURES (do not use):
  - "This isn't X. It's Y." / "It's not X, it's Y."
  - "Not because X but because Y."
═══ END VOICE ═══
`.trim();
}

/**
 * Lint a piece of text (any string — HTML or plain) for voice violations.
 * Returns all offenses; empty array = clean.
 */
export function lintContent(text: string, bannedPhrases: string[]): LintViolation[] {
  const violations: LintViolation[] = [];
  if (!text || typeof text !== "string") return violations;

  const lower = text.toLowerCase();

  // 1. Banned phrases (case-insensitive substring)
  for (const raw of bannedPhrases) {
    const phrase = (raw || "").trim();
    if (!phrase) continue;
    const needle = phrase.toLowerCase();
    let from = 0;
    while (true) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      violations.push({
        type: "banned_phrase",
        match: text.slice(idx, idx + phrase.length),
        index: idx,
        message: `Banned phrase: "${phrase}"`,
      });
      from = idx + needle.length;
    }
  }

  // 2. Em dash / en dash
  const dashRegex = /[—–]/g;
  let m: RegExpExecArray | null;
  while ((m = dashRegex.exec(text)) !== null) {
    violations.push({
      type: "em_dash",
      match: m[0],
      index: m.index,
      message: `Em/en dash at position ${m.index} — replace with comma, colon, period, or parentheses.`,
    });
  }

  // 3. "This isn't X. It's Y." / "Not X, it's Y" / "Not because X but because Y"
  const notButPatterns = [
    /\b(?:this|it|that)\s+(?:is\s*n['’]?t|isn['’]?t|['’]s\s+not)\s+[^.!?\n]{2,80}[.!?]\s+(?:it['’]?s|that['’]?s)\s+[^.!?\n]{2,80}[.!?]/gi,
    /\bit['’]?s\s+not\s+[^,.!?\n]{2,80},\s+it['’]?s\s+[^,.!?\n]{2,80}/gi,
    /\bnot\s+because\s+[^,.!?\n]{2,80}\s+but\s+because\s+[^,.!?\n]{2,80}/gi,
  ];
  for (const re of notButPatterns) {
    while ((m = re.exec(text)) !== null) {
      violations.push({
        type: "not_x_but_y",
        match: m[0].slice(0, 120),
        index: m.index,
        message: `"Not X but Y" structure — rewrite as a direct positive statement.`,
      });
    }
  }

  return violations;
}

/**
 * Walk a JSON object (like content_json) and lint every string value.
 * Returns a flat list of violations, each tagged with the JSON path.
 */
export function lintJson(
  node: unknown,
  bannedPhrases: string[],
  path = "$",
): (LintViolation & { path: string })[] {
  const out: (LintViolation & { path: string })[] = [];
  if (node === null || node === undefined) return out;
  if (typeof node === "string") {
    for (const v of lintContent(node, bannedPhrases)) {
      out.push({ ...v, path });
    }
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => out.push(...lintJson(v, bannedPhrases, `${path}[${i}]`)));
    return out;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out.push(...lintJson(v, bannedPhrases, `${path}.${k}`));
    }
  }
  return out;
}

// ─────────────────────────── QUALITY SCORING ───────────────────────────

export interface ScoreResult {
  score: number;
  issues: string[];
}

/**
 * Score a generated_page's content_json. Thin-content threshold is 800 words.
 */
export function scoreContent(contentJson: any, title: string): ScoreResult {
  const issues: string[] = [];
  let score = 100;

  const intro = contentJson?.intro || "";
  if (!intro) { score -= 20; issues.push("Missing intro"); }
  else if (intro.split(/[.!?]+/).filter(Boolean).length < 2) {
    score -= 10; issues.push("Intro too short (< 2 sentences)");
  }

  const sections = contentJson?.sections || contentJson?.categories || [];
  if (!Array.isArray(sections) || sections.length === 0) {
    score -= 25; issues.push("No content sections");
  } else {
    for (const section of sections) {
      const items =
        section.items || section.tools || section.steps || section.checklist_items || [];
      if (Array.isArray(items) && items.length < 3) {
        score -= 5;
        issues.push(
          `Section "${section.title || section.heading || "unknown"}" has fewer than 3 items`,
        );
      }
    }
  }

  const faqs = contentJson?.frequently_asked_questions || contentJson?.faq_items || [];
  if (!Array.isArray(faqs) || faqs.length < 3) {
    score -= 15; issues.push("Fewer than 3 FAQ items");
  }

  const jsonStr = JSON.stringify(contentJson).toLowerCase();
  const genericPhrases = ["lorem ipsum", "placeholder", "todo", "tbd", "insert here", "example.com"];
  for (const phrase of genericPhrases) {
    if (jsonStr.includes(phrase)) {
      score -= 10;
      issues.push(`Contains generic placeholder: "${phrase}"`);
    }
  }

  if (!/20\d{2}/.test(title)) {
    score -= 5; issues.push("Title missing year for freshness");
  }

  const tips = contentJson?.pro_tips || [];
  if (!Array.isArray(tips) || tips.length === 0) {
    score -= 5; issues.push("No pro tips");
  }

  const strings: string[] = [];
  function extract(obj: any) {
    if (typeof obj === "string") strings.push(obj);
    else if (Array.isArray(obj)) obj.forEach(extract);
    else if (obj && typeof obj === "object") Object.values(obj).forEach(extract);
  }
  extract(contentJson);
  const wordCount = strings.join(" ").split(/\s+/).filter(Boolean).length;
  if (wordCount < 800) {
    score -= 15;
    issues.push(`Content too thin: ${wordCount} words (minimum 800)`);
  }

  return { score: Math.max(0, score), issues };
}

/**
 * Score a blog post's HTML content + structured fields.
 */
export function scorePost(post: {
  title?: string;
  content?: string;
  faq_items?: unknown[];
  key_takeaways?: unknown[];
  tldr?: string;
  excerpt?: string;
}): ScoreResult {
  const issues: string[] = [];
  let score = 100;

  const stripped = (post.content || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = stripped ? stripped.split(/\s+/).length : 0;
  if (wordCount < 800) {
    score -= 20;
    issues.push(`Post too thin: ${wordCount} words (minimum 800)`);
  }

  if (!post.tldr) { score -= 5; issues.push("Missing TL;DR"); }
  if (!post.excerpt) { score -= 5; issues.push("Missing excerpt"); }
  if (!Array.isArray(post.key_takeaways) || post.key_takeaways.length < 3) {
    score -= 10; issues.push("Fewer than 3 key takeaways");
  }
  if (!Array.isArray(post.faq_items) || post.faq_items.length < 3) {
    score -= 15; issues.push("Fewer than 3 FAQ items");
  }
  if (!/20\d{2}/.test(post.title || "")) {
    score -= 5; issues.push("Title missing year for freshness");
  }

  return { score: Math.max(0, score), issues };
}

// ─────────────────────────── AI HELPERS ───────────────────────────

export const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

/**
 * Ask the model to critique + revise a draft against the voice + research.
 * Returns the revised object in the same JSON schema as the input.
 */
export async function critiqueAndRevise(params: {
  apiKey: string;
  model: string;
  voiceBlock: string;
  researchContext: string;
  draftJson: unknown;
  schemaHint: string; // e.g. "listicle content_json" or "blog post fields"
  maxTokens?: number;
}): Promise<{ revised: any; tokensUsed: number; error?: string }> {
  const systemPrompt = `You are a ruthless senior editor. You receive a draft and rewrite it to enforce the voice guide and remove filler. Rules:
1. Strip and rewrite any banned phrase or em/en dash. No exceptions.
2. Cut generic filler sentences that could appear in any article. Replace with specifics from the research.
3. Tighten anything vague into concrete numbers, names, or examples from the research.
4. Remove any tool, statistic, or claim not supported by the research context. Do not invent replacements.
5. Preserve the JSON structure exactly. Same keys, same nesting, same array lengths where possible.
6. Never fabricate personal stories or client anecdotes.
Return ONLY the revised JSON. No markdown fences, no preamble, no trailing commentary.`;

  const userPrompt = `${params.voiceBlock}

${params.researchContext ? `RESEARCH CONTEXT (only source of truth for tool names, stats, dates):\n${params.researchContext.slice(0, 8000)}\n\n` : ""}
DRAFT TO REVISE (${params.schemaHint}):
${JSON.stringify(params.draftJson)}

Return the revised JSON object with the same schema.`;

  try {
    const resp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: params.maxTokens ?? 8192,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { revised: params.draftJson, tokensUsed: 0, error: `revise ${resp.status}: ${errText.slice(0, 200)}` };
    }

    const data = await resp.json();
    const tokensUsed = data.usage?.total_tokens || 0;
    const raw = data.choices?.[0]?.message?.content || "";
    try {
      const revised = JSON.parse(extractJson(raw));
      return { revised, tokensUsed };
    } catch (e: any) {
      return { revised: params.draftJson, tokensUsed, error: `revise parse: ${e.message}` };
    }
  } catch (e: any) {
    return { revised: params.draftJson, tokensUsed: 0, error: `revise threw: ${e.message}` };
  }
}

/**
 * Given a draft with known lint violations, ask the model to mechanically fix
 * ONLY those violations. Do not touch anything else.
 */
export async function mechanicalFixViolations(params: {
  apiKey: string;
  model: string;
  draftJson: unknown;
  violations: (LintViolation & { path?: string })[];
  bannedPhrases: string[];
  schemaHint: string;
}): Promise<{ revised: any; tokensUsed: number; error?: string }> {
  if (params.violations.length === 0) {
    return { revised: params.draftJson, tokensUsed: 0 };
  }

  const violationList = params.violations
    .slice(0, 40)
    .map(
      (v, i) =>
        `${i + 1}. [${v.type}] at ${v.path ?? "?"}: "${v.match}" — ${v.message}`,
    )
    .join("\n");

  const systemPrompt = `You are a mechanical editor. You will receive a JSON draft and a list of specific violations. Your ONLY job is to fix those exact violations by rewriting the offending sentences to remove the banned phrases and em/en dashes. Do not touch anything else. Do not shorten. Do not restructure. Same JSON schema, same keys, same array lengths. Return ONLY the revised JSON.`;

  const userPrompt = `BANNED PHRASES (never emit any of these, case-insensitive): ${JSON.stringify(params.bannedPhrases)}
BANNED PUNCTUATION: em dash (—), en dash (–)

VIOLATIONS TO FIX:
${violationList}

DRAFT (${params.schemaHint}):
${JSON.stringify(params.draftJson)}

Return the revised JSON with only those violations fixed.`;

  try {
    const resp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 8192,
      }),
    });

    if (!resp.ok) {
      return { revised: params.draftJson, tokensUsed: 0, error: `fix ${resp.status}` };
    }

    const data = await resp.json();
    const tokensUsed = data.usage?.total_tokens || 0;
    const raw = data.choices?.[0]?.message?.content || "";
    try {
      const revised = JSON.parse(extractJson(raw));
      return { revised, tokensUsed };
    } catch (e: any) {
      return { revised: params.draftJson, tokensUsed, error: `fix parse: ${e.message}` };
    }
  } catch (e: any) {
    return { revised: params.draftJson, tokensUsed: 0, error: `fix threw: ${e.message}` };
  }
}

/**
 * Run the full pipeline: critique+revise → lint → mechanical fix if needed.
 * Returns the final content + remaining violations (to store as lint_flags).
 */
export async function refineWithVoice(params: {
  apiKey: string;
  model: string;
  voice: VoiceConfig;
  researchContext: string;
  draftJson: unknown;
  schemaHint: string;
}): Promise<{
  refined: any;
  remainingViolations: (LintViolation & { path: string })[];
  tokensUsed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let totalTokens = 0;
  const voiceBlock = formatVoiceBlock(params.voice);

  // Pass 1: critique + revise
  const revised = await critiqueAndRevise({
    apiKey: params.apiKey,
    model: params.model,
    voiceBlock,
    researchContext: params.researchContext,
    draftJson: params.draftJson,
    schemaHint: params.schemaHint,
  });
  totalTokens += revised.tokensUsed;
  if (revised.error) errors.push(revised.error);

  // Lint the revised draft
  let current = revised.revised;
  let violations = lintJson(current, params.voice.banned_phrases);

  // Pass 2: mechanical fix targeting remaining violations
  if (violations.length > 0) {
    const fixed = await mechanicalFixViolations({
      apiKey: params.apiKey,
      model: params.model,
      draftJson: current,
      violations,
      bannedPhrases: params.voice.banned_phrases,
      schemaHint: params.schemaHint,
    });
    totalTokens += fixed.tokensUsed;
    if (fixed.error) errors.push(fixed.error);
    current = fixed.revised;
    violations = lintJson(current, params.voice.banned_phrases);
  }

  return {
    refined: current,
    remainingViolations: violations,
    tokensUsed: totalTokens,
    errors,
  };
}

// ─────────────────────────── TITLE / META HELPERS ───────────────────────────

/**
 * Compose "Page Title | Site Name" but drop the suffix entirely if it would
 * push past ~65 chars. Never cut mid-word.
 */
export function composeTitle(pageTitle: string, siteName: string, maxLen = 65): string {
  const t = (pageTitle || "").trim();
  const s = (siteName || "").trim();
  if (!t) return s;
  const full = s ? `${t} | ${s}` : t;
  return full.length <= maxLen ? full : t;
}

/**
 * Count list-item children across sections in a generated content_json.
 * Handles all known schema variants (items/tools/steps/checklist_items/templates/faqs).
 */
export function countContentItems(contentJson: any): number {
  const sections =
    (Array.isArray(contentJson?.sections) && contentJson.sections) ||
    (Array.isArray(contentJson?.categories) && contentJson.categories) ||
    [];
  let n = 0;
  for (const s of sections) {
    const kids =
      (Array.isArray(s?.items) && s.items) ||
      (Array.isArray(s?.tools) && s.tools) ||
      (Array.isArray(s?.templates) && s.templates) ||
      (Array.isArray(s?.checklist_items) && s.checklist_items) ||
      (Array.isArray(s?.steps) && s.steps) ||
      (Array.isArray(s?.faqs) && s.faqs) ||
      [];
    n += kids.length;
  }
  return n;
}

/**
 * Cheap deterministic hash for stable pattern selection across regenerations.
 */
function hash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TITLE_PATTERNS: Record<string, string[]> = {
  "tool-roundups": [
    "{n} Best {angle} in {year}",
    "{angle}: {n} Tools Worth Paying For in {year}",
    "The {n} Top {angle} for {audience} ({year})",
  ],
  "checklists": [
    "The {angle} Checklist: {n} Steps",
    "{angle}: A {n}-Point Checklist for {audience}",
    "{angle} Checklist for {year}",
  ],
  "strategy-guides": [
    "How to {angle}: A Practical Guide",
    "{angle} Strategy Guide for {audience}",
    "The {audience} Guide to {angle} in {year}",
  ],
  "ideas-use-cases": [
    "{n} {angle} Ideas That Actually Work",
    "{n} Ways to Use {angle}",
    "{angle}: {n} Real Use Cases for {audience}",
  ],
  "guides": [
    "How to {angle}: A Practical Guide",
    "{angle}: The {audience} Guide",
  ],
  "templates": [
    "{n} {angle} Templates for {audience}",
    "{angle}: {n} Ready-to-Use Templates",
  ],
  "faqs": [
    "{angle}: FAQ for {audience}",
    "Common Questions About {angle}",
  ],
};

const FALLBACK_PATTERNS_WITH_N = [
  "{n} Best {angle} in {year}",
  "{n} {angle} Ideas That Actually Work",
];
const FALLBACK_PATTERNS_NO_N = [
  "{angle}: A Practical Guide for {audience}",
  "How to {angle} in {year}",
];

/**
 * Deterministically pick a title pattern (same inputs → same output on regen)
 * and fill in slots. If actualCount < 10, avoids "{n}" patterns entirely.
 */
export function composePageTitle(params: {
  schemaSlug: string;
  angle: string;
  niche: string;
  audience: string;
  year: number;
  actualCount: number;
  overridePatterns?: string[];
}): string {
  const { schemaSlug, angle, niche, audience, year, actualCount, overridePatterns } = params;
  const hasCount = actualCount >= 10;
  const rawPatterns =
    overridePatterns && overridePatterns.length
      ? overridePatterns
      : TITLE_PATTERNS[schemaSlug] || (hasCount ? FALLBACK_PATTERNS_WITH_N : FALLBACK_PATTERNS_NO_N);
  const pool = hasCount ? rawPatterns : rawPatterns.filter((p) => !p.includes("{n}"));
  const patterns = pool.length ? pool : FALLBACK_PATTERNS_NO_N;
  const idx = hash(`${niche}|${schemaSlug}|${angle}`) % patterns.length;
  const tpl = patterns[idx];
  return tpl
    .replace(/\{n\}/g, String(actualCount))
    .replace(/\{angle\}/g, angle)
    .replace(/\{niche\}/g, niche)
    .replace(/\{audience\}/g, audience || "creators")
    .replace(/\{year\}/g, String(year))
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────── META DESCRIPTION ───────────────────────────

/**
 * Ask the model to write a unique 140-160 char meta description grounded in the
 * finished content. Must include the primary keyword and one concrete specific
 * (number, tool name, or outcome) from the page. Never starts with "Discover".
 */
export async function writeMetaDescription(params: {
  apiKey: string;
  model: string;
  voice: VoiceConfig;
  contentJson: any;
  primaryKeyword: string;
  angle: string;
  niche: string;
  fallback: string;
}): Promise<string> {
  const { apiKey, model, voice, contentJson, primaryKeyword, angle, niche, fallback } = params;

  // Compact content sample for the prompt: intro + first section headings + first few item names
  const sample: any = { intro: contentJson?.intro || "" };
  const sections =
    (Array.isArray(contentJson?.sections) && contentJson.sections) ||
    (Array.isArray(contentJson?.categories) && contentJson.categories) ||
    [];
  sample.sections = sections.slice(0, 3).map((s: any) => {
    const kids =
      (Array.isArray(s?.items) && s.items) ||
      (Array.isArray(s?.tools) && s.tools) ||
      (Array.isArray(s?.templates) && s.templates) ||
      (Array.isArray(s?.checklist_items) && s.checklist_items) ||
      (Array.isArray(s?.steps) && s.steps) ||
      [];
    return {
      title: s?.title || s?.heading || s?.name,
      items: kids.slice(0, 4).map((k: any) => k?.name || k?.title || k?.tool_name || k?.idea || k?.step || k?.task).filter(Boolean),
    };
  });

  const bannedList = voice.banned_phrases.length
    ? `\nBanned phrases (never use): ${JSON.stringify(voice.banned_phrases)}`
    : "";

  const prompt = `Write ONE meta description for a page about "${angle}" in the "${niche}" niche.

REQUIREMENTS (all hard constraints):
- 140-160 characters, single line, plain text
- Must contain the primary keyword: "${primaryKeyword}"
- Must include one concrete specific (a number, a tool name, or an outcome) drawn from the CONTENT SAMPLE below
- MUST NOT start with the word "Discover"
- MUST NOT use em dash (—) or en dash (–)
- No emojis, no quotes, no markdown${bannedList}

CONTENT SAMPLE (draw your specific from here):
${JSON.stringify(sample).slice(0, 2500)}

Return ONLY the meta description text. No JSON, no quotes, no preamble.`;

  try {
    const resp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "You write tight, honest meta descriptions. Return only the description text." },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 200,
      }),
    });
    if (!resp.ok) return fallback.slice(0, 160);
    const data = await resp.json();
    let text = (data.choices?.[0]?.message?.content || "").trim();
    text = text.replace(/^["'`\s]+|["'`\s]+$/g, "");
    text = text.replace(/[—–]/g, ", ");
    // Strip a leading "Discover " if the model ignored the rule.
    text = text.replace(/^discover\s+/i, "");
    // Enforce banned phrases: if any slipped in, fall back.
    const lower = text.toLowerCase();
    for (const p of voice.banned_phrases) {
      if (p && lower.includes(p.toLowerCase())) return fallback.slice(0, 160);
    }
    if (text.length < 80 || text.length > 200) {
      // Trim to 160 without cutting a word.
      if (text.length > 160) {
        const cut = text.slice(0, 160);
        const sp = cut.lastIndexOf(" ");
        text = (sp > 100 ? cut.slice(0, sp) : cut).trimEnd();
      }
      if (text.length < 80) return fallback.slice(0, 160);
    }
    return text;
  } catch {
    return fallback.slice(0, 160);
  }
}
