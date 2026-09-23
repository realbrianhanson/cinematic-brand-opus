// Drafts a full blog post from a content_opportunity, reusing the voice/lint/scoring
// pipeline. Injects the freshest matching expert_note. Runs originality + freshness gates.
// Result is saved as a DRAFT post linked to the opportunity (opportunity.status='queued').
//
// Cost controls: freshness and a title/keyword originality check run on DB
// data only, before any AI call. A gateway 402 returns the claim to the queue
// (attempt refunded) and responds HTTP 402 with stopped_reason
// 'ai_credits_exhausted'; 408/429/5xx leave the opportunity retryable.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { embedText, cosineSim, toPgVector } from "../_shared/embeddings.ts";
import { MAIN_MODEL } from "../_shared/models.ts";
import {
  loadVoiceConfig,
  formatVoiceBlock,
  critiqueAndRevise,
  mechanicalFixViolations,
  lintJson,
  scorePost,
} from "../_shared/voice.ts";
import { linkifyEventMentions } from "../_shared/eventLink.ts";
import {
  editorialInstructions,
  EDITORIAL_FIELDS,
  chooseTitlePair,
  editorialWarnings,
  recentArticles,
} from "../_shared/editorial.ts";
import { collectEvidence } from "../_shared/editorialEvidence.ts";
import { generateFeaturedImage } from "../_shared/featuredImage.ts";
import {
  classifyAiFailure,
  coveredByExistingTitle,
  creditsExhaustedBody,
  freshnessHours,
  staleSourcesReason,
} from "./preflight.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ORIGINALITY_MAX_SIM = 0.82;
const PRE_DRAFT_ORIGINALITY_MAX_SIM = 0.8;
/** Titles compared by the cheap pre-draft keyword check. */
const TITLE_CHECK_LIMIT = 1000;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const { opportunity_id, claim_token } = await req.json().catch(() => ({}));
  if (!opportunity_id) {
    return new Response(JSON.stringify({ error: "opportunity_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

  const { data: opp, error: oppErr } = await supabase
    .from("content_opportunities")
    .select("*")
    .eq("id", opportunity_id)
    .single();
  if (oppErr || !opp) {
    return new Response(JSON.stringify({ error: "opportunity not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (opp.status === "queued" || opp.status === "published") {
    return new Response(JSON.stringify({ error: "already drafted" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Atomic claim: only one concurrent run may hold an opportunity. A claim that
  // is already held (and not stale) returns no row, so we stop instead of
  // generating a duplicate draft.
  const { data: claimed, error: claimErr } = await supabase.rpc(
    "content_start_draft",
    { _id: opportunity_id, _token: claim_token ?? null },
  );
  if (claimErr) {
    return new Response(
      JSON.stringify({ error: `claim failed: ${claimErr.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  if (!claimed || claimed.length === 0) {
    return new Response(JSON.stringify({ error: "already being drafted" }), {
      status: 409,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const claimToken = claimed[0].claim_token as string;
  const currentAttempts = claimed[0].attempts as number;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  const rejectOpp = async (reason: string) => {
    const { error } = await supabase
      .from("content_opportunities")
      .update({ status: "rejected", reject_reason: reason.slice(0, 500) })
      .eq("id", opportunity_id)
      .eq("claim_token", claimToken);
    if (error) console.error("rejecting opportunity failed", error.message);
  };

  // PRE-DRAFT freshness gate (DB only): stale news is rejected before any AI
  // spend instead of after the full draft + critique cycle.
  const { data: srcMeta, error: srcMetaErr } = await supabase
    .from("source_items")
    .select("published_at")
    .in("id", opp.source_item_ids || []);
  if (srcMetaErr) {
    console.warn("source dates unavailable", srcMetaErr.message);
  }
  const freshness_hours = freshnessHours(
    (srcMeta || []).map((r: { published_at: string | null }) => r.published_at),
  );
  const staleReason = srcMetaErr
    ? null
    : staleSourcesReason(freshness_hours, opp.brief?.evergreen === true);
  if (staleReason) {
    await rejectOpp(staleReason);
    return json({ error: "rejected: freshness", freshness_hours });
  }

  // PRE-DRAFT keyword originality (DB only): an existing article whose title
  // already targets this keyword makes the draft a duplicate.
  const { data: titleRows, error: titleErr } = await supabase
    .from("posts")
    .select("title")
    .in("status", ["draft", "scheduled", "published"])
    .order("created_at", { ascending: false })
    .limit(TITLE_CHECK_LIMIT);
  if (titleErr) console.warn("title check skipped", titleErr.message);
  const coveredBy = coveredByExistingTitle(
    opp.target_keyword,
    (titleRows || []).map((r: { title: string | null }) => r.title),
  );
  if (coveredBy) {
    await rejectOpp(
      `pre-draft originality: keyword already covered by "${coveredBy.title}"`,
    );
    return json({
      error: "rejected: pre-draft originality",
      covered_by: coveredBy.title,
    });
  }

  // PRE-DRAFT originality gate: embed the opportunity brief and compare to existing
  // posts before spending on a full draft+critique cycle.
  try {
    const preText = [
      opp.angle,
      opp.target_keyword,
      opp.rationale,
      opp.gap_reason,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);
    const preVec = await embedText(preText, lovableKey);
    if (preVec) {
      const { data: preMatches } = await supabase.rpc("match_posts", {
        query_embedding: toPgVector(preVec),
      });
      let preMax = 0;
      for (const m of preMatches || []) {
        if (typeof m.similarity === "number" && m.similarity > preMax)
          preMax = m.similarity;
      }
      if (preMax > PRE_DRAFT_ORIGINALITY_MAX_SIM) {
        await supabase
          .from("content_opportunities")
          .update({
            status: "rejected",
            reject_reason: `pre-draft originality (max sim ${preMax.toFixed(2)} vs existing posts)`,
          })
          .eq("id", opportunity_id)
          .eq("claim_token", claimToken);
        return new Response(
          JSON.stringify({
            error: "rejected: pre-draft originality",
            maxSim: preMax,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }
  } catch (e: any) {
    console.warn("pre-draft originality check threw", e?.message);
  }

  const failOpp = async (reason: string, terminal: boolean) => {
    await supabase
      .from("content_opportunities")
      .update({
        status: terminal ? "rejected" : "proposed",
        last_error: reason.slice(0, 500),
        reject_reason: terminal ? reason.slice(0, 500) : null,
      })
      .eq("id", opportunity_id)
      .eq("claim_token", claimToken);
  };
  const MAX_ATTEMPTS = 3;

  const sources = (opp.brief?.sources || []) as Array<{
    url: string;
    title?: string;
  }>;

  // Freshest matching expert note (last 14 days, lane match preferred)
  const { data: notes } = await supabase
    .from("expert_notes")
    .select("id, note, topic_hint")
    .eq("archived", false)
    .is("used_in_post_id", null)
    .gte(
      "created_at",
      new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
    )
    .order("created_at", { ascending: false })
    .limit(20);
  const matchedNote = (notes || []).find(
    (n) =>
      !!n.topic_hint &&
      (n.topic_hint === opp.topic_lane ||
        opp.angle.toLowerCase().includes((n.topic_hint || "").toLowerCase())),
  );

  const voice = await loadVoiceConfig(supabase);
  const voiceBlock = formatVoiceBlock(voice);

  const { data: editorialIdentity, error: identityError } = await supabase
    .from("site_settings")
    .select("author_name,author_bio,site_name")
    .limit(1)
    .maybeSingle();
  if (identityError || !editorialIdentity?.author_name)
    return new Response(
      JSON.stringify({
        error: "Configure the site author before generating content",
      }),
      { status: 503, headers: corsHeaders },
    );
  const authorName = editorialIdentity.author_name;
  const authorContext =
    editorialIdentity.author_bio || editorialIdentity.site_name || "";

  let recent;
  try {
    recent = await recentArticles(supabase);
  } catch (error) {
    await failOpp(String(error), currentAttempts >= MAX_ATTEMPTS);
    return new Response(
      JSON.stringify({ error: "Article history unavailable" }),
      { status: 503, headers: corsHeaders },
    );
  }
  const evidence = await collectEvidence(sources);
  if (!evidence.sources.length) {
    await failOpp(
      "No readable source evidence; needs editorial research",
      currentAttempts >= MAX_ATTEMPTS,
    );
    return new Response(
      JSON.stringify({ error: "No readable source evidence" }),
      { status: 422, headers: corsHeaders },
    );
  }
  const systemPrompt = `You are ${authorName}'s editorial writer.
${voiceBlock}
Author background and audience: ${authorContext}.
${editorialInstructions(recent, opp.brief?.format)}
Return JSON ONLY:
{
  "title":"accurate engaging headline", "content":"complete HTML article",
  "excerpt":"specific 1-2 sentence description", "tldr":"direct answer to the reader question",
  "key_takeaways":["only useful takeaways"], "faq_items":[],
  "meta_title":"distinct descriptive search title", "meta_description":"specific honest reason to read",
  "keywords":"topic labels, not keyword stuffing",
  ${EDITORIAL_FIELDS}
}`;
  const briefBlock = `Angle: ${opp.angle}
Reader question: ${opp.brief?.reader_question || opp.target_keyword}
Search intent: ${opp.brief?.search_intent || "Choose the reader task before drafting"}
Why the audience cares: ${opp.rationale}
Original contribution: ${opp.gap_reason}
${evidence.context}
Unavailable sources (do not rely on them): ${evidence.missing.join(", ")}
${matchedNote ? `Relevant supplied author note (do not expand into invented experience): ${matchedNote.note}` : "No personal note: omit personal experience claims."}`;

  const aiRes = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: MAIN_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: briefBlock },
        ],
        temperature: 0.75,
        max_tokens: 24000,
      }),
    },
  );
  if (!aiRes.ok) {
    const t = await aiRes.text();
    const kind = classifyAiFailure(aiRes.status);
    if (kind === "credits") {
      // Stop signal: hand the opportunity back untouched by this attempt.
      const body = creditsExhaustedBody(t);
      const { error: releaseErr } = await supabase
        .from("content_opportunities")
        .update({
          status: "proposed",
          claim_token: null,
          claim_started: false,
          attempts: Math.max(0, currentAttempts - 1),
          reject_reason: null,
          last_error: body.error,
        })
        .eq("id", opportunity_id)
        .eq("claim_token", claimToken);
      if (releaseErr)
        console.error("releasing claim after 402 failed", releaseErr.message);
      return json(body, 402);
    }
    if (kind === "retryable") {
      await failOpp(
        `draft LLM failed: ${aiRes.status}`,
        currentAttempts >= MAX_ATTEMPTS,
      );
      return json({ error: "draft failed", details: t }, 503);
    }
    await rejectOpp(`draft LLM failed: ${aiRes.status}`);
    return json({ error: "draft failed", details: t }, 500);
  }
  const aiData = await aiRes.json();
  let raw = aiData?.choices?.[0]?.message?.content || "";
  raw = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const s = raw.indexOf("{"),
    e = raw.lastIndexOf("}");
  if (s !== -1 && e > s) raw = raw.slice(s, e + 1);
  let draft: any;
  try {
    draft = JSON.parse(raw);
  } catch {
    await supabase
      .from("content_opportunities")
      .update({
        status: "rejected",
        reject_reason: "unparseable draft JSON",
      })
      .eq("id", opportunity_id)
      .eq("claim_token", claimToken);
    return new Response(JSON.stringify({ error: "unparseable JSON" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // Voice critique + lint fix
  try {
    const revised = await critiqueAndRevise({
      apiKey: lovableKey,
      model: MAIN_MODEL,
      voiceBlock,
      researchContext: briefBlock,
      draftJson: draft,
      schemaHint:
        "blog post fields (title, content HTML, excerpt, tldr, key_takeaways, faq_items, meta_title, meta_description, keywords, featured_image_alt)",
      maxTokens: 16000,
    });
    if (!revised.error) draft = { ...draft, ...revised.revised };
    const violations = lintJson(draft, voice.banned_phrases);
    if (violations.length) {
      const fixed = await mechanicalFixViolations({
        apiKey: lovableKey,
        model: MAIN_MODEL,
        draftJson: draft,
        violations,
        bannedPhrases: voice.banned_phrases,
        schemaHint: "same blog post schema",
      });
      if (!fixed.error) draft = { ...draft, ...fixed.revised };
    }
  } catch (err: any) {
    console.warn("critique/lint threw", err?.message);
  }

  // Auto-link mentions of the free 3-day virtual training to the tracked CTA URL.
  const { data: ctaSettings } = await supabase
    .from("site_settings")
    .select("cta_url")
    .limit(1)
    .maybeSingle();
  if (draft.content)
    draft.content = linkifyEventMentions(draft.content, ctaSettings?.cta_url);
  if (draft.excerpt)
    draft.excerpt = linkifyEventMentions(draft.excerpt, ctaSettings?.cta_url, {
      maxLinks: 1,
    });

  Object.assign(draft, chooseTitlePair(draft, recent));
  const reviewWarnings = editorialWarnings(draft, recent);
  const lintFlags = [
    ...lintJson(draft, voice.banned_phrases),
    ...reviewWarnings.map((message) => ({ type: "editorial_review", message })),
  ];
  const { score: quality_score } = scorePost({
    title: draft.title,
    content: draft.content,
    faq_items: draft.faq_items,
    key_takeaways: draft.key_takeaways,
    tldr: draft.tldr,
    excerpt: draft.excerpt,
  });

  // Originality: embed the draft, compare against source excerpts and recent posts
  const draftText = `${draft.title}\n${(draft.content || "").replace(/<[^>]+>/g, " ").slice(0, 6000)}`;
  const draftVec = await embedText(draftText, lovableKey);
  let maxSim = 0;
  let simSource: "cluster_source" | "corpus_source" | "own_post" =
    "cluster_source";
  if (draftVec) {
    const { data: srcRows } = await supabase
      .from("source_items")
      .select("embedding")
      .in("id", opp.source_item_ids || []);
    for (const r of srcRows || []) {
      const v =
        typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
      if (Array.isArray(v)) {
        const sim = cosineSim(draftVec, v);
        if (sim > maxSim) {
          maxSim = sim;
          simSource = "cluster_source";
        }
      }
    }
    try {
      const { data: corpusMatches, error: corpusErr } = await supabase.rpc(
        "match_source_items",
        {
          query_embedding: toPgVector(draftVec),
        },
      );
      if (corpusErr)
        console.warn("match_source_items rpc failed", corpusErr.message);
      for (const m of corpusMatches || []) {
        if (typeof m.similarity === "number" && m.similarity > maxSim) {
          maxSim = m.similarity;
          simSource = "corpus_source";
        }
      }
    } catch (e: any) {
      console.warn("match_source_items threw", e?.message);
    }
    try {
      const { data: postMatches, error: postMatchErr } = await supabase.rpc(
        "match_posts",
        {
          query_embedding: toPgVector(draftVec),
        },
      );
      if (postMatchErr)
        console.warn("match_posts rpc failed", postMatchErr.message);
      for (const m of postMatches || []) {
        if (typeof m.similarity === "number" && m.similarity > maxSim) {
          maxSim = m.similarity;
          simSource = "own_post";
        }
      }
    } catch (e: any) {
      console.warn("match_posts threw", e?.message);
    }
  }
  const originality_score = Math.round((1 - maxSim) * 100);

  // Hard gates (freshness already ran before the draft)
  if (maxSim > ORIGINALITY_MAX_SIM) {
    await supabase
      .from("content_opportunities")
      .update({
        status: "rejected",
        reject_reason: `originality too low (max similarity ${maxSim.toFixed(2)} vs ${simSource})`,
      })
      .eq("id", opportunity_id)
      .eq("claim_token", claimToken);
    return new Response(
      JSON.stringify({ error: "rejected: originality", maxSim }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  if (quality_score < 75) {
    await supabase
      .from("content_opportunities")
      .update({
        status: "rejected",
        reject_reason: `quality below 75 (${quality_score})`,
      })
      .eq("id", opportunity_id)
      .eq("claim_token", claimToken);
    return new Response(
      JSON.stringify({ error: "rejected: quality", quality_score }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Insert as draft post
  const baseSlug = slugify(draft.title || opp.target_keyword || "site-post");
  let slug = baseSlug;
  const { data: slugTaken } = await supabase
    .from("posts")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (slugTaken) slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`;

  // Featured image (tolerate null)
  const featuredImageUrl = await generateFeaturedImage(
    draft.title || opp.target_keyword || "Analysis post",
    draft.excerpt || draft.meta_description || opp.angle || "",
    lovableKey,
    supabase,
    draft.visual_concept,
  );

  const strippedForReading = String(draft.content || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const readingTime = Math.max(
    1,
    Math.ceil(
      (strippedForReading ? strippedForReading.split(/\s+/).length : 0) / 200,
    ),
  );

  const { data: post, error: postErr } = await supabase
    .from("posts")
    .insert({
      title: draft.title,
      slug,
      content: draft.content,
      excerpt: draft.excerpt,
      tldr: draft.tldr,
      key_takeaways: draft.key_takeaways,
      faq_items: draft.faq_items,
      featured_image_alt: featuredImageUrl?.alt || null,
      featured_image: featuredImageUrl?.url || null,
      editorial_metadata: {
        version: 2,
        brief: draft.editorial_brief,
        title_candidates: draft.title_candidates,
        visual: featuredImageUrl?.visual || null,
        review_warnings: reviewWarnings,
        evidence_urls: evidence.sources.map((s) => s.url),
      },
      status: "draft",
      quality_score,
      lint_flags: lintFlags,
      opportunity_id,
      draft_claim_token: claimToken,
      source_citations: evidence.sources,
      originality_score,
      freshness_hours,
      reading_time: readingTime,
      embedding: draftVec ? toPgVector(draftVec) : null,
    })
    .select()
    .single();

  if (postErr) {
    await supabase
      .from("content_opportunities")
      .update({
        status: "rejected",
        reject_reason: `post insert failed: ${postErr.message}`,
      })
      .eq("id", opportunity_id)
      .eq("claim_token", claimToken);
    return new Response(JSON.stringify({ error: postErr.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // Persist SEO metadata to its own table (tolerate failure gracefully)
  try {
    const keywordArray = draft.keywords
      ? String(draft.keywords)
          .split(",")
          .map((k: string) => k.trim())
          .filter(Boolean)
      : null;
    await supabase.from("seo_metadata").insert({
      post_id: post.id,
      meta_title: draft.meta_title || null,
      meta_description: draft.meta_description || null,
      keywords: keywordArray,
    });
  } catch (seoErr: any) {
    console.warn("seo_metadata insert failed", seoErr?.message);
  }

  await supabase
    .from("content_opportunities")
    .update({ status: "queued" })
    .eq("id", opportunity_id)
    .eq("claim_token", claimToken);
  if (matchedNote) {
    await supabase
      .from("expert_notes")
      .update({ used_in_post_id: post.id })
      .eq("id", matchedNote.id);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      post_id: post.id,
      slug,
      quality_score,
      originality_score,
      freshness_hours,
      used_note: !!matchedNote,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
