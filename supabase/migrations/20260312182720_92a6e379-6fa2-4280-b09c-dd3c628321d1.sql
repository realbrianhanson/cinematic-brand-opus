
-- Add columns to generated_pages
ALTER TABLE public.generated_pages
  ADD COLUMN IF NOT EXISTS target_keyword TEXT,
  ADD COLUMN IF NOT EXISTS keyword_difficulty TEXT DEFAULT 'easy',
  ADD COLUMN IF NOT EXISTS silo_niche_id UUID REFERENCES public.niches(id);

-- Validation trigger for keyword_difficulty
CREATE OR REPLACE FUNCTION public.validate_keyword_difficulty()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.keyword_difficulty IS NOT NULL AND NEW.keyword_difficulty NOT IN ('easy', 'medium', 'hard') THEN
    RAISE EXCEPTION 'Invalid keyword_difficulty: %. Must be easy, medium, or hard.', NEW.keyword_difficulty;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_keyword_difficulty
  BEFORE INSERT OR UPDATE ON public.generated_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_keyword_difficulty();

-- Create widget_config table
CREATE TABLE public.widget_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_slug TEXT UNIQUE NOT NULL,
  widget_zone TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}'::jsonb,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Validation trigger for widget_zone
CREATE OR REPLACE FUNCTION public.validate_widget_zone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.widget_zone NOT IN ('sidebar', 'page', 'footer') THEN
    RAISE EXCEPTION 'Invalid widget_zone: %. Must be sidebar, page, or footer.', NEW.widget_zone;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_widget_zone
  BEFORE INSERT OR UPDATE ON public.widget_config
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_widget_zone();

-- updated_at trigger
CREATE TRIGGER trg_widget_config_updated_at
  BEFORE UPDATE ON public.widget_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index
CREATE INDEX idx_widget_config_zone_enabled ON public.widget_config(widget_zone, is_enabled);

-- RLS
ALTER TABLE public.widget_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read widget_config"
  ON public.widget_config FOR SELECT TO public
  USING (true);

CREATE POLICY "Admins can insert widget_config"
  ON public.widget_config FOR INSERT TO authenticated
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update widget_config"
  ON public.widget_config FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete widget_config"
  ON public.widget_config FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));
