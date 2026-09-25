-- Required delivery observability and duplicate-send protection, without automation.
-- The older optional retry migration combines this schema with a scheduled job.
-- Sites that leave that job disabled still need these fields/RPCs for offers-api.
-- This forward migration is additive/idempotent, preserves any existing schedule,
-- sends no email, and does not claim or requeue a delivery.
-- Keep the legacy attempted-payload quarantine: unknown past sends stay uncertain.

ALTER TABLE public.offer_access_deliveries
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS uncertain_since timestamptz,
  ADD COLUMN IF NOT EXISTS last_provider_status smallint
    CHECK (last_provider_status IS NULL OR last_provider_status BETWEEN 100 AND 599),
  ADD COLUMN IF NOT EXISTS last_error_detail text
    CHECK (last_error_detail IS NULL OR length(last_error_detail) <= 600);

ALTER TABLE public.offer_access_deliveries
  DROP CONSTRAINT IF EXISTS offer_access_deliveries_status_check;
ALTER TABLE public.offer_access_deliveries
  ADD CONSTRAINT offer_access_deliveries_status_check
  CHECK (status IN ('pending','sending','sent','needs_review','failed'));

-- Attempts made before this migration did not record the provider response, so
-- any frozen, attempted delivery might have been accepted. Treat it as uncertain
-- from its first attempt. Rows touched by the new code (last_attempt_at set) are
-- never re-marked.
UPDATE public.offer_access_deliveries
SET uncertain_since = coalesce(first_attempt_at, created_at),
    last_error_detail = coalesce(last_error_detail,
      'Earlier attempts ran before provider responses were recorded, so it is unknown whether Resend accepted them.')
WHERE status IN ('pending','sending') AND attempts > 0 AND payload_cipher IS NOT NULL
  AND uncertain_since IS NULL AND last_attempt_at IS NULL;

CREATE OR REPLACE FUNCTION public.offer_claim_access_delivery(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item offer_access_deliveries%ROWTYPE; unsure timestamptz; note text;
BEGIN
  SELECT * INTO item FROM offer_access_deliveries WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR item.status IN ('sent','needs_review','failed') OR item.next_attempt_at>now()
     OR (item.lease_until IS NOT NULL AND item.lease_until>now()) THEN RETURN NULL; END IF;
  unsure:=item.uncertain_since; note:=item.last_error_detail;
  -- A lapsed lease with a frozen payload may have reached the provider before
  -- its worker stopped. Without a frozen payload the provider was never called.
  IF item.status='sending' AND item.payload_cipher IS NOT NULL THEN
    unsure:=coalesce(unsure,item.last_attempt_at,item.first_attempt_at,now());
    note:='The previous attempt stopped before its result was saved, so Resend may have accepted it.';
  END IF;
  IF unsure IS NOT NULL AND unsure<now()-interval '20 hours' THEN
    UPDATE offer_access_deliveries SET status='needs_review',last_error='retry_window_closed',
      last_error_detail=left('Automatic retries stopped: an earlier attempt may have reached Resend, and resending after its 24-hour duplicate protection could email the customer twice. Check the Resend log before requeueing.'||coalesce(' Last result: '||note,''),600),
      uncertain_since=unsure,lease_id=NULL,lease_until=NULL WHERE id=_id;
    RETURN NULL;
  END IF;
  IF item.attempts>=10 THEN
    UPDATE offer_access_deliveries SET status=CASE WHEN unsure IS NULL THEN 'failed' ELSE 'needs_review' END,
      last_error='max_attempts_reached',
      last_error_detail=left('Gave up after 10 attempts.'||coalesce(' Last result: '||note,''),600),
      uncertain_since=unsure,lease_id=NULL,lease_until=NULL WHERE id=_id;
    RETURN NULL;
  END IF;
  UPDATE offer_access_deliveries SET status='sending',lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',
    attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),last_attempt_at=now(),
    uncertain_since=unsure,last_error_detail=note
  WHERE id=_id RETURNING * INTO item;
  RETURN to_jsonb(item);
END $$;

-- Records one attempt. _outcome: sent | not_sent (provider never accepted) |
-- uncertain (provider may have accepted) | blocked (never retry automatically).
-- Returns the resulting status, or NULL when the lease is no longer held.
CREATE OR REPLACE FUNCTION public.offer_record_access_attempt(
  _id uuid,_lease_id uuid,_outcome text,_provider_id text DEFAULT NULL,_error text DEFAULT NULL,
  _provider_status integer DEFAULT NULL,_error_detail text DEFAULT NULL,_retry_after_seconds integer DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item offer_access_deliveries%ROWTYPE; unsure timestamptz; next_status text; code text; detail text;
BEGIN
  IF _outcome IS NULL OR _outcome NOT IN ('sent','not_sent','uncertain','blocked') THEN RAISE EXCEPTION 'Invalid delivery outcome'; END IF;
  IF (_outcome='sent') IS DISTINCT FROM (_provider_id IS NOT NULL)
     OR (_provider_id IS NOT NULL AND length(_provider_id) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'Invalid receipt'; END IF;
  IF _provider_status IS NOT NULL AND _provider_status NOT BETWEEN 100 AND 599 THEN RAISE EXCEPTION 'Invalid provider status'; END IF;
  SELECT * INTO item FROM offer_access_deliveries WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR item.lease_id IS DISTINCT FROM _lease_id OR item.status<>'sending' THEN RETURN NULL; END IF;
  unsure:=CASE WHEN _outcome='uncertain' THEN coalesce(item.uncertain_since,item.last_attempt_at,now()) ELSE item.uncertain_since END;
  detail:=nullif(btrim(regexp_replace(coalesce(_error_detail,''),'[[:cntrl:]]+',' ','g')),'');
  code:=left(coalesce(_error,'provider_unavailable'),80);
  next_status:=CASE
    WHEN _outcome='sent' THEN 'sent'
    WHEN _outcome='blocked' THEN 'needs_review'
    WHEN item.attempts>=10 THEN CASE WHEN unsure IS NULL THEN 'failed' ELSE 'needs_review' END
    WHEN unsure IS NOT NULL AND unsure<now()-interval '20 hours' THEN 'needs_review'
    ELSE 'pending' END;
  IF _outcome IN ('not_sent','uncertain') AND next_status<>'pending' THEN
    IF item.attempts>=10 THEN
      code:='max_attempts_reached';
      detail:=CASE WHEN unsure IS NULL THEN 'Gave up after 10 attempts; Resend never accepted this email.'
        ELSE 'Gave up after 10 attempts. An earlier attempt may have reached Resend; check the Resend log before requeueing.' END
        ||coalesce(' Last result: '||detail,'');
    ELSE
      code:='retry_window_closed';
      detail:='Automatic retries stopped: an earlier attempt may have reached Resend, and resending after its 24-hour duplicate protection could email the customer twice. Check the Resend log before requeueing.'
        ||coalesce(' Last result: '||detail,'');
    END IF;
  END IF;
  UPDATE offer_access_deliveries SET status=next_status,
    provider_id=_provider_id,sent_at=CASE WHEN next_status='sent' THEN now() ELSE NULL END,
    last_error=CASE WHEN next_status='sent' THEN NULL ELSE code END,
    last_error_detail=CASE WHEN next_status='sent' THEN NULL ELSE left(detail,600) END,
    last_provider_status=_provider_status,uncertain_since=unsure,lease_id=NULL,lease_until=NULL,
    next_attempt_at=now()+make_interval(secs=>least(greatest(coalesce(_retry_after_seconds,300),60),21600))
  WHERE id=_id;
  RETURN next_status;
END $$;

-- Compatibility for an offers-api still deployed from before this migration.
-- Its failures could not tell rejection from uncertainty, so treat as uncertain.
CREATE OR REPLACE FUNCTION public.offer_finish_access_delivery(_id uuid,_lease_id uuid,_provider_id text DEFAULT NULL,_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  RETURN offer_record_access_attempt(_id,_lease_id,
    CASE WHEN _provider_id IS NOT NULL THEN 'sent'
         WHEN _error IN ('recipient_suppressed','delivery_envelope_unavailable') THEN 'blocked'
         ELSE 'uncertain' END,
    _provider_id,_error,NULL,
    CASE WHEN _provider_id IS NULL THEN 'Recorded by an older function version that did not capture the provider response.' END,
    60) IS NOT NULL;
END $$;

-- Admin-only (through offers-api) after review: returns a stopped delivery that
-- was never accepted to the queue with the same frozen message and idempotency
-- key. Blocked recipients and unreadable messages cannot be requeued.
CREATE OR REPLACE FUNCTION public.offer_requeue_access_delivery(_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE offer_access_deliveries SET status='pending',attempts=0,first_attempt_at=NULL,last_attempt_at=NULL,
    uncertain_since=NULL,next_attempt_at=now(),lease_id=NULL,lease_until=NULL,last_error='requeued',
    last_error_detail=left('Requeued by an administrator. Previous result: '||coalesce(last_error_detail,last_error,'unknown'),600)
  WHERE id=_id AND status IN ('failed','needs_review') AND provider_id IS NULL AND length(email)<=254
    AND coalesce(last_error,'') NOT IN ('recipient_suppressed','legacy_recipient_too_long','delivery_envelope_unavailable');
  IF NOT FOUND THEN RETURN false; END IF;
  -- The frozen email promises 30 days from when it arrives.
  UPDATE offer_access_grants SET expires_at=greatest(expires_at,now()+interval '30 days') WHERE delivery_id=_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.offer_claim_access_delivery(uuid),
  public.offer_record_access_attempt(uuid,uuid,text,text,text,integer,text,integer),
  public.offer_finish_access_delivery(uuid,uuid,text,text),
  public.offer_requeue_access_delivery(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.offer_claim_access_delivery(uuid),
  public.offer_record_access_attempt(uuid,uuid,text,text,text,integer,text,integer),
  public.offer_finish_access_delivery(uuid,uuid,text,text),
  public.offer_requeue_access_delivery(uuid) TO service_role;

