

## Plan: Background Jobs for Content Generation + Seed Content Types

### Problem
1. **`content_schemas` table is empty** (0 rows) — generation has nothing to work with
2. **Edge function processes synchronously** — times out on even small batches, UI hangs forever with no feedback

### Solution: 3 Parts

---

### Part 1: Seed 6 Default Content Types
Insert 6 content schemas into `content_schemas` via the insert tool (not migration — this is data, not schema):
- **Tool Roundups** (`tool-roundups`) → `ToolRoundupRenderer`
- **Implementation Checklists** (`checklists`) → `ChecklistRenderer`
- **Strategy Guides** (`strategy-guides`) → `GuideRenderer`
- **Ideas & Use Cases** (`ideas-use-cases`) → `IdeaListRenderer`
- **Templates & Frameworks** (`templates-frameworks`) → `TemplateRenderer`
- **FAQ Collections** (`faq-collections`) → `FAQRenderer`

Each with appropriate `schema_definition`, `title_template`, `description_template`, and `items_per_section`.

---

### Part 2: Create `generation_jobs` Table
New table to track background job progress:

```text
generation_jobs
├── id (uuid, PK)
├── batch_id (text)
├── status (text: pending, running, completed, failed)
├── total_combinations (int)
├── completed_count (int, default 0)
├── success_count (int, default 0)
├── failed_count (int, default 0)
├── skipped_count (int, default 0)
├── request_payload (jsonb) — stores niche_slugs, content_type_slug, etc.
├── result_summary (jsonb) — final results with page list
├── error_message (text)
├── created_at, updated_at (timestamptz)
```

RLS: admins only (read/write). Enable realtime so the UI can subscribe to changes.

---

### Part 3: Refactor Edge Function + UI

**Edge function (`generate-content/index.ts`):**
1. On request: create a `generation_jobs` row with status `pending`, return the job ID immediately (< 1 second response)
2. Continue processing in the background (using `EdgeRuntime.waitUntil` or a self-invocation pattern)
3. Update the `generation_jobs` row as each combination completes (`completed_count++`, `success_count++`, etc.)
4. Set status to `completed` or `failed` when done

**UI (`GenerationControls.tsx`):**
1. Click "Generate" → call edge function → get back `job_id` instantly
2. Subscribe to `generation_jobs` via Supabase realtime for live progress updates
3. Show a progress bar: "3 of 12 pages complete" with success/fail counts
4. User can navigate away and come back — job status persists
5. Add an "Active Jobs" section showing any running jobs
6. Guard: if `content_schemas` is empty, show a message "Create at least one content type first" and disable the Generate button

---

### Files Changed
- **New migration**: `generation_jobs` table + realtime
- **Data insert**: 6 content schemas
- **`supabase/functions/generate-content/index.ts`**: Return job ID immediately, process in background, update job progress
- **`src/components/admin/GenerationControls.tsx`**: Realtime subscription to job progress, progress bar, empty-state guard, active jobs section

