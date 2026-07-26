# Lower daily article output to 3/day

## Changes

1. **Update `site_settings_private.auto_publish_daily_cap`**: `8` → `3`
   - This is the auto-publish gate ceiling (`_shared/publishGate.ts`). Once 3 posts are scheduled/published in a 24h window, the gate stops promoting drafts.

2. **Tighten the drafting budget in `supabase/functions/daily-content-run/index.ts`**
   - Currently stops drafting at `dailyCap + 4` (= 7 with new cap). That would waste 4 drafts/day that never publish.
   - Change buffer from `+ 4` to `+ 1`, so drafting stops at `cap + 1 = 4`. One-draft headroom absorbs the occasional draft that fails fact-check/quality gates, without burning credits on drafts that will never ship.

3. **Reduce per-run draft ceiling**: `MAX_DRAFTS_PER_RUN` `6` → `3`
   - Prevents a single 30-min cron run from blowing the entire day's budget in one burst, spreading output more evenly across the day.

## What stays the same

- Cron cadence (every 30 min) — unchanged. The daily budget check short-circuits runs once the ceiling is hit, so extra runs are cheap no-ops.
- Quality gates, fact-check, similarity, voice/lint — all unchanged.
- Manual publish path — unchanged; admin can still force-publish via override.

## Expected steady-state

- **~3 published articles per 24h** (matching cap).
- Up to ~4 drafts created per 24h; the 4th is a buffer for gate rejections.
- Existing drafts and already-published posts are untouched.

## Technical details

- Migration: `UPDATE public.site_settings_private SET auto_publish_daily_cap = 3;` (single-row table).
- Code edit: `supabase/functions/daily-content-run/index.ts` — two constants (`MAX_DRAFTS_PER_RUN`, and the `dailyCap + 4` expression).
- No schema changes, no new tables, no RLS changes.
