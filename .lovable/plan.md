

## Add A.I. SEO Generator & Score Indicator to pSEO Edit Page

### What You'll Get
- A new "A.I. SEO Helper" card in the right sidebar of the generated page editor
- A circular score ring showing your SEO completeness percentage (0-100)
- A checklist showing which SEO criteria are met/missing
- "Generate SEO" button that auto-fills meta title, description, and keywords using A.I.
- "Enhance SEO" button that fixes only the missing criteria to boost the score

### How It Works

The score is computed client-side based on these criteria:
- **Meta title** exists and is under 60 chars (+20 pts)
- **Meta description** exists and is under 160 chars (+20 pts)
- **Keywords** have at least 3 terms (+15 pts)
- **Content has 300+ words** (+15 pts)
- **Title contains a year** (freshness signal) (+10 pts)
- **Content has FAQ items** (+10 pts)
- **Content has intro section** (+10 pts)

### Files Changed

**`src/components/admin/GeneratedPageEditor.tsx`**
1. Add state for `aiGenerating`, `enhancing`, `hasGenerated`
2. Add a `computeSeoScore()` function that evaluates the 7 criteria above against current content/meta fields and returns `{ score, criteria[] }`
3. Add `handleGenerateSeo()` — calls the existing `generate-seo-aeo` edge function with the page title + stringified content JSON + current excerpt, then populates metaTitle/metaDesc/metaKeywords from the response
4. Add `handleEnhanceSeo()` — same edge function with `enhance: true` and `missing_criteria` listing only unfulfilled items
5. Insert a new **A.I. SEO Helper card** in the right sidebar (between Quality Score and Info cards) containing:
   - SVG score ring (reusing the exact pattern from `PostEditorAiHelper`)
   - Criteria checklist with progress bar
   - Generate and Enhance buttons
6. The SEO meta section auto-opens when A.I. fills the fields

No new files, no database changes, no new edge functions — reuses the existing `generate-seo-aeo` edge function already built for the blog post editor.

