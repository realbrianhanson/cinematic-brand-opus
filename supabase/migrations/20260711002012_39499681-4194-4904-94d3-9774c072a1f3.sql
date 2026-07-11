
-- Enable pgvector for originality/dedup embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. content_sources
CREATE TABLE public.content_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL, -- 'rss' | 'perplexity_topic' | 'manual'
  url TEXT,
  topic_lane TEXT NOT NULL, -- 'ai_tools' | 'smb_marketing' | 'ai_training' | 'industry'
  active BOOLEAN NOT NULL DEFAULT TRUE,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  last_polled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_sources TO authenticated;
GRANT ALL ON public.content_sources TO service_role;
ALTER TABLE public.content_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage content_sources" ON public.content_sources
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 2. source_items
CREATE TABLE public.source_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES public.content_sources(id) ON DELETE SET NULL,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  raw_excerpt TEXT,
  topic_lane TEXT,
  embedding vector(1536),
  status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'used' | 'skipped' | 'stale'
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX source_items_status_published_idx ON public.source_items (status, published_at DESC);
CREATE INDEX source_items_embedding_idx ON public.source_items
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_items TO authenticated;
GRANT ALL ON public.source_items TO service_role;
ALTER TABLE public.source_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage source_items" ON public.source_items
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 3. content_opportunities
CREATE TABLE public.content_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_item_ids UUID[] NOT NULL DEFAULT '{}',
  angle TEXT NOT NULL,
  target_keyword TEXT,
  topic_lane TEXT NOT NULL,
  opportunity_score INT NOT NULL DEFAULT 0,
  rationale TEXT,
  serp_snapshot JSONB,
  brief JSONB,
  gap_reason TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
    -- 'proposed' | 'drafting' | 'queued' | 'approved' | 'rejected' | 'published'
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX content_opportunities_status_idx ON public.content_opportunities (status, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_opportunities TO authenticated;
GRANT ALL ON public.content_opportunities TO service_role;
ALTER TABLE public.content_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage content_opportunities" ON public.content_opportunities
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 4. expert_notes ("Brian's Notes" inbox)
CREATE TABLE public.expert_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note TEXT NOT NULL,
  topic_hint TEXT, -- optional lane or freeform tag
  used_in_post_id UUID,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX expert_notes_fresh_idx ON public.expert_notes (archived, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expert_notes TO authenticated;
GRANT ALL ON public.expert_notes TO service_role;
ALTER TABLE public.expert_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage expert_notes" ON public.expert_notes
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 5. topic_performance (learning loop)
CREATE TABLE public.topic_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_lane TEXT NOT NULL,
  format TEXT, -- e.g. 'news_analysis', 'how_to', 'listicle'
  posts_count INT NOT NULL DEFAULT 0,
  avg_impressions NUMERIC NOT NULL DEFAULT 0,
  avg_clicks NUMERIC NOT NULL DEFAULT 0,
  avg_position NUMERIC,
  weight NUMERIC NOT NULL DEFAULT 1.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (topic_lane, format)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topic_performance TO authenticated;
GRANT ALL ON public.topic_performance TO service_role;
ALTER TABLE public.topic_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage topic_performance" ON public.topic_performance
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 6. Extend posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES public.content_opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_citations JSONB,
  ADD COLUMN IF NOT EXISTS originality_score INT,
  ADD COLUMN IF NOT EXISTS freshness_hours INT,
  ADD COLUMN IF NOT EXISTS performance_grade TEXT;

-- updated_at triggers
CREATE TRIGGER trg_content_sources_updated_at
  BEFORE UPDATE ON public.content_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_content_opportunities_updated_at
  BEFORE UPDATE ON public.content_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed a handful of curated RSS feeds (topic lanes preset)
INSERT INTO public.content_sources (name, kind, url, topic_lane, weight) VALUES
  ('OpenAI Blog', 'rss', 'https://openai.com/blog/rss.xml', 'ai_tools', 1.2),
  ('Google AI Blog', 'rss', 'https://blog.google/technology/ai/rss/', 'ai_tools', 1.1),
  ('Anthropic News', 'rss', 'https://www.anthropic.com/news/rss.xml', 'ai_tools', 1.1),
  ('The Verge — AI', 'rss', 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml', 'ai_tools', 1.0),
  ('TechCrunch — AI', 'rss', 'https://techcrunch.com/category/artificial-intelligence/feed/', 'ai_tools', 1.0),
  ('Ben''s Bites', 'rss', 'https://bensbites.beehiiv.com/feed', 'ai_tools', 0.9),
  ('MarketingProfs', 'rss', 'https://www.marketingprofs.com/rss/all-articles.xml', 'smb_marketing', 0.9),
  ('HubSpot Marketing Blog', 'rss', 'https://blog.hubspot.com/marketing/rss.xml', 'smb_marketing', 0.9),
  ('Search Engine Land — AI', 'rss', 'https://searchengineland.com/library/channel/ai/feed', 'smb_marketing', 1.0),
  ('Perplexity Daily — AI for SMBs', 'perplexity_topic', NULL, 'smb_marketing', 1.0),
  ('Perplexity Daily — AI tool launches', 'perplexity_topic', NULL, 'ai_tools', 1.1),
  ('Perplexity Daily — AI training & enablement', 'perplexity_topic', NULL, 'ai_training', 0.9);
