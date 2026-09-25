-- Private before-images. A recorded change is not a factual review or approval.
BEGIN;
CREATE TABLE public.generated_page_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.generated_pages(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  actor_id uuid,
  change_source text NOT NULL CHECK (change_source IN ('authenticated', 'system')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.pillar_page_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pillar_pages(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  actor_id uuid,
  change_source text NOT NULL CHECK (change_source IN ('authenticated', 'system')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX generated_page_revisions_lookup ON public.generated_page_revisions(page_id, created_at DESC, id DESC);
CREATE INDEX pillar_page_revisions_lookup ON public.pillar_page_revisions(page_id, created_at DESC, id DESC);
ALTER TABLE public.generated_page_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pillar_page_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.generated_page_revisions, public.pillar_page_revisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.generated_page_revisions, public.pillar_page_revisions TO authenticated, service_role;
CREATE POLICY "Admins read resource history" ON public.generated_page_revisions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins read guide history" ON public.pillar_page_revisions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE FUNCTION public.capture_resource_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF jsonb_build_array(OLD.title, OLD.slug, OLD.content_json, OLD.seo_meta, OLD.status, OLD.niche_id, OLD.content_schema_id)
    IS DISTINCT FROM jsonb_build_array(NEW.title, NEW.slug, NEW.content_json, NEW.seo_meta, NEW.status, NEW.niche_id, NEW.content_schema_id) THEN
    INSERT INTO public.generated_page_revisions(page_id, snapshot, actor_id, change_source)
      VALUES (OLD.id, to_jsonb(OLD), auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'authenticated' END);
    DELETE FROM public.generated_page_revisions WHERE page_id = OLD.id AND id NOT IN
      (SELECT id FROM public.generated_page_revisions WHERE page_id = OLD.id ORDER BY created_at DESC, id DESC LIMIT 20);
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION public.capture_guide_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF jsonb_build_array(OLD.title, OLD.slug, OLD.content, OLD.seo_meta, OLD.status, OLD.niche_id)
    IS DISTINCT FROM jsonb_build_array(NEW.title, NEW.slug, NEW.content, NEW.seo_meta, NEW.status, NEW.niche_id) THEN
    INSERT INTO public.pillar_page_revisions(page_id, snapshot, actor_id, change_source)
      VALUES (OLD.id, to_jsonb(OLD), auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'authenticated' END);
    DELETE FROM public.pillar_page_revisions WHERE page_id = OLD.id AND id NOT IN
      (SELECT id FROM public.pillar_page_revisions WHERE page_id = OLD.id ORDER BY created_at DESC, id DESC LIMIT 20);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_resource_revision(), public.capture_guide_revision() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER capture_resource_revision BEFORE UPDATE ON public.generated_pages FOR EACH ROW EXECUTE FUNCTION public.capture_resource_revision();
CREATE TRIGGER capture_guide_revision BEFORE UPDATE ON public.pillar_pages FOR EACH ROW EXECUTE FUNCTION public.capture_guide_revision();

-- Every guide update gets an authoritative, fresh concurrency token, including
-- service writes. Replace the existing timestamp trigger, not its global helper.
CREATE FUNCTION public.touch_guide_version() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := greatest(clock_timestamp(), coalesce(OLD.updated_at, '-infinity'::timestamptz) + interval '1 microsecond'); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.touch_guide_version() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_pillar_pages_updated_at ON public.pillar_pages;
CREATE TRIGGER trg_pillar_pages_updated_at BEFORE UPDATE ON public.pillar_pages FOR EACH ROW EXECUTE FUNCTION public.touch_guide_version();

-- Add a versioned RPC without breaking the currently published admin frontend.
CREATE FUNCTION public.publish_pillar_page_with_override_v2(
  p_pillar_id uuid, p_reason text, p_issues text[], p_expected_updated_at timestamptz
) RETURNS SETOF public.pillar_pages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current_guide public.pillar_pages%ROWTYPE;
BEGIN
  IF public.is_admin(auth.uid()) IS NOT TRUE THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT * INTO current_guide FROM public.pillar_pages WHERE id = p_pillar_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This topic guide no longer exists.' USING ERRCODE = 'no_data_found'; END IF;
  IF p_expected_updated_at IS NULL OR current_guide.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'This topic guide changed. Load the latest saved version before publishing.' USING ERRCODE = 'serialization_failure';
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Give a reason of at least 10 characters for publishing this guide without passing the quality check.' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.pillar_publish_overrides(pillar_id, reason, issues, overridden_by)
    VALUES (p_pillar_id, btrim(p_reason), coalesce(p_issues, '{}'), auth.uid());
  PERFORM set_config('app.pillar_publish_override', p_pillar_id::text, true);
  RETURN QUERY UPDATE public.pillar_pages SET status = 'published', published_at = coalesce(published_at, now()) WHERE id = p_pillar_id RETURNING *;
  PERFORM set_config('app.pillar_publish_override', '', true);
END $$;
REVOKE ALL ON FUNCTION public.publish_pillar_page_with_override_v2(uuid, text, text[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_pillar_page_with_override_v2(uuid, text, text[], timestamptz) TO authenticated, service_role;
-- Compatibility for the existing published admin. It cannot compare a client
-- version, but retains its original status-only behavior under the same row lock.
-- Remove only after the public frontend has migrated to the guarded v2 API.
CREATE OR REPLACE FUNCTION public.publish_pillar_page_with_override(
  p_pillar_id uuid, p_reason text, p_issues text[] DEFAULT '{}'
) RETURNS SETOF public.pillar_pages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current_version timestamptz;
BEGIN
  IF public.is_admin(auth.uid()) IS NOT TRUE THEN RAISE EXCEPTION 'Admins only' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT updated_at INTO current_version FROM public.pillar_pages WHERE id = p_pillar_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This topic guide no longer exists.' USING ERRCODE = 'no_data_found'; END IF;
  RETURN QUERY SELECT * FROM public.publish_pillar_page_with_override_v2(p_pillar_id, p_reason, p_issues, current_version);
END $$;
REVOKE ALL ON FUNCTION public.publish_pillar_page_with_override(uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_pillar_page_with_override(uuid, text, text[]) TO authenticated, service_role;
COMMIT;
