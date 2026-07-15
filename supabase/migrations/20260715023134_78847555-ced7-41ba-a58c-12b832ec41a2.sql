
-- 1. Deactivate all Jacksonville / local news sources
UPDATE public.content_sources
SET active = false
WHERE topic_lane = 'local_news';

-- 2. Activate all global AI + Marketing sources we already have
UPDATE public.content_sources
SET active = true
WHERE topic_lane IN ('ai_tools', 'smb_marketing', 'ai_training')
  AND kind = 'rss';

-- 3. Add Sales-focused global RSS sources
INSERT INTO public.content_sources (name, kind, url, topic_lane, active)
VALUES
  ('HubSpot Sales Blog', 'rss', 'https://blog.hubspot.com/sales/rss.xml', 'sales', true),
  ('Sales Hacker', 'rss', 'https://www.saleshacker.com/feed/', 'sales', true),
  ('Close Sales Blog', 'rss', 'https://blog.close.com/rss/', 'sales', true)
ON CONFLICT DO NOTHING;

-- 4. Archive any existing local_news items so the public feed only shows on-brand news
UPDATE public.source_items
SET status = 'archived'
WHERE topic_lane = 'local_news'
  AND status = 'published';
