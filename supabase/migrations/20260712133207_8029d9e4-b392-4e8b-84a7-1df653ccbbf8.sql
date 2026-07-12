ALTER TABLE public.source_items
  ADD COLUMN IF NOT EXISTS full_content TEXT,
  ADD COLUMN IF NOT EXISTS full_content_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_title TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT;