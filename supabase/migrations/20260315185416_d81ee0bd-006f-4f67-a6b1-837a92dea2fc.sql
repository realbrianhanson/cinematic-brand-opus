CREATE TABLE public.generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total_combinations integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary jsonb DEFAULT NULL,
  error_message text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read generation_jobs" ON public.generation_jobs FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert generation_jobs" ON public.generation_jobs FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update generation_jobs" ON public.generation_jobs FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete generation_jobs" ON public.generation_jobs FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- Service role needs to write from edge function
CREATE POLICY "Service role full access" ON public.generation_jobs FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_jobs;

-- Update trigger
CREATE TRIGGER update_generation_jobs_updated_at BEFORE UPDATE ON public.generation_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();