

## Scale Generation Controls for 20+ and 500+ Page Runs

### What works already
- The recursive self-invocation pattern processes one page per edge function call, so there's no timeout limit regardless of batch size
- Once you click "Generate," the entire job runs server-side — you can close your browser, turn off your computer, go to sleep. The edge functions keep chaining themselves
- Progress is stored in the `generation_jobs` table. When you come back to the admin panel, it picks up where it left off via Realtime

### What needs to change

**1. `src/components/admin/GenerationControls.tsx`**
- Raise the max "Pages Per Industry" from 5 to 50
- Add a warning when the total estimated pages exceeds 20 (e.g., "Large batch — this will run in the background and may take a while")
- Add a note: "You can close this page. Generation continues on the server."

**2. No backend changes needed**
- The `generate-content` edge function already handles any queue size
- The setup phase generates all angles, builds the full work queue, then processes them one at a time via self-invocation
- The stale-job recovery (10-minute timeout) is already in the UI

### How to test 20 pages
After this change: select 1 niche, 1 content type, set pages to 20, hit Generate. The system will:
1. Generate 20 unique angles via a lightweight AI call
2. For each angle: research via Perplexity → scrape via Firecrawl → generate content → save as draft
3. Progress bar updates in real-time
4. You can navigate away — come back later to see results

### How 500 pages would work
Select 10 niches × 1 content type × 50 pages = 500 pages. Or 5 niches × 2 content types × 50 = 500. The math is flexible. Each page takes ~1-2 minutes, so 500 pages ≈ 8-16 hours of background processing. No human intervention needed.

