

## Problem

When you click "Generate Content" (non-dry-run), there's no visible processing feedback because:

1. **The button doesn't change** — the `generating` state is only set for dry runs. For real generation, the button stays the same — no spinner, no "Processing..." text.
2. **The Active Jobs card appears briefly then vanishes** — if the job completes fast (or the realtime update arrives quickly with "completed" status), the job is immediately removed from the active list before you can even notice it.
3. **No transition state** — between clicking the button and the Active Jobs card rendering, there's a gap where nothing visual happens.

## Fix — `src/components/admin/GenerationControls.tsx`

### 1. Add a loading state during the edge function call
Set `generating = true` at the start of the non-dry-run path (line ~245) and `false` after the response comes back. This makes the button show a spinner while the initial request is in flight.

### 2. Keep completed jobs visible for a few seconds
Instead of instantly removing completed/failed jobs from `activeJobs`, keep them in the list with a "completed" or "failed" visual state (green checkmark or red X instead of spinner) for ~5 seconds before fading out. This gives the user time to see the result.

### 3. Show a "just completed" summary card
When a job finishes, instead of only showing a toast, display a brief summary card in the Active Jobs area: "Done — 6 pages created, 0 failed" with a link to the pSEO Pages list. This card stays visible until the user dismisses it or starts a new job.

### 4. Disable button while a job is active
If there's already an active job running, disable the Generate button and show "Generation in progress..." to prevent confusion.

### Files changed
- **`src/components/admin/GenerationControls.tsx`** — All 4 changes above

