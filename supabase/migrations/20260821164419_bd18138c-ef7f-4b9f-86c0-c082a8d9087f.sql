ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;

UPDATE public.posts
SET published_at = COALESCE(scheduled_at, created_at)
WHERE status = 'published' AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS posts_published_at_idx ON public.posts (published_at DESC);