-- Jev shadow pilot report (read-only). Run in the SQL editor after a few days.
-- "Outcome" is what the existing pipeline actually did with each subject.

-- 1. Coverage and health
SELECT subject_type,
       count(*)                                   AS scored_rows,
       count(*) FILTER (WHERE error IS NOT NULL)  AS errors,
       round(avg(latency_ms))                     AS avg_latency_ms,
       count(*) FILTER (WHERE verdict = 'skip')   AS jev_would_skip
FROM public.jev_shadow_scores
GROUP BY subject_type;

-- 2. Article ideas: Jev verdict vs what happened
WITH o AS (
  SELECT s.verdict, s.relevant_prob, s.duplicate_prob, s.substance_prob,
         s.audience_fit_score, co.status AS opp_status,
         p.status AS post_status, p.quality_score
  FROM public.jev_shadow_scores s
  JOIN public.content_opportunities co ON co.id = s.subject_id
  LEFT JOIN public.posts p ON p.opportunity_id = co.id
  WHERE s.subject_type = 'opportunity' AND s.error IS NULL
)
SELECT verdict,
       count(*)                                                   AS ideas,
       count(*) FILTER (WHERE post_status IS NOT NULL)            AS drafted,
       count(*) FILTER (WHERE post_status = 'published')          AS published,
       count(*) FILTER (WHERE opp_status = 'rejected')            AS rejected,
       count(*) FILTER (WHERE post_status IS NOT NULL
                          AND post_status <> 'published')         AS drafted_not_published,
       round(avg(quality_score) FILTER (WHERE quality_score IS NOT NULL)) AS avg_quality
FROM o GROUP BY verdict ORDER BY verdict;

-- 3. Did "skip" catch the waste? Precision = skipped ideas that really were
--    rejected or never published; recall = share of wasted ideas Jev skipped.
WITH o AS (
  SELECT s.verdict = 'skip' AS jev_skip,
         (co.status = 'rejected'
          OR (p.id IS NOT NULL AND p.status <> 'published')) AS wasted,
         p.status = 'published' AS good
  FROM public.jev_shadow_scores s
  JOIN public.content_opportunities co ON co.id = s.subject_id
  LEFT JOIN public.posts p ON p.opportunity_id = co.id
  WHERE s.subject_type = 'opportunity' AND s.error IS NULL AND s.verdict IS NOT NULL
)
SELECT count(*) FILTER (WHERE jev_skip)                         AS skipped,
       count(*) FILTER (WHERE jev_skip AND wasted)              AS skipped_and_wasted,
       count(*) FILTER (WHERE jev_skip AND good)                AS skipped_but_published,
       round(100.0 * count(*) FILTER (WHERE jev_skip AND wasted)
             / NULLIF(count(*) FILTER (WHERE jev_skip), 0), 1)  AS precision_pct,
       round(100.0 * count(*) FILTER (WHERE jev_skip AND wasted)
             / NULLIF(count(*) FILTER (WHERE wasted), 0), 1)    AS recall_pct
FROM o;

-- 4. News items: Jev verdict vs whether the pipeline used them
SELECT s.verdict, si.status AS item_status, count(*)
FROM public.jev_shadow_scores s
JOIN public.source_items si ON si.id = s.subject_id
WHERE s.subject_type = 'source_item' AND s.error IS NULL
GROUP BY 1, 2 ORDER BY 1, 2;

-- 5. Examples to eyeball: confident skips that were published anyway
SELECT co.angle, s.relevant_prob, s.duplicate_prob, s.substance_prob, s.audience_fit_score
FROM public.jev_shadow_scores s
JOIN public.content_opportunities co ON co.id = s.subject_id
JOIN public.posts p ON p.opportunity_id = co.id AND p.status = 'published'
WHERE s.subject_type = 'opportunity' AND s.verdict = 'skip'
ORDER BY s.created_at DESC LIMIT 20;
