-- Working copies are separate from posts: autosave must never publish changes.
CREATE TABLE IF NOT EXISTS public.post_editor_drafts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_key text NOT NULL CHECK (length(document_key) BETWEEN 1 AND 100),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 2000000),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, document_key)
);
ALTER TABLE public.post_editor_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin own working copies" ON public.post_editor_drafts FOR ALL TO authenticated USING (public.is_admin(auth.uid()) AND user_id = auth.uid()) WITH CHECK (public.is_admin(auth.uid()) AND user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_editor_drafts TO authenticated;
REVOKE ALL ON public.post_editor_drafts FROM anon;
CREATE OR REPLACE FUNCTION public.touch_editor_draft() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER touch_editor_draft BEFORE UPDATE ON public.post_editor_drafts FOR EACH ROW EXECUTE FUNCTION public.touch_editor_draft();
CREATE TABLE IF NOT EXISTS public.post_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX post_revisions_lookup ON public.post_revisions(post_id, created_at DESC);
ALTER TABLE public.post_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read revisions" ON public.post_revisions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
REVOKE ALL ON public.post_revisions FROM authenticated;
GRANT SELECT ON public.post_revisions TO authenticated;
REVOKE ALL ON public.post_revisions FROM anon;
CREATE OR REPLACE FUNCTION public.capture_post_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (to_jsonb(OLD) - ARRAY['updated_at','views']) IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['updated_at','views']) THEN
    INSERT INTO public.post_revisions(post_id,snapshot) VALUES (OLD.id,jsonb_build_object('post',to_jsonb(OLD),'seo',(SELECT to_jsonb(s) FROM public.seo_metadata s WHERE s.post_id=OLD.id LIMIT 1)));
    DELETE FROM public.post_revisions WHERE post_id=OLD.id AND id NOT IN (SELECT id FROM public.post_revisions WHERE post_id=OLD.id ORDER BY created_at DESC,id DESC LIMIT 20);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_post_revision() FROM PUBLIC;
CREATE TRIGGER capture_post_revision BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.capture_post_revision();

-- SEO-only saves also have a recoverable before-image.
CREATE OR REPLACE FUNCTION public.capture_seo_revision() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (to_jsonb(OLD)-ARRAY['updated_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['updated_at']) THEN
   INSERT INTO public.post_revisions(post_id,snapshot) VALUES(OLD.post_id,jsonb_build_object('post',(SELECT to_jsonb(p) FROM public.posts p WHERE p.id=OLD.post_id),'seo',to_jsonb(OLD)));
   DELETE FROM public.post_revisions WHERE post_id=OLD.post_id AND id NOT IN (SELECT id FROM public.post_revisions WHERE post_id=OLD.post_id ORDER BY created_at DESC,id DESC LIMIT 20);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_seo_revision() FROM PUBLIC;
CREATE TRIGGER capture_seo_revision BEFORE UPDATE ON public.seo_metadata FOR EACH ROW EXECUTE FUNCTION public.capture_seo_revision();
