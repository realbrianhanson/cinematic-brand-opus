
CREATE TABLE public.admin_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  theme text NOT NULL DEFAULT 'dark',
  timezone text NOT NULL DEFAULT 'America/New_York',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own preferences"
ON public.admin_preferences FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own preferences"
ON public.admin_preferences FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences"
ON public.admin_preferences FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER update_admin_preferences_updated_at
  BEFORE UPDATE ON public.admin_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
