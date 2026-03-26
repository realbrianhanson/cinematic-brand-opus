

## Problem: AI Ignoring Research Data and Using Stale Training Knowledge

The research pipeline (Perplexity + Firecrawl) is set up and the API keys work. The issue is that the AI content model (`gemini-3-flash-preview`) is **mixing its outdated training data** with the research results. The prompt says "prefer research data" but isn't strict enough — the model still fills gaps with tools like Jasper and Air.ai from its training set.

Two fixes needed:

### 1. Strengthen Research Quality

**File: `supabase/functions/generate-content/index.ts`** — `researchTopic` function

- Upgrade Perplexity model from `sonar` to `sonar-pro` for deeper, more accurate research with 2x more citations
- Make the research query more specific: ask for tools that are **actively popular and well-reviewed right now**, not just "best tools"
- Add a follow-up instruction to Perplexity: "Exclude tools that have shut down, pivoted, or lost significant market share"
- Add `search_recency_filter: "week"` to get the freshest data possible

### 2. Lock the Content AI to Research Data Only

**File: `supabase/functions/generate-content/index.ts`** — `buildUserMessage` function

- Change the constraint from "prefer research data" to **"ONLY use tools, platforms, and companies explicitly mentioned in the research data above. Do NOT supplement with your own knowledge of tools."**
- Add a new constraint: "If the research data doesn't provide enough items to fill a section, reduce the section size rather than inventing tools from your training data."
- Add an explicit blocklist instruction: "Known defunct/outdated tools to NEVER mention: Air.ai, Jasper, Copy.ai (if not in research), or any tool you're unsure still operates in its current form."
- Move the research context **above** the schema in the prompt so the AI reads it first and treats it as the primary source

### 3. Research Fallback Handling

If both Perplexity and Firecrawl return empty (no research data), the current code just returns an empty string and the AI generates entirely from training data. Fix this by:
- Logging a warning when no research data is available
- Adding a constraint to the prompt: "No real-time research was available. Be extremely conservative — only mention tools you are 100% certain exist and are actively maintained in {year}. Prefer fewer, verified items over a full list of potentially outdated ones."

### Summary of Changes
- One file: `supabase/functions/generate-content/index.ts`
- Three functions modified: `researchTopic`, `buildUserMessage`, and the same changes mirrored in `refresh-stale-content/index.ts`

