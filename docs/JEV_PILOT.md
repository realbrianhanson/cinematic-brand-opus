# Jev shadow pilot (Sep 23–27, 2026)

## What it does

Every hour, `jev-shadow-score` asks [TypeSafe's Jev](<https://en.wikipedia.org/wiki/Jev_(AI_model)>) four typed questions about each new news item and article idea from the last 72 hours:

| Question       | Type               | Meaning                                              |
| -------------- | ------------------ | ---------------------------------------------------- |
| `relevant`     | yes/no probability | Relevant to small-business owners using AI?          |
| `duplicate`    | yes/no probability | Already covered by an article from the last 90 days? |
| `substance`    | yes/no probability | Enough concrete material for a full article?         |
| `audience_fit` | score 0–100        | How well it fits Brian's audience                    |

The answers and a `pursue` / `skip` verdict go into `public.jev_shadow_scores`. **Nothing reads that table.** The pipeline keeps working exactly as before; the pilot only records what Jev _would_ have decided so we can compare it with what actually happened.

Jev is free on the Lovable AI Gateway until Sunday 2026-09-27 23:59 UTC ([announcement](https://x.com/Lovable/status/2102111625545486444)). The function stops by itself after 2026-09-28 (`PILOT_END` in `supabase/functions/_shared/jevShadow.ts`).

## Deploy

1. Apply `supabase/migrations/20260923120000_jev_shadow_scores.sql` (table, admin-only read).
2. Deploy the `jev-shadow-score` edge function (config entry already in `supabase/config.toml`).
3. **Confirm the gateway call.** Lovable's docs list the model as "Jev Latest" but don't publish the endpoint. Before switching on the schedule, ask the Lovable agent for the exact Jev endpoint and model id on its AI Gateway and set `JEV_ENDPOINT` / `JEV_MODEL` at the top of `supabase/functions/jev-shadow-score/index.ts`. The request body follows TypeSafe's documented shape (`state` + typed `questions`); adjust only if the gateway expects a different envelope.
4. Run it once by hand as admin and check a few rows in `jev_shadow_scores`. If the first call is rejected, the function stops immediately and stores the error on one row.
5. Apply `supabase/migrations/20260923120100_jev_shadow_cron.sql` to schedule it hourly (minute 17).

## Read the results

Run `scripts/jev-pilot-report.sql` in the SQL editor on Monday. It shows:

- coverage, error count and latency
- Jev verdict against what happened to each idea (drafted, published, rejected, quality score)
- **precision** (of the ideas Jev would skip, how many were really wasted) and **recall** (of the wasted ideas, how many Jev would have skipped)
- confident skips that were published anyway, to eyeball

Good enough to use for real: precision above ~80% with meaningful recall. Then Jev can filter ideas **before** the expensive drafting step.

## Turn it off

```sql
SELECT cron.unschedule('jev-shadow-score-hourly');
```

The table can stay; it holds no personal data.

## Sources

- [Lovable: Jev free on the AI Gateway through 9/27](https://x.com/Lovable/status/2102111625545486444)
- [TypeSafe Jev API guide (DEV Community)](https://dev.to/valyuai/how-to-use-jev-a-practical-guide-to-typesafes-system-one-model-g5e)
- [Jev deep dive (Flavio Copes)](https://flaviocopes.com/jev/)
- [Jev on Wikipedia](<https://en.wikipedia.org/wiki/Jev_(AI_model)>)
