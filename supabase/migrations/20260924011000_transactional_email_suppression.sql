-- Delivery protection is separate from marketing subscription/consent.
CREATE TABLE public.transactional_email_suppressions (
  email text PRIMARY KEY CHECK (length(email) BETWEEN 3 AND 254 AND email=lower(btrim(email)) AND email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'),
  reason text NOT NULL CHECK (reason IN ('bounced','complained')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.transactional_email_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transactional_email_suppressions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.transactional_email_suppressions TO service_role;

CREATE FUNCTION public.record_transactional_email_suppression(_email text,_reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE normalized text:=lower(btrim(_email));
BEGIN
  IF _reason NOT IN ('bounced','complained') THEN RAISE EXCEPTION 'invalid suppression reason'; END IF;
  INSERT INTO public.transactional_email_suppressions(email,reason) VALUES(normalized,_reason)
    ON CONFLICT(email) DO UPDATE SET
      reason=CASE WHEN transactional_email_suppressions.reason='complained' THEN 'complained' ELSE EXCLUDED.reason END,
      updated_at=now();
  -- An existing subscription is suppressed too; this never creates a subscription.
  UPDATE public.newsletter_subscribers SET status=CASE WHEN status='complained' THEN 'complained' ELSE _reason END WHERE email=normalized;
  RETURN true;
END $$;

CREATE FUNCTION public.transactional_email_is_suppressed(_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.transactional_email_suppressions WHERE email=lower(btrim(_email)))
    OR EXISTS(SELECT 1 FROM public.newsletter_subscribers WHERE email=lower(btrim(_email)) AND status IN ('bounced','complained'));
$$;

REVOKE ALL ON FUNCTION public.record_transactional_email_suppression(text,text),public.transactional_email_is_suppressed(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_transactional_email_suppression(text,text),public.transactional_email_is_suppressed(text) TO service_role;

CREATE INDEX speaking_inquiry_email_idx ON public.speaking_inquiries(email);
CREATE OR REPLACE FUNCTION public.queue_speaking_notifications() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acknowledgement_allowed boolean;
BEGIN
  IF coalesce((SELECT speaking_notifications_enabled FROM public.site_settings_private ORDER BY id LIMIT 1),false) THEN
    -- Serialize different inquiry IDs for the same address. Intake and owner
    -- notifications still succeed when an acknowledgement is on cooldown.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.email,24092026));
    acknowledgement_allowed := NOT public.transactional_email_is_suppressed(NEW.email)
      AND NOT EXISTS(SELECT 1 FROM public.speaking_notification_deliveries d
        JOIN public.speaking_inquiries i ON i.id=d.inquiry_id
        WHERE i.email=NEW.email AND d.kind='acknowledgement' AND d.status<>'cancelled'
          AND d.created_at>now()-interval '24 hours');
    INSERT INTO public.speaking_notification_deliveries(inquiry_id,kind,next_attempt_at)
      VALUES(NEW.id,'owner',now()),(NEW.id,'reminder',now()+interval '48 hours')
      ON CONFLICT(inquiry_id,kind) DO NOTHING;
    INSERT INTO public.speaking_notification_deliveries(inquiry_id,kind,status,last_error)
      VALUES(NEW.id,'acknowledgement',CASE WHEN acknowledgement_allowed THEN 'pending' ELSE 'cancelled' END,
        CASE WHEN acknowledgement_allowed THEN NULL ELSE 'Acknowledgement not queued: this address is suppressed or already received a queued acknowledgement in the last 24 hours.' END)
      ON CONFLICT(inquiry_id,kind) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
