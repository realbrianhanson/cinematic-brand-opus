

## Problem

The A.I. Helper sidebar shows two buttons that are confusing:
1. **"Generate SEO & AEO/GEO"** — fills in meta title, description, keywords, FAQ, TLDR, takeaways
2. **"Increase Score"** — re-runs generation trying to improve incomplete fields

Users don't understand the difference or which to click. The two-step flow (generate then enhance) should be unified.

## Plan

### Merge into a single smart button

**File: `src/components/admin/PostEditorAiHelper.tsx`**

Replace the two buttons with one that adapts its label based on state:
- **Before any generation**: "Generate SEO & AEO/GEO" (primary action)
- **After generation, score < 100**: "Improve Score → {score}%" (same button, re-runs with enhancement logic)
- **Score = 100**: Button disabled, shows "Score Maximized ✓"

This removes all ambiguity — there's always exactly one button to click, and it does the right thing automatically.

### Changes

1. **`PostEditorAiHelper.tsx`**: Remove the second `onEnhance` button. Update the primary button label/onClick to call `onEnhance` when `hasGenerated && overall < 100`, otherwise call `onGenerate`. Remove `onEnhance` from props (merge into `onGenerate` logic at the parent level, or keep both callbacks but switch internally).

2. **`PostEditor.tsx`** (parent): No changes needed if the helper component handles the button logic switch internally using the existing `hasGenerated` and score props.

### Result
One clear button that always tells the user exactly what it will do. No decision paralysis.

