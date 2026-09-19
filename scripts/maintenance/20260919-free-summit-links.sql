-- Applied September 19, 2026 to Brian's owner database; not a member migration.
-- Retained for audit. Strict guards intentionally refuse to apply a second time.
-- Replaces complete legacy root URLs in href attributes and Markdown links.
-- No query-bearing URLs were present. Such URLs/other variants abort the guard
-- rather than dropping tracking parameters or rewriting unrelated destinations.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.site_settings) <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.site_settings
    WHERE site_url='https://brianhanson.com' AND author_name='Brian Hanson'
  ) THEN
    RAISE EXCEPTION 'Event link repair is restricted to the Brian Hanson owner site';
  END IF;
END $$;

-- Keep scheduled/editor writes from changing the reviewed batch mid-transaction.
LOCK TABLE public.posts IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE brian_event_link_repairs ON COMMIT DROP AS
SELECT id,status,content AS before_content,
  regexp_replace(
    regexp_replace(content,
      $rx$(href[[:space:]]*=[[:space:]]*["'])https://aiforbeginners[.]com/?(["'])$rx$,
      $replacement$\1https://go.aiforbusiness.com/summit?_go=brian60\2$replacement$,'g'),
    $rx$(\]\()https://aiforbeginners[.]com/?(\))$rx$,
    $replacement$\1https://go.aiforbusiness.com/summit?_go=brian60\2$replacement$,'g'
  ) AS after_content
FROM public.posts
WHERE content ILIKE '%aiforbeginners.com%';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='public.posts'::regclass
      AND tgname='capture_post_revision' AND tgenabled IN ('O','A')
  ) THEN
    RAISE EXCEPTION 'Revision capture must be enabled';
  END IF;
  -- All affected posts had no revisions at review time. Fail rather than
  -- allowing the normal 20-revision retention limit to prune existing history.
  IF EXISTS (
    SELECT 1 FROM public.post_revisions v
    JOIN brian_event_link_repairs r ON r.id=v.post_id
  ) THEN
    RAISE EXCEPTION 'Affected revision history changed since review';
  END IF;
  IF (SELECT count(*) FROM brian_event_link_repairs) <> 235
    OR (SELECT count(*) FROM brian_event_link_repairs WHERE status='published') <> 230
    OR (SELECT count(*) FROM brian_event_link_repairs WHERE status='draft') <> 5
    OR (SELECT sum((length(before_content)-length(replace(before_content,'aiforbeginners.com','')))/length('aiforbeginners.com')) FROM brian_event_link_repairs) <> 306
    OR EXISTS(SELECT 1 FROM public.posts WHERE excerpt ILIKE '%aiforbeginners.com%')
    OR EXISTS(SELECT 1 FROM brian_event_link_repairs WHERE after_content ILIKE '%aiforbeginners.com%' OR before_content IS NOT DISTINCT FROM after_content)
  THEN
    RAISE EXCEPTION 'Legacy event links changed since review; inspect variants/counts before retrying';
  END IF;
END $$;

-- Only live post content changes. Slugs, excerpts, status, publication dates,
-- SEO records and unrelated URLs are not assigned or rewritten.
-- Normal triggers update timestamps and retain up to 20 revisions per post.
-- The zero-existing-revisions guard above prevents history pruning in this batch.
WITH changed AS (
  UPDATE public.posts p SET content=r.after_content
  FROM brian_event_link_repairs r
  WHERE p.id=r.id AND p.content IS NOT DISTINCT FROM r.before_content
  RETURNING p.id,p.status
)
SELECT count(*) AS repaired_posts,
  count(*) FILTER(WHERE status='published') AS published_posts,
  count(*) FILTER(WHERE status='draft') AS draft_posts
FROM changed;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM brian_event_link_repairs r
    JOIN public.posts p ON p.id=r.id
    WHERE p.content IS DISTINCT FROM r.after_content
  ) OR (
    SELECT count(DISTINCT r.id) FROM brian_event_link_repairs r
    JOIN public.post_revisions v ON v.post_id=r.id
    WHERE v.snapshot->'post'->>'content'=r.before_content
  ) <> 235 THEN
    RAISE EXCEPTION 'Repair or before-image verification failed';
  END IF;
END $$;
COMMIT;
