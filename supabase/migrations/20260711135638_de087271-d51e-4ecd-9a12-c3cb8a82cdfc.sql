
ALTER TABLE public.content_opportunities
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_opps_status_created ON public.content_opportunities(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_items_status_fetched ON public.source_items(status, fetched_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.content_opportunities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.source_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
