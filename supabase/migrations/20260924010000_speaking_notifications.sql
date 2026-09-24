-- Transactional speaking mail is opt-in and does not enroll contacts in marketing.
ALTER TABLE public.site_settings_private
  ADD COLUMN speaking_notifications_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN speaking_notification_email text NOT NULL DEFAULT ''
    CHECK (speaking_notification_email = '' OR (length(speaking_notification_email) <= 254 AND speaking_notification_email ~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'));

CREATE TABLE public.speaking_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.speaking_inquiries(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('owner','acknowledgement','reminder')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','needs_review','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  lease_id uuid,
  lease_until timestamptz,
  payload jsonb,
  provider_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(inquiry_id, kind)
);
ALTER TABLE public.speaking_notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.speaking_notification_deliveries FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.speaking_notification_deliveries TO service_role;
GRANT SELECT(id,inquiry_id,kind,status,attempts,next_attempt_at,last_attempt_at,sent_at,last_error,created_at) ON public.speaking_notification_deliveries TO authenticated;
CREATE POLICY speaking_delivery_admin_read ON public.speaking_notification_deliveries
  FOR SELECT TO authenticated USING (public.is_admin((SELECT auth.uid())));
CREATE INDEX speaking_delivery_due_idx ON public.speaking_notification_deliveries(next_attempt_at) WHERE status IN ('pending','sending');

CREATE FUNCTION public.queue_speaking_notifications() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce((SELECT speaking_notifications_enabled FROM public.site_settings_private ORDER BY id LIMIT 1),false) THEN
    INSERT INTO public.speaking_notification_deliveries(inquiry_id,kind,next_attempt_at)
    VALUES(NEW.id,'owner',now()),(NEW.id,'acknowledgement',now()),(NEW.id,'reminder',now()+interval '48 hours')
    ON CONFLICT(inquiry_id,kind) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER speaking_inquiry_queue AFTER INSERT ON public.speaking_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.queue_speaking_notifications();

CREATE FUNCTION public.claim_speaking_notification(_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE delivery public.speaking_notification_deliveries; inquiry public.speaking_inquiries;
BEGIN
  IF NOT coalesce((SELECT speaking_notifications_enabled FROM public.site_settings_private ORDER BY id LIMIT 1),false) THEN RETURN NULL; END IF;
  SELECT * INTO delivery FROM public.speaking_notification_deliveries WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR delivery.status NOT IN ('pending','sending') OR delivery.next_attempt_at>now()
    OR (delivery.lease_until IS NOT NULL AND delivery.lease_until>now()) THEN RETURN NULL; END IF;
  SELECT * INTO inquiry FROM public.speaking_inquiries WHERE id=delivery.inquiry_id;
  IF inquiry.status='spam' OR (delivery.kind='reminder' AND inquiry.status<>'new') THEN
    UPDATE public.speaking_notification_deliveries SET status='cancelled',lease_id=NULL,lease_until=NULL,last_error=NULL WHERE id=_id;
    RETURN NULL;
  END IF;
  -- Never retry beyond the provider's 24-hour idempotency window, including
  -- a crashed worker whose receipt was not committed. Stop for manual review.
  IF delivery.first_attempt_at IS NOT NULL AND delivery.first_attempt_at < now()-interval '23 hours' THEN
    UPDATE public.speaking_notification_deliveries SET status='needs_review',lease_id=NULL,lease_until=NULL,
      last_error='Automatic retries stopped. Verify delivery in Resend before contacting the recipient manually.' WHERE id=_id;
    RETURN NULL;
  END IF;
  UPDATE public.speaking_notification_deliveries SET status='sending',attempts=attempts+1,
    first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now(),lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    WHERE id=_id RETURNING * INTO delivery;
  RETURN jsonb_build_object('id',delivery.id,'kind',delivery.kind,'lease_id',delivery.lease_id,
    'attempts',delivery.attempts,'payload',delivery.payload,'inquiry',jsonb_build_object(
      'name',inquiry.name,'email',inquiry.email,'event_name',inquiry.event_name,
      'event_date',inquiry.event_date,'event_format',inquiry.event_format,'audience',inquiry.audience,'message',inquiry.message));
END $$;

CREATE FUNCTION public.freeze_speaking_notification(_id uuid,_lease_id uuid,_payload jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.speaking_notification_deliveries SET payload=coalesce(payload,_payload)
    WHERE id=_id AND status='sending' AND lease_id=_lease_id AND lease_until>now();
  RETURN FOUND;
END $$;

CREATE FUNCTION public.record_speaking_notification(_id uuid,_lease_id uuid,_outcome text,_provider_id text,_error text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE delivery public.speaking_notification_deliveries;
BEGIN
  IF _outcome NOT IN ('sent','not_sent','uncertain','blocked') THEN RAISE EXCEPTION 'invalid outcome'; END IF;
  IF _outcome='sent' AND nullif(_provider_id,'') IS NULL THEN RAISE EXCEPTION 'missing receipt'; END IF;
  SELECT * INTO delivery FROM public.speaking_notification_deliveries WHERE id=_id AND status='sending' AND lease_id=_lease_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.speaking_notification_deliveries SET
    status=CASE WHEN _outcome='sent' THEN 'sent' WHEN _outcome='blocked' THEN 'failed'
      WHEN attempts>=6 THEN CASE WHEN _outcome='uncertain' THEN 'needs_review' ELSE 'failed' END ELSE 'pending' END,
    provider_id=CASE WHEN _outcome='sent' THEN left(_provider_id,200) ELSE provider_id END,
    sent_at=CASE WHEN _outcome='sent' THEN now() ELSE sent_at END,
    last_error=CASE WHEN _outcome='sent' THEN NULL ELSE left(_error,500) END,
    next_attempt_at=now()+make_interval(secs=>least(21600,300*power(2,least(attempts-1,10)))::integer),
    lease_id=NULL,lease_until=NULL WHERE id=_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.queue_speaking_notifications(),public.claim_speaking_notification(uuid),
  public.freeze_speaking_notification(uuid,uuid,jsonb),public.record_speaking_notification(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_speaking_notification(uuid),public.freeze_speaking_notification(uuid,uuid,jsonb),
  public.record_speaking_notification(uuid,uuid,text,text,text) TO service_role;

-- Scheduling is an explicit deployment step in setup/speaking-notifications-cron.sql.
-- A portable migration must never forward a member project's cron secret to
-- the original site's function URL. The mail setting stays disabled by default.
