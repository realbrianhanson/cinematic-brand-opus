-- Voice + quality-gate schema
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS voice_profile TEXT,
  ADD COLUMN IF NOT EXISTS banned_phrases TEXT[] DEFAULT '{}'::TEXT[];

ALTER TABLE public.generated_pages
  ADD COLUMN IF NOT EXISTS lint_flags JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS publish_override BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS publish_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS publish_override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_override_by UUID;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS lint_flags JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC,
  ADD COLUMN IF NOT EXISTS publish_override BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS publish_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS publish_override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_override_by UUID;

-- Extend the existing status trigger with a quality gate.
-- Requires quality_score >= 75 to publish, unless publish_override = TRUE.
CREATE OR REPLACE FUNCTION public.validate_generated_pages_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('draft', 'review', 'published', 'archived') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be draft, review, published, or archived.', NEW.status;
  END IF;

  -- Publish gate: block low-quality or unscored pages unless an override is set.
  IF NEW.status = 'published'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published')
     AND COALESCE(NEW.publish_override, FALSE) = FALSE
  THEN
    IF NEW.quality_score IS NULL THEN
      RAISE EXCEPTION 'Cannot publish: quality_score is not set. Score the content first or set publish_override.';
    END IF;
    IF NEW.quality_score < 75 THEN
      RAISE EXCEPTION 'Cannot publish: quality_score % is below the 75 threshold. Improve the content or set publish_override.', NEW.quality_score;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger is attached.
DROP TRIGGER IF EXISTS validate_generated_pages_status_trigger ON public.generated_pages;
CREATE TRIGGER validate_generated_pages_status_trigger
BEFORE INSERT OR UPDATE ON public.generated_pages
FOR EACH ROW EXECUTE FUNCTION public.validate_generated_pages_status();