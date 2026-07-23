// Fact-checks a post: extracts verifiable claims (LLM) and verifies each via Perplexity.
// Annotates posts.fact_check + fact_checked_at, and recomputes quality_score
// with fact-check deductions applied on top of the structural score.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeCronOrAdmin } from "../_shared/cronAuth.ts";
import { MAIN_MODEL } from "../_shared/models.ts";
import { scorePost } from "../_shared/voice.ts";
import { computeQualityWithFacts } from "../_shared/publishGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type Claim = { claim: string; source_url: string | null };
type Verdict = "verified" | "unverified" | "contradicted";
type CheckedClaim = Claim & { verdict: Verdict; evidence_url: string | null };

function parseJsonLoose(raw: string): any | null {
  let s = (raw || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a !== -1 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await authorizeCronOrAdmin(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const { post_id } = await req.json().catch(() => ({}));
  if (!post_id) {
    return new Response(JSON.stringify({ error: "post_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const pplxKey = Deno.env.get("PERPLEXITY_API_KEY");

  const { data: post, error: postErr } = await supabase
    .from("posts")
    .select("id, title, content, excerpt, tldr, key_takeaways, faq_items, source_citations, lint_flags, fact_check")
    .eq("id", post_id)
    .maybeSingle();
  if (postErr || !post) {
    return new Response(JSON.stringify({ error: "post not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!pplxKey) {
    return new Response(JSON.stringify({ ok: true, skipped: "no perplexity key" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const citations = Array.isArray(post.source_citations) ? post.source_citations : [];
  const citationList = citations
    .map((c: any) => `- ${c.title || "(untitled)"} ${c.url || ""}`).join("\n");
  const plain = (post.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 12000);

  // Step 1: extract claims
  const extractSys = `Extract every verifiable factual claim from the post that contains a number, date, product name, company action, or statistic. For each, pick the URL from the provided citations that best supports it (or null).
Return JSON ONLY:
{"claims":[{"claim":"...","source_url":"https://... or null"}]}
Cap at 12 claims. No commentary.`;
  const extractUser = `POST TITLE: ${post.title}

POST CONTENT (plaintext):
${plain}

AVAILABLE CITATIONS:
${citationList || "(none)"}`;

  let claims: Claim[] = [];
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
      body: JSON.stringify({
        model: MAIN_MODEL,
        messages: [
          { role: "system", content: extractSys },
          { role: "user", content: extractUser },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });
    if (r.ok) {
      const d = await r.json();
      const parsed = parseJsonLoose(d?.choices?.[0]?.message?.content || "");
      if (parsed && Array.isArray(parsed.claims)) {
        claims = parsed.claims
          .filter((c: any) => c && typeof c.claim === "string" && c.claim.trim())
          .slice(0, 12)
          .map((c: any) => ({
            claim: c.claim.trim(),
            source_url: typeof c.source_url === "string" && c.source_url.startsWith("http") ? c.source_url : null,
          }));
      }
    } else {
      console.warn("claim extraction failed", r.status);
    }
  } catch (e: any) {
    console.warn("claim extraction threw", e?.message);
  }

  // Step 2: verify each claim via Perplexity
  const checked: CheckedClaim[] = [];
  for (const c of claims) {
    let verdict: Verdict = "unverified";
    let evidence_url: string | null = null;
    try {
      const q = `Is the following claim supported by recent reporting${c.source_url ? `, especially at ${c.source_url}` : ""}?
Claim: "${c.claim}"
Answer JSON ONLY: {"verdict":"verified"|"unverified"|"contradicted","evidence_url":"https://..."}`;
      const r = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pplxKey}` },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            { role: "system", content: "You are a strict fact-checker. Reply with JSON only." },
            { role: "user", content: q },
          ],
          temperature: 0.1,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        const parsed = parseJsonLoose(d?.choices?.[0]?.message?.content || "");
        if (parsed && (parsed.verdict === "verified" || parsed.verdict === "unverified" || parsed.verdict === "contradicted")) {
          verdict = parsed.verdict;
          if (typeof parsed.evidence_url === "string" && parsed.evidence_url.startsWith("http")) {
            evidence_url = parsed.evidence_url;
          } else if (Array.isArray(d?.citations) && typeof d.citations[0] === "string") {
            evidence_url = d.citations[0];
          }
        }
      }
    } catch (e: any) {
      console.warn("verify threw", e?.message);
    }
    checked.push({ ...c, verdict, evidence_url });
    await sleep(300);
  }

  const verified_count = checked.filter((c) => c.verdict === "verified").length;
  const unverified_count = checked.filter((c) => c.verdict === "unverified").length;
  const contradicted_count = checked.filter((c) => c.verdict === "contradicted").length;

  // Recompute quality score using structural score + fact deductions
  const { score: structural } = scorePost({
    title: post.title,
    content: post.content,
    faq_items: (post as any).faq_items,
    key_takeaways: (post as any).key_takeaways,
    tldr: (post as any).tldr,
    excerpt: (post as any).excerpt,
  });
  const citationsCount = Array.isArray(post.source_citations) ? post.source_citations.length : 0;
  const q = computeQualityWithFacts({
    structuralScore: structural,
    unverifiedCount: unverified_count,
    contradictedCount: contradicted_count,
    citationsCount,
  });

  const priorFc = (post as any).fact_check || {};
  const fact_check = {
    claims: checked,
    verified_count,
    unverified_count,
    contradicted_count,
    structural_score: structural,
    fact_deductions: q.deductions,
    score_breakdown: q.breakdown,
    remediated: priorFc.remediated === true ? true : undefined,
  };

  // Merge lint_flags: only mark fact_check as a lint flag when the new gate would fail
  let newLintFlags = Array.isArray(post.lint_flags)
    ? (post.lint_flags as any[]).filter((f) => !(f && f.type === "fact_check"))
    : [];
  const gateWouldFailFacts = contradicted_count > 0 || verified_count < 2 || unverified_count > 2;
  if (gateWouldFailFacts) {
    newLintFlags.push({
      type: "fact_check",
      detail: `${contradicted_count} contradicted, ${unverified_count} unverified, ${verified_count} verified`,
    });
  }

  const update: any = {
    fact_check,
    fact_checked_at: new Date().toISOString(),
    quality_score: q.score,
    lint_flags: newLintFlags,
  };

  const { error: upErr } = await supabase.from("posts").update(update).eq("id", post_id);
  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({
    ok: true, verified_count, unverified_count, contradicted_count,
    quality_score: q.score, structural_score: structural, fact_deductions: q.deductions,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
