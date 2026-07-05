
ALTER TABLE public.niches ADD COLUMN IF NOT EXISTS expert_pov text;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS default_expert_pov text;
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS image_generation_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS serp_snapshot jsonb;

CREATE TABLE IF NOT EXISTS public.gsc_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_url text NOT NULL,
  query text NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  position numeric NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gsc_performance_page_idx ON public.gsc_performance(page_url);
CREATE INDEX IF NOT EXISTS gsc_performance_period_idx ON public.gsc_performance(period_end DESC);

GRANT SELECT ON public.gsc_performance TO authenticated;
GRANT ALL ON public.gsc_performance TO service_role;
ALTER TABLE public.gsc_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view gsc_performance" ON public.gsc_performance
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Service role manages gsc_performance" ON public.gsc_performance
  FOR ALL TO service_role USING (true) WITH CHECK (true);
