-- Jev shadow-mode pilot: stores what TypeSafe's Jev model WOULD decide about
-- recent news items and article ideas. Nothing in the pipeline reads this
-- table, so it cannot change drafting or publishing. See docs/JEV_PILOT.md.
CREATE TABLE IF NOT EXISTS public.jev_shadow_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('source_item', 'opportunity')),
  subject_id uuid NOT NULL,
  model text NOT NULL,
  questions_version text NOT NULL,
  relevant_prob numeric CHECK (relevant_prob IS NULL OR relevant_prob BETWEEN 0 AND 1),
  duplicate_prob numeric CHECK (duplicate_prob IS NULL OR duplicate_prob BETWEEN 0 AND 1),
  substance_prob numeric CHECK (substance_prob IS NULL OR substance_prob BETWEEN 0 AND 1),
  audience_fit_score numeric CHECK (audience_fit_score IS NULL OR audience_fit_score BETWEEN 0 AND 100),
  verdict text CHECK (verdict IS NULL OR verdict IN ('pursue', 'skip')),
  raw jsonb,
  latency_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, questions_version)
);

CREATE INDEX IF NOT EXISTS jev_shadow_scores_created_idx
  ON public.jev_shadow_scores (created_at DESC);

ALTER TABLE public.jev_shadow_scores ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.jev_shadow_scores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.jev_shadow_scores TO authenticated;
GRANT ALL ON public.jev_shadow_scores TO service_role;

DROP POLICY IF EXISTS "Admins read jev_shadow_scores" ON public.jev_shadow_scores;
CREATE POLICY "Admins read jev_shadow_scores" ON public.jev_shadow_scores
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
