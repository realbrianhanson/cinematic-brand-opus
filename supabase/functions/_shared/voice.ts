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
 * Load voice_profile + banned_phrases from site_settings.
 * Returns empty strings/arrays if not configured — callers should still
 * inject the block; the model will just receive an empty voice section.
 */
export async function loadVoiceConfig(supabase: any): Promise<VoiceConfig> {
  const { data } = await supabase
    .from("site_settings")
    .select("voice_profile, banned_phrases")
    .limit(1)
    .maybeSingle();
  return {
    voice_profile: (data?.voice_profile || "").trim(),
    banned_phrases: Array.isArray(data?.banned_phrases) ? data.banned_phrases : [],
  };
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
