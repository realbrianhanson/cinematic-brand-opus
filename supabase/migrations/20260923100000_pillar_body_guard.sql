-- Backstop for the topic guide editor data-loss bug: the admin editor could
-- save '<p></p>' over a live guide. Block any UPDATE that takes a published
-- guide's body from real content (>= 200 visible characters) down to an
-- empty or near-empty body (< 200 visible characters). The status check is
-- unchanged, and the same trigger (trg_validate_pillar_pages_status) keeps
-- calling this function on INSERT and UPDATE.
CREATE OR REPLACE FUNCTION public.validate_pillar_pages_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  min_body_chars constant integer := 200;
  old_body_chars integer;
  new_body_chars integer;
BEGIN
  IF NEW.status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be draft or published.', NEW.status;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.status = 'published'
     AND NEW.content IS DISTINCT FROM OLD.content THEN
    -- Visible text length: drop tags, collapse entities/whitespace.
    old_body_chars := length(btrim(regexp_replace(
      regexp_replace(coalesce(OLD.content, ''), '<[^>]*>', '', 'g'),
      '(&nbsp;|&#160;|\s)+', ' ', 'g')));
    new_body_chars := length(btrim(regexp_replace(
      regexp_replace(coalesce(NEW.content, ''), '<[^>]*>', '', 'g'),
      '(&nbsp;|&#160;|\s)+', ' ', 'g')));
    IF new_body_chars < min_body_chars AND old_body_chars >= min_body_chars THEN
      RAISE EXCEPTION
        'Refusing to empty the body of published topic guide "%": % visible characters would drop to %.',
        OLD.slug, old_body_chars, new_body_chars
        USING ERRCODE = 'check_violation',
              HINT = 'Reload the editor so the stored body loads, or unpublish the guide first.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_pillar_pages_status() FROM PUBLIC, anon, authenticated;
