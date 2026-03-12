ALTER TABLE public.site_settings 
ADD COLUMN IF NOT EXISTS report_email text DEFAULT '',
ADD COLUMN IF NOT EXISTS report_enabled boolean DEFAULT false;