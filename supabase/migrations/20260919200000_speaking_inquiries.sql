-- Private inbound leads. New member installations opt in after configuring the site.
ALTER TABLE public.site_settings_private
  ADD COLUMN speaking_inquiries_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.speaking_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(btrim(email)) AND email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'),
  event_name text NOT NULL CHECK (length(btrim(event_name)) BETWEEN 1 AND 160),
  event_date text NOT NULL DEFAULT '' CHECK (length(event_date) <= 100),
  event_format text NOT NULL DEFAULT 'undecided' CHECK (event_format IN ('in_person','virtual','undecided')),
  audience text NOT NULL DEFAULT '' CHECK (length(audience) <= 300),
  message text NOT NULL DEFAULT '' CHECK (length(message) <= 3000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed','spam')),
  admin_notes text NOT NULL DEFAULT '' CHECK (length(admin_notes) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.speaking_inquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.speaking_inquiries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.speaking_inquiries TO service_role;
GRANT SELECT ON public.speaking_inquiries TO authenticated;
GRANT UPDATE(status, admin_notes) ON public.speaking_inquiries TO authenticated;
CREATE POLICY speaking_inquiries_admin_read ON public.speaking_inquiries
  FOR SELECT TO authenticated USING (public.is_admin((SELECT auth.uid())));
CREATE POLICY speaking_inquiries_admin_update ON public.speaking_inquiries
  FOR UPDATE TO authenticated USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE INDEX speaking_inquiries_status_created_idx ON public.speaking_inquiries(status, created_at DESC, id DESC);
CREATE INDEX speaking_inquiries_created_idx ON public.speaking_inquiries(created_at DESC, id DESC);
CREATE TRIGGER speaking_inquiries_updated_at BEFORE UPDATE ON public.speaking_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.submit_speaking_inquiry(
  _request_id uuid, _payload_hash text, _name text, _email text,
  _event_name text, _event_date text, _event_format text, _audience text, _message text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prior_hash text;
BEGIN
  -- Serialize retries, including two deliveries arriving at the same time.
  PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text, 9192026));
  SELECT payload_hash INTO prior_hash FROM public.speaking_inquiries WHERE request_id = _request_id;
  IF FOUND THEN
    IF prior_hash IS DISTINCT FROM _payload_hash THEN
      RAISE EXCEPTION 'speaking_request_mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN true;
  END IF;
  IF NOT coalesce((SELECT speaking_inquiries_enabled FROM public.site_settings_private ORDER BY id LIMIT 1), false) THEN
    RAISE EXCEPTION 'speaking_inquiries_disabled' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.speaking_inquiries(request_id,payload_hash,name,email,event_name,event_date,event_format,audience,message)
  VALUES(_request_id,_payload_hash,_name,_email,_event_name,_event_date,_event_format,_audience,_message);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_speaking_inquiry(uuid,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_speaking_inquiry(uuid,text,text,text,text,text,text,text,text) TO service_role;
