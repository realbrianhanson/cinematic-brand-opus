// Fact remediation pass. Given a post with contradicted or excessive unverified
// claims, rewrite the content to remove contradicted claims and either strip or
// properly attribute unverified ones. Reuses critiqueAndRevise machinery.
// Idempotent: caller must respect fact_check.remediated flag before invoking.
import { critiqueAndRevise, lintJson, scorePost } from "./voice.ts";
import { linkifyEventMentions } from "./eventLink.ts";
import type { VoiceConfig } from "./voice.ts";

export interface RemediationInput {
  supabase: any;
  apiKey: string;
  model: string;
  postId: string;
  voice: VoiceConfig;
  voiceBlock: string;
}

export interface RemediationResult {
  ok: boolean;
  reason?: string;
  changed?: boolean;
}

export async function remediatePostFacts(input: RemediationInput): Promise<RemediationResult> {
  const { supabase, apiKey, model, postId, voice, voiceBlock } = input;

  const { data: post, error } = await supabase
    .from("posts")
    .select("id, title, content, excerpt, tldr, key_takeaways, faq_items, meta_title, meta_description, featured_image_alt, fact_check, source_citations, lint_flags")
    .eq("id", postId)
    .maybeSingle();
  if (error || !post) return { ok: false, reason: "post not found" };

  const fc = post.fact_check as any;
  if (!fc || !Array.isArray(fc.claims)) return { ok: false, reason: "no fact_check to remediate" };
  if (fc.remediated === true) return { ok: false, reason: "already remediated" };

  const contradicted = fc.claims.filter((c: any) => c.verdict === "contradicted");
  const unverified = fc.claims.filter((c: any) => c.verdict === "unverified");

  if (contradicted.length === 0 && unverified.length < 3) {
    return { ok: true, changed: false, reason: "no remediation needed" };
  }

  const citations = Array.isArray(post.source_citations) ? post.source_citations : [];
  const citationNames = new Map<string, string>();
  for (const c of citations) {
    if (c?.url) {
      try {
        citationNames.set(c.url, c.title || new URL(c.url).hostname.replace(/^www\./, ""));
      } catch { /* ignore */ }
    }
  }

  const factInstructions = [
    contradicted.length > 0
      ? `CONTRADICTED CLAIMS — DELETE these entirely (sentence + supporting context):\n${contradicted
          .map((c: any, i: number) => `${i + 1}. "${c.claim}"`).join("\n")}`
      : "",
    unverified.length > 0
      ? `UNVERIFIED CLAIMS — either DELETE, or convert to properly attributed statements. When attributing, use the exact form: "according to <SOURCE NAME>" with a markdown link to the source_url when present. Never leave a bare claim.\n${unverified
          .map((c: any, i: number) => {
            const src = c.source_url ? citationNames.get(c.source_url) || new URL(c.source_url).hostname.replace(/^www\./, "") : null;
            return `${i + 1}. "${c.claim}"${src ? ` — attribute to: ${src} (${c.source_url})` : " — no source available, DELETE this claim"}`;
          }).join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n");

  const draftJson = {
    title: post.title,
    content: post.content,
    excerpt: post.excerpt,
    tldr: post.tldr,
    key_takeaways: post.key_takeaways,
    faq_items: post.faq_items,
    meta_title: post.meta_title,
    meta_description: post.meta_description,
    featured_image_alt: post.featured_image_alt,
  };

  const researchContext = `FACT REMEDIATION PASS — the fact-checker flagged issues.

${factInstructions}

Rules:
- Never invent replacement facts. Deletion is always preferable to fabrication.
- Preserve overall structure, JSON schema, and word count within ~15%.
- Attributed claims must use markdown links, e.g. "according to [Bloomberg](https://...)".
- Do not touch any claim marked verified.`;

  const revised = await critiqueAndRevise({
    apiKey, model, voiceBlock, researchContext,
    draftJson, schemaHint: "blog post fields (title, content HTML, excerpt, tldr, key_takeaways, faq_items, meta_title, meta_description, featured_image_alt)",
    maxTokens: 16000,
  });

  if (revised.error) return { ok: false, reason: `revise failed: ${revised.error}` };
  const merged: any = { ...draftJson, ...revised.revised };

  // Re-run event linkification on the revised content
  try {
    const { data: cta } = await supabase.from("site_settings").select("cta_url").limit(1).maybeSingle();
    if (merged.content) merged.content = linkifyEventMentions(merged.content, cta?.cta_url);
    if (merged.excerpt) merged.excerpt = linkifyEventMentions(merged.excerpt, cta?.cta_url, { maxLinks: 1 });
  } catch { /* non-fatal */ }

  const lintFlags = lintJson(merged, voice.banned_phrases);
  const { score: structuralScore } = scorePost({
    title: merged.title, content: merged.content, faq_items: merged.faq_items,
    key_takeaways: merged.key_takeaways, tldr: merged.tldr, excerpt: merged.excerpt,
  });

  // Persist rewritten content. Mark fact_check.remediated=true so remediation
  // never runs twice. Fact-check re-run happens next in the caller.
  const nextFc = { ...(fc || {}), remediated: true };
  const { error: upErr } = await supabase.from("posts").update({
    title: merged.title,
    content: merged.content,
    excerpt: merged.excerpt,
    tldr: merged.tldr,
    key_takeaways: merged.key_takeaways,
    faq_items: merged.faq_items,
    featured_image_alt: merged.featured_image_alt,
    lint_flags: lintFlags,
    quality_score: structuralScore, // fact-check will refine this
    fact_check: nextFc,
  }).eq("id", postId);
  if (upErr) return { ok: false, reason: upErr.message };

  // meta fields live in seo_metadata
  if (merged.meta_title || merged.meta_description) {
    try {
      const { data: existing } = await supabase.from("seo_metadata").select("id").eq("post_id", postId).maybeSingle();
      const payload: any = {
        meta_title: merged.meta_title || null,
        meta_description: merged.meta_description || null,
      };
      if (existing?.id) await supabase.from("seo_metadata").update(payload).eq("id", existing.id);
      else await supabase.from("seo_metadata").insert({ post_id: postId, ...payload });
    } catch { /* non-fatal */ }
  }

  return { ok: true, changed: true };
}
