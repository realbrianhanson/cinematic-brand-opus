-- Resources (generated_pages), generation jobs and topic guides (pillar_pages).
--
-- Checked against production 2026-09-23 before writing:
--   * indexing_log.page_id and generation_logs.generated_page_id are nullable
--     and reference generated_pages with no ON DELETE action, so deleting a
--     resource that was ever submitted to Google fails after the admin list had
--     already removed its logs.
--   * generation_jobs has no status check, no single-job lock and no stall
--     recovery; its update trigger (update_generation_jobs_updated_at) bumps
--     updated_at on every progress write, which the stall rule below relies on.
--   * validate_pillar_pages_status only checks the status value. This file
--     keeps the body guard added by 20260923100000_pillar_body_guard.sql and
--     adds the publish gate.
-- Existing titles and rows are not rewritten here.

-- ─── 1. Deleting a resource keeps its history ───
ALTER TABLE public.indexing_log
  DROP CONSTRAINT IF EXISTS indexing_log_page_id_fkey,
  ADD CONSTRAINT indexing_log_page_id_fkey
    FOREIGN KEY (page_id) REFERENCES public.generated_pages(id) ON DELETE SET NULL;

ALTER TABLE public.generation_logs
  DROP CONSTRAINT IF EXISTS generation_logs_generated_page_id_fkey,
  ADD CONSTRAINT generation_logs_generated_page_id_fkey
    FOREIGN KEY (generated_page_id) REFERENCES public.generated_pages(id) ON DELETE SET NULL;

-- ─── 2. Admin edits to resources ───
-- The quality score is written only by the scoring functions (service_role).
-- An admin edit to the content or title clears the stored score, so the publish
-- trigger never accepts a score for content that was not scored. A published
-- resource's URL (slug) cannot change from the admin.
CREATE OR REPLACE FUNCTION public.guard_generated_page_admin_edits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.quality_score := NULL;
    RETURN NEW;
  END IF;

  IF NEW.quality_score IS DISTINCT FROM OLD.quality_score THEN
    RAISE EXCEPTION 'quality_score is set by the scoring service. Run the quality check instead of typing a score.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.content_json IS DISTINCT FROM OLD.content_json
     OR NEW.title IS DISTINCT FROM OLD.title THEN
    NEW.quality_score := NULL;
  END IF;

  IF OLD.status = 'published' AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'The URL of a published resource cannot change. Unpublish it first, or keep the current slug.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_generated_page_admin_edits() FROM PUBLIC, anon, authenticated;

-- Named to sort before trg_validate_generated_pages_status, so a combined
-- "edit + publish" update is judged on the cleared score.
DROP TRIGGER IF EXISTS trg_guard_generated_page_edits ON public.generated_pages;
CREATE TRIGGER trg_guard_generated_page_edits
  BEFORE INSERT OR UPDATE ON public.generated_pages
  FOR EACH ROW EXECUTE FUNCTION public.guard_generated_page_admin_edits();

-- ─── 3. Generation jobs: statuses, one active job, resumable queue ───
ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS work_queue jsonb;

COMMENT ON COLUMN public.generation_jobs.work_queue IS
  'Items the job will generate, saved at setup so a stalled or cancelled job can resume from completed_count.';

-- Only one pending/running job may exist; older duplicates (none in production
-- on 2026-09-23) are parked as stalled so the lock can be created.
UPDATE public.generation_jobs j
   SET status = 'stalled',
       error_message = coalesce(j.error_message, 'Parked when the single-job lock was added.')
 WHERE j.status IN ('pending', 'running')
   AND j.id <> (
     SELECT id FROM public.generation_jobs
      WHERE status IN ('pending', 'running')
      ORDER BY created_at DESC
      LIMIT 1
   );

ALTER TABLE public.generation_jobs
  DROP CONSTRAINT IF EXISTS generation_jobs_status_check,
  ADD CONSTRAINT generation_jobs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'stalled'));

CREATE UNIQUE INDEX IF NOT EXISTS generation_jobs_one_active
  ON public.generation_jobs ((true))
  WHERE status IN ('pending', 'running');

-- Marks pending/running jobs with no progress for p_stall_minutes as stalled,
-- which releases the single-job lock. Called by the Generate drafts screen, by
-- generate-content before it starts a job, and by the cron schedule below.
CREATE OR REPLACE FUNCTION public.mark_stalled_generation_jobs(p_stall_minutes integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes integer := greatest(coalesce(p_stall_minutes, 30), 5);
  v_count integer;
BEGIN
  -- auth.uid() is null for service_role and cron; signed-in callers must be admins.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.generation_jobs
     SET status = 'stalled',
         error_message = format(
           'No progress for %s minutes after %s of %s pages. Resume or cancel it.',
           v_minutes, completed_count, total_combinations)
   WHERE status IN ('pending', 'running')
     AND updated_at < now() - make_interval(mins => v_minutes);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_stalled_generation_jobs(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_stalled_generation_jobs(integer) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generation-jobs-stall-sweeper') THEN
    PERFORM cron.unschedule('generation-jobs-stall-sweeper');
  END IF;
  PERFORM cron.schedule(
    'generation-jobs-stall-sweeper',
    '*/10 * * * *',
    'SELECT public.mark_stalled_generation_jobs(30)'
  );
END $$;

-- ─── 4. Topic guide publish gate ───
CREATE TABLE IF NOT EXISTS public.pillar_publish_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pillar_id uuid NOT NULL REFERENCES public.pillar_pages(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 10),
  issues text[] NOT NULL DEFAULT '{}',
  overridden_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pillar_publish_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can read pillar publish overrides" ON public.pillar_publish_overrides;
CREATE POLICY "Admins can read pillar publish overrides"
  ON public.pillar_publish_overrides FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
REVOKE ALL ON public.pillar_publish_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pillar_publish_overrides TO authenticated;
GRANT ALL ON public.pillar_publish_overrides TO service_role;

CREATE OR REPLACE FUNCTION public.validate_pillar_pages_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  min_body_chars constant integer := 200;
  min_publish_chars constant integer := 1500;
  min_publish_sections constant integer := 3;
  old_body_chars integer;
  new_body_chars integer;
  new_sections integer;
BEGIN
  IF NEW.status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be draft or published.', NEW.status;
  END IF;

  new_body_chars := length(btrim(regexp_replace(
    regexp_replace(coalesce(NEW.content, ''), '<[^>]*>', '', 'g'),
    '(&nbsp;|&#160;|\s)+', ' ', 'g')));

  -- Body guard (20260923100000_pillar_body_guard.sql), unchanged.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'published'
     AND NEW.content IS DISTINCT FROM OLD.content THEN
    old_body_chars := length(btrim(regexp_replace(
      regexp_replace(coalesce(OLD.content, ''), '<[^>]*>', '', 'g'),
      '(&nbsp;|&#160;|\s)+', ' ', 'g')));
    IF new_body_chars < min_body_chars AND old_body_chars >= min_body_chars THEN
      RAISE EXCEPTION
        'Refusing to empty the body of published topic guide "%": % visible characters would drop to %.',
        OLD.slug, old_body_chars, new_body_chars
        USING ERRCODE = 'check_violation',
              HINT = 'Reload the editor so the stored body loads, or unpublish the guide first.';
    END IF;
  END IF;

  -- Publish gate: a guide becomes published only with enough text and
  -- section headings, unless publish_pillar_page_with_override() is publishing
  -- this exact guide in this transaction.
  IF NEW.status = 'published'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    SELECT count(*) INTO new_sections
      FROM regexp_matches(coalesce(NEW.content, ''), '<h2[\s>]', 'gi');
    IF (new_body_chars < min_publish_chars OR new_sections < min_publish_sections)
       AND coalesce(current_setting('app.pillar_publish_override', true), '') IS DISTINCT FROM NEW.id::text THEN
      RAISE EXCEPTION
        'Cannot publish topic guide "%": it has % characters of text and % section headings (needs at least % and %).',
        NEW.slug, new_body_chars, new_sections, min_publish_chars, min_publish_sections
        USING ERRCODE = 'check_violation',
              HINT = 'Add content and H2 section headings, or publish with an override reason.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_pillar_pages_status() FROM PUBLIC, anon, authenticated;

-- Publishes one guide past the gate with a recorded reason (admins only).
CREATE OR REPLACE FUNCTION public.publish_pillar_page_with_override(
  p_pillar_id uuid,
  p_reason text,
  p_issues text[] DEFAULT '{}'
)
RETURNS SETOF public.pillar_pages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Give a reason of at least 10 characters for publishing this guide without passing the quality check.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pillar_pages WHERE id = p_pillar_id) THEN
    RAISE EXCEPTION 'This topic guide no longer exists.' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.pillar_publish_overrides (pillar_id, reason, issues, overridden_by)
  VALUES (p_pillar_id, btrim(p_reason), coalesce(p_issues, '{}'), auth.uid());

  PERFORM set_config('app.pillar_publish_override', p_pillar_id::text, true);
  RETURN QUERY
    UPDATE public.pillar_pages
       SET status = 'published',
           published_at = coalesce(published_at, now())
     WHERE id = p_pillar_id
    RETURNING *;
  PERFORM set_config('app.pillar_publish_override', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.publish_pillar_page_with_override(uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_pillar_page_with_override(uuid, text, text[]) TO authenticated, service_role;
