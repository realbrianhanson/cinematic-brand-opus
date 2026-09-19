-- Generation provenance and visual concepts are retained for editorial review
-- and diversity checks. No new anonymous column grants are introduced.
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS editorial_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
