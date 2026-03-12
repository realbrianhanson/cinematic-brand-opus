
-- ==================== TABLES ====================

-- site_settings
CREATE TABLE public.site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name TEXT NOT NULL DEFAULT 'My Website',
  site_url TEXT NOT NULL DEFAULT 'https://example.com',
  author_name TEXT NOT NULL DEFAULT 'Site Owner',
  author_title TEXT DEFAULT 'Entrepreneur',
  author_bio TEXT,
  author_credentials TEXT[] DEFAULT '{}',
  author_social_links JSONB DEFAULT '{}',
  cta_url TEXT DEFAULT '',
  cta_headline TEXT DEFAULT 'Free Training',
  cta_subtext TEXT DEFAULT 'Join thousands learning to grow their business.',
  cta_button_text TEXT DEFAULT 'Get Free Access',
  cta_social_proof TEXT DEFAULT '',
  publisher_name TEXT DEFAULT 'My Brand',
  publisher_url TEXT DEFAULT 'https://example.com',
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read site_settings" ON public.site_settings FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert site_settings" ON public.site_settings FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update site_settings" ON public.site_settings FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete site_settings" ON public.site_settings FOR DELETE TO authenticated USING (is_admin(auth.uid()));
INSERT INTO public.site_settings DEFAULT VALUES;

-- niches
CREATE TABLE public.niches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  parent_niche_id UUID REFERENCES public.niches(id) ON DELETE SET NULL,
  context JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.niches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read niches" ON public.niches FOR SELECT TO public USING (true);
CREATE POLICY "Admins can insert niches" ON public.niches FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update niches" ON public.niches FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete niches" ON public.niches FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- content_schemas
CREATE TABLE public.content_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  schema_definition JSONB NOT NULL,
  title_template TEXT NOT NULL,
  description_template TEXT,
  renderer_component TEXT NOT NULL,
  items_per_section INTEGER DEFAULT 15,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.content_schemas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read content_schemas" ON public.content_schemas FOR SELECT TO public USING (true);
CREATE POLICY "Admins can insert content_schemas" ON public.content_schemas FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update content_schemas" ON public.content_schemas FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete content_schemas" ON public.content_schemas FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- pillar_pages
CREATE TABLE public.pillar_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche_id UUID REFERENCES public.niches(id) ON DELETE SET NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  seo_meta JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.validate_pillar_pages_status() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be draft or published.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_pillar_pages_status BEFORE INSERT OR UPDATE ON public.pillar_pages FOR EACH ROW EXECUTE FUNCTION public.validate_pillar_pages_status();
ALTER TABLE public.pillar_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read published pillar_pages" ON public.pillar_pages FOR SELECT TO public USING ((status = 'published') OR is_admin(auth.uid()));
CREATE POLICY "Admins can insert pillar_pages" ON public.pillar_pages FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update pillar_pages" ON public.pillar_pages FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete pillar_pages" ON public.pillar_pages FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- generated_pages
CREATE TABLE public.generated_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche_id UUID REFERENCES public.niches(id),
  content_schema_id UUID REFERENCES public.content_schemas(id),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content_json JSONB NOT NULL,
  seo_meta JSONB DEFAULT '{}',
  schema_markup JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  quality_score NUMERIC,
  generation_model TEXT,
  generation_cost NUMERIC,
  published_at TIMESTAMPTZ,
  last_refreshed TIMESTAMPTZ DEFAULT now(),
  refresh_count INTEGER DEFAULT 0,
  performance_trend TEXT DEFAULT 'new',
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.validate_generated_pages_status() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'review', 'published', 'archived') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be draft, review, published, or archived.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_generated_pages_status BEFORE INSERT OR UPDATE ON public.generated_pages FOR EACH ROW EXECUTE FUNCTION public.validate_generated_pages_status();
ALTER TABLE public.generated_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read published generated_pages" ON public.generated_pages FOR SELECT TO public USING ((status = 'published') OR is_admin(auth.uid()));
CREATE POLICY "Admins can insert generated_pages" ON public.generated_pages FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update generated_pages" ON public.generated_pages FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete generated_pages" ON public.generated_pages FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- generation_logs
CREATE TABLE public.generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT,
  generated_page_id UUID REFERENCES public.generated_pages(id),
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  tokens_used INTEGER,
  cost NUMERIC,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.generation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read generation_logs" ON public.generation_logs FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert generation_logs" ON public.generation_logs FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update generation_logs" ON public.generation_logs FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete generation_logs" ON public.generation_logs FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- internal_links
CREATE TABLE public.internal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_page_id UUID NOT NULL,
  source_page_type TEXT NOT NULL,
  target_page_id UUID NOT NULL,
  target_page_type TEXT NOT NULL,
  link_type TEXT NOT NULL,
  anchor_text TEXT NOT NULL,
  position TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.internal_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read internal_links" ON public.internal_links FOR SELECT TO public USING (true);
CREATE POLICY "Admins can insert internal_links" ON public.internal_links FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update internal_links" ON public.internal_links FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete internal_links" ON public.internal_links FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- link_clicks
CREATE TABLE public.link_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_link_id UUID REFERENCES public.internal_links(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.link_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert link_clicks" ON public.link_clicks FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins can read link_clicks" ON public.link_clicks FOR SELECT TO authenticated USING (is_admin(auth.uid()));

-- cta_events
CREATE TABLE public.cta_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID,
  page_type TEXT,
  cta_variant TEXT,
  event_type TEXT,
  niche_slug TEXT,
  content_type_slug TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.cta_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert cta_events" ON public.cta_events FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins can read cta_events" ON public.cta_events FOR SELECT TO authenticated USING (is_admin(auth.uid()));

-- indexing_log
CREATE TABLE public.indexing_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES public.generated_pages(id),
  page_url TEXT NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  indexed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'submitted',
  checked_at TIMESTAMPTZ
);
ALTER TABLE public.indexing_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read indexing_log" ON public.indexing_log FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert indexing_log" ON public.indexing_log FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update indexing_log" ON public.indexing_log FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete indexing_log" ON public.indexing_log FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- keyword_assignments
CREATE TABLE public.keyword_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES public.generated_pages(id) ON DELETE CASCADE,
  primary_keyword TEXT NOT NULL,
  secondary_keywords TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.keyword_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read keyword_assignments" ON public.keyword_assignments FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert keyword_assignments" ON public.keyword_assignments FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update keyword_assignments" ON public.keyword_assignments FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete keyword_assignments" ON public.keyword_assignments FOR DELETE TO authenticated USING (is_admin(auth.uid()));
CREATE UNIQUE INDEX idx_unique_primary_keyword ON public.keyword_assignments(primary_keyword);

-- page_engagement
CREATE TABLE public.page_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES public.generated_pages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.page_engagement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert page_engagement" ON public.page_engagement FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins can read page_engagement" ON public.page_engagement FOR SELECT TO authenticated USING (is_admin(auth.uid()));

-- ==================== TRIGGERS ====================
CREATE TRIGGER trg_niches_updated_at BEFORE UPDATE ON public.niches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pillar_pages_updated_at BEFORE UPDATE ON public.pillar_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_generated_pages_updated_at BEFORE UPDATE ON public.generated_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==================== INDEXES ====================
CREATE INDEX idx_niches_slug ON public.niches(slug);
CREATE INDEX idx_niches_is_active ON public.niches(is_active);
CREATE INDEX idx_generated_pages_slug ON public.generated_pages(slug);
CREATE INDEX idx_generated_pages_status ON public.generated_pages(status);
CREATE INDEX idx_generated_pages_niche_id ON public.generated_pages(niche_id);
CREATE INDEX idx_generated_pages_content_schema_id ON public.generated_pages(content_schema_id);
CREATE INDEX idx_generated_pages_published_at ON public.generated_pages(published_at);
CREATE INDEX idx_internal_links_source ON public.internal_links(source_page_id);
CREATE INDEX idx_internal_links_target ON public.internal_links(target_page_id);
CREATE INDEX idx_cta_events_page_id ON public.cta_events(page_id);
CREATE INDEX idx_cta_events_created_at ON public.cta_events(created_at);
