-- Add human_edited flag to generated_pages so refresh-stale-content skips edited pages
ALTER TABLE public.generated_pages
ADD COLUMN IF NOT EXISTS human_edited boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_generated_pages_human_edited
ON public.generated_pages(human_edited) WHERE human_edited = true;