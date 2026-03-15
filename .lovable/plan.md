

## Make Content Type Selection Clearer

The system already supports generating multiple content types — selecting "All Active Types" generates one page per active content type per niche. But the dropdown doesn't communicate this well.

### Changes to `src/components/admin/GenerationControls.tsx`

1. **Replace the single-select dropdown with a checkbox multi-select** (matching the niche selection pattern), so users can pick specific content types individually or use a "Select All" toggle.

2. **Update the explainer text** under the content type selector to say something like: "Pick the page types you want. Each selected type will be generated for each selected industry. For example, 2 industries × 3 content types × 1 page = 6 pages total."

3. **Update the estimated pages calculation** to reflect the number of selected content types instead of the opaque `all_active` logic.

4. **Update the edge function call** to send an array of content type slugs (or `all_active`) matching the new multi-select state.

5. **Update the edge function (`generate-content/index.ts`)** to accept `content_type_slugs` (array) instead of `content_type_slug` (string) for consistency. Backward-compatible: if a string is sent, treat it as a single-item array.

### No database changes needed.

