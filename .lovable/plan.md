

## Scalable Content Engine — Angle-Based Unique Generation

### Problem

The current system uses a fixed title template (`"{{count}} Best {{content_type}} for {{niche_name}} in {{year}}"`), which produces the exact same title and slug every time you generate for the same niche + content type. This makes it impossible to scale to thousands of pages — you'd just keep creating duplicates.

### Solution: AI-Generated Unique Angles

Replace the deterministic title system with an intelligent angle generator that creates unique subtopics before generating content. Each generation run produces pages that are different from everything already in the database.

### How It Works

```text
┌──────────────────────────────────┐
│  1. USER: "AI for Business" +    │
│     "Tool Roundups" × 5 pages    │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  2. FETCH existing titles for    │
│     this niche+schema from DB    │
│     e.g. "AI Writing Tools..."   │
│         "AI Analytics Tools..."  │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  3. LIGHTWEIGHT AI CALL:         │
│     "Generate 5 unique subtopic  │
│     angles. Do NOT repeat these  │
│     existing titles: [...]"      │
│                                  │
│     Returns:                     │
│     - "AI Sales Automation Tools"│
│     - "AI HR & Recruiting Tools" │
│     - "AI Financial Planning..." │
│     - "AI Supply Chain Tools"    │
│     - "AI Legal & Compliance..." │
└──────────────┬───────────────────┘
               ▼
┌──────────────────────────────────┐
│  4. FOR EACH ANGLE:              │
│     - Research (Perplexity)      │
│     - Scrape (Firecrawl)         │
│     - Generate full content      │
│     - Unique slug from angle     │
└──────────────────────────────────┘
```

Every run produces entirely new topics. Run it 10 times, get 50 unique pages covering different facets of the niche.

### Changes

**1. Edge function: `supabase/functions/generate-content/index.ts`**

- Add `generateUniqueAngles()` function — a fast AI call that returns N unique subtopic angles as a JSON array, explicitly excluding existing titles from the DB
- Replace the `for (let i = 0; i < count; i++)` loop with iteration over these angles
- Title and slug derive from the angle (e.g., "15 Best AI Sales Automation Tools for Business in 2026") instead of the static template
- Keyword assignment uses the angle-specific keyword instead of the generic "tools for AI for Business"
- Research query is tailored to each angle for more targeted results

**2. UI: `src/components/admin/GenerationControls.tsx`**

- Remove the `forceRegenerate` toggle (no longer needed — every run is inherently unique)
- Add a small info note explaining that each run auto-generates unique subtopics

**3. Edge function: `supabase/functions/refresh-stale-content/index.ts`**

- No structural changes needed — refresh operates on existing pages by ID, not templates

### Why This Scales to Thousands

- Each generation run queries the DB for what already exists and tells the AI "don't repeat these"
- The angle generator can produce unlimited subtopic variations within any niche
- Keywords, slugs, and titles are all unique by construction
- Research is tailored per-angle, so each page gets relevant, specific data
- No manual intervention needed — just keep hitting "Generate" for more pages

