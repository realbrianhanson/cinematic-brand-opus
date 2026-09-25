-- One immutable order per parent; retries are numbered provider sessions, never new purchases.
ALTER TABLE public.offer_orders
  ADD COLUMN checkout_attempt integer NOT NULL DEFAULT 1 CHECK(checkout_attempt BETWEEN 1 AND 4),
  ADD COLUMN checkout_retry_token_hash text CHECK(checkout_retry_token_hash IS NULL OR checkout_retry_token_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN checkout_retry_origin text;
CREATE TABLE public.offer_checkout_attempts (
  order_id uuid NOT NULL REFERENCES public.offer_orders(id) ON DELETE RESTRICT,
  attempt integer NOT NULL CHECK(attempt BETWEEN 1 AND 4),
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  checkout_expires_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  unpaid_verified_at timestamptz,
  PRIMARY KEY(order_id,attempt)
);
ALTER TABLE public.offer_checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offer_checkout_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.offer_checkout_attempts TO service_role;
GRANT SELECT ON public.offer_checkout_attempts TO authenticated;
CREATE POLICY offer_checkout_attempts_admin_read ON public.offer_checkout_attempts FOR SELECT TO authenticated USING(public.is_admin(auth.uid()));
INSERT INTO public.offer_checkout_attempts(order_id,attempt,stripe_session_id,stripe_payment_intent_id,checkout_expires_at)
SELECT id,1,stripe_session_id,stripe_payment_intent_id,checkout_expires_at FROM public.offer_orders WHERE stripe_session_id IS NOT NULL;

-- Keep the established monetary validation behind attempt-aware wrappers.
ALTER FUNCTION public.offer_record_checkout(uuid,text,text,text) RENAME TO _offer_record_checkout_v1;
ALTER FUNCTION public.offer_apply_stripe_event(text,text,text,uuid,text,integer,text) RENAME TO _offer_apply_stripe_event_v1;
REVOKE ALL ON FUNCTION public._offer_record_checkout_v1(uuid,text,text,text),public._offer_apply_stripe_event_v1(text,text,text,uuid,text,integer,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.offer_record_checkout(_order_id uuid,_session_id text,_checkout_url text,_payment_intent_id text DEFAULT NULL,_checkout_attempt integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.offer_orders%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO item FROM public.offer_orders WHERE id=_order_id FOR UPDATE;
  IF NOT FOUND OR item.checkout_attempt IS DISTINCT FROM _checkout_attempt THEN RAISE EXCEPTION 'Checkout attempt is no longer current'; END IF;
  result := public._offer_record_checkout_v1(_order_id,_session_id,_checkout_url,_payment_intent_id);
  INSERT INTO public.offer_checkout_attempts(order_id,attempt,stripe_session_id,stripe_payment_intent_id,checkout_expires_at)
  VALUES(item.id,item.checkout_attempt,_session_id,_payment_intent_id,item.checkout_expires_at)
  ON CONFLICT(order_id,attempt) DO UPDATE SET stripe_session_id=coalesce(offer_checkout_attempts.stripe_session_id,EXCLUDED.stripe_session_id),stripe_payment_intent_id=coalesce(offer_checkout_attempts.stripe_payment_intent_id,EXCLUDED.stripe_payment_intent_id);
  RETURN result;
END $$;

CREATE FUNCTION public.offer_prepare_checkout_retry(_order_id uuid,_session_id text,_checkout_attempt integer,_payment_intent_id text,_token_hash text,_origin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.offer_orders%ROWTYPE; parent public.offer_orders%ROWTYPE; parent_id uuid; retry_time timestamptz; expiry timestamptz;
BEGIN
  IF _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' OR _origin IS NULL OR _origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$' OR length(_origin)>2048 THEN RAISE EXCEPTION 'Invalid checkout recovery request'; END IF;
  SELECT parent_order_id INTO parent_id FROM public.offer_orders WHERE id=_order_id;
  -- Match initial reservation lock order: parent, then child.
  SELECT * INTO parent FROM public.offer_orders WHERE id=parent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This checkout is not a follow-up offer'; END IF;
  SELECT * INTO item FROM public.offer_orders WHERE id=_order_id FOR UPDATE;
  retry_time := clock_timestamp();
  IF parent.status<>'fulfilled' OR parent.declined_at IS NOT NULL OR (parent.next_offer_deadline IS NOT NULL AND parent.next_offer_deadline<=retry_time) THEN RAISE EXCEPTION 'Parent purchase no longer allows this follow-up'; END IF;
  IF item.checkout_attempt=_checkout_attempt+1 AND item.status='pending' AND item.checkout_retry_token_hash=_token_hash AND item.checkout_expires_at>retry_time THEN
    RETURN to_jsonb(item); -- Concurrent or lost-response replay keeps the same attempt.
  END IF;
  IF item.checkout_attempt IS DISTINCT FROM _checkout_attempt OR item.stripe_session_id IS DISTINCT FROM _session_id OR _session_id IS NULL THEN RAISE EXCEPTION 'Checkout changed; refresh its status'; END IF;
  IF item.status NOT IN ('pending','expired','failed') OR item.amount_minor<=0 OR item.checkout_attempt>=4 THEN RAISE EXCEPTION 'Checkout cannot be restarted'; END IF;
  IF item.stripe_payment_intent_id IS NOT NULL AND item.stripe_payment_intent_id IS DISTINCT FROM _payment_intent_id THEN RAISE EXCEPTION 'Checkout payment identity changed'; END IF;
  IF parent.status<>'fulfilled' OR parent.declined_at IS NOT NULL THEN RAISE EXCEPTION 'Parent purchase no longer allows this follow-up'; END IF;
  expiry := least(retry_time+interval '60 minutes',coalesce(parent.next_offer_deadline,'infinity'::timestamptz));
  IF expiry<=retry_time+interval '31 minutes' THEN RAISE EXCEPTION 'Original follow-up offer deadline does not allow another checkout'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='offer-files' AND name=item.asset_path_snapshot) THEN RAISE EXCEPTION 'Original offer file is unavailable'; END IF;
  -- The service adapter invokes this only after a fresh provider read proves expired/unpaid,
  -- with no intent or a canceled intent. Browser inputs cannot call this RPC.
  INSERT INTO public.offer_checkout_attempts(order_id,attempt,stripe_session_id,stripe_payment_intent_id,checkout_expires_at,retired_at,unpaid_verified_at)
  VALUES(item.id,item.checkout_attempt,item.stripe_session_id,_payment_intent_id,item.checkout_expires_at,retry_time,retry_time)
  ON CONFLICT(order_id,attempt) DO UPDATE SET stripe_payment_intent_id=coalesce(offer_checkout_attempts.stripe_payment_intent_id,EXCLUDED.stripe_payment_intent_id),retired_at=EXCLUDED.retired_at,unpaid_verified_at=EXCLUDED.unpaid_verified_at;
  UPDATE public.offer_orders SET status='pending',checkout_attempt=checkout_attempt+1,stripe_session_id=NULL,stripe_payment_intent_id=NULL,stripe_checkout_url=NULL,checkout_expires_at=expiry,checkout_retry_token_hash=_token_hash,checkout_retry_origin=_origin WHERE id=item.id RETURNING * INTO item;
  INSERT INTO public.offer_checkout_attempts(order_id,attempt,checkout_expires_at) VALUES(item.id,item.checkout_attempt,item.checkout_expires_at);
  RETURN to_jsonb(item);
END $$;

CREATE FUNCTION public.offer_apply_stripe_event(_event_id text,_event_type text,_session_id text,_order_id uuid,_payment_intent_id text,_amount_minor integer,_currency text,_checkout_attempt integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.offer_orders%ROWTYPE; historic public.offer_checkout_attempts%ROWTYPE; result jsonb;
BEGIN
  IF _event_id IS NULL OR length(_event_id)>255 OR _event_id !~ '^evt_[a-zA-Z0-9_]+$' THEN RAISE EXCEPTION 'Invalid Stripe event'; END IF;
  IF _event_type IS NULL OR _event_type NOT IN ('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded') THEN RAISE EXCEPTION 'Unsupported Stripe event'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_event_id,671149922));
  IF EXISTS(SELECT 1 FROM public.offer_stripe_events WHERE event_id=_event_id) THEN RETURN jsonb_build_object('duplicate',true); END IF;
  IF _event_type='charge.refunded' THEN
    SELECT * INTO historic FROM public.offer_checkout_attempts WHERE stripe_payment_intent_id=_payment_intent_id;
    IF FOUND AND historic.retired_at IS NOT NULL THEN
      -- A refund from a prior, explicitly retired attempt cannot revoke the current purchase.
      INSERT INTO public.offer_stripe_events(event_id,event_type) VALUES(_event_id,_event_type);
      RETURN jsonb_build_object('duplicate',false,'ignored',true,'reason','retired_checkout');
    END IF;
  ELSE
    SELECT * INTO item FROM public.offer_orders WHERE id=_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown order'; END IF;
    IF item.checkout_attempt IS DISTINCT FROM _checkout_attempt THEN
      SELECT * INTO historic FROM public.offer_checkout_attempts WHERE order_id=item.id AND attempt=_checkout_attempt AND stripe_session_id=_session_id AND retired_at IS NOT NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'Stripe event does not match checkout attempt'; END IF;
      IF _event_type NOT IN ('checkout.session.expired','checkout.session.async_payment_failed') THEN RAISE EXCEPTION 'Payment for a retired checkout requires review'; END IF;
      IF historic.stripe_payment_intent_id IS NOT NULL AND _payment_intent_id IS NOT NULL AND historic.stripe_payment_intent_id<>_payment_intent_id THEN RAISE EXCEPTION 'Stripe event does not match retired payment'; END IF;
      INSERT INTO public.offer_stripe_events(event_id,event_type) VALUES(_event_id,_event_type);
      RETURN jsonb_build_object('duplicate',false,'ignored',true,'reason','retired_checkout');
    END IF;
  END IF;
  result := public._offer_apply_stripe_event_v1(_event_id,_event_type,_session_id,_order_id,_payment_intent_id,_amount_minor,_currency);
  IF _event_type<>'charge.refunded' THEN
    INSERT INTO public.offer_checkout_attempts(order_id,attempt,stripe_session_id,stripe_payment_intent_id,checkout_expires_at)
    VALUES(item.id,item.checkout_attempt,_session_id,_payment_intent_id,item.checkout_expires_at)
    ON CONFLICT(order_id,attempt) DO UPDATE SET stripe_session_id=coalesce(offer_checkout_attempts.stripe_session_id,EXCLUDED.stripe_session_id),stripe_payment_intent_id=coalesce(offer_checkout_attempts.stripe_payment_intent_id,EXCLUDED.stripe_payment_intent_id);
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.offer_record_checkout(uuid,text,text,text,integer),public.offer_prepare_checkout_retry(uuid,text,integer,text,text,text),public.offer_apply_stripe_event(text,text,text,uuid,text,integer,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.offer_record_checkout(uuid,text,text,text,integer),public.offer_prepare_checkout_retry(uuid,text,integer,text,text,text),public.offer_apply_stripe_event(text,text,text,uuid,text,integer,text,integer) TO service_role;
