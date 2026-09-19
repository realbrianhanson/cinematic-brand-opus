-- Private transactional access mail. Original order tokens and snapshots stay intact.
CREATE TABLE public.offer_access_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE CHECK(length(dedupe_key) <= 160),
  kind text NOT NULL CHECK(kind IN ('initial','recovery')),
  email text NOT NULL CHECK(length(email) BETWEEN 3 AND 320),
  order_ids uuid[] NOT NULL CHECK(cardinality(order_ids) BETWEEN 1 AND 20),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','needs_review')),
  payload_cipher text,
  lease_id uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX offer_access_delivery_pending_idx ON public.offer_access_deliveries(status,next_attempt_at);
CREATE INDEX offer_access_delivery_email_idx ON public.offer_access_deliveries(email,created_at DESC);
CREATE INDEX offer_orders_email_fulfilled_idx ON public.offer_orders(email,fulfilled_at DESC,id) WHERE status='fulfilled';
CREATE TABLE public.offer_access_grants (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[0-9a-f]{64}$'),
  order_id uuid NOT NULL REFERENCES public.offer_orders(id) ON DELETE RESTRICT,
  delivery_id uuid NOT NULL REFERENCES public.offer_access_deliveries(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  UNIQUE(delivery_id,order_id)
);
CREATE INDEX offer_access_grants_order_idx ON public.offer_access_grants(order_id);
ALTER TABLE public.offer_access_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offer_access_deliveries,public.offer_access_grants FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.offer_access_deliveries,public.offer_access_grants TO service_role;

CREATE OR REPLACE FUNCTION public.offer_prepare_access_delivery(_order_id uuid DEFAULT NULL,_email text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE recipient text; ids uuid[]; key text; existing_id uuid; result_id uuid;
BEGIN
  IF _order_id IS NOT NULL THEN
    SELECT email INTO recipient FROM offer_orders WHERE id=_order_id AND status='fulfilled';
    IF recipient IS NULL THEN RETURN NULL; END IF;
    ids:=ARRAY[_order_id]; key:='initial:'||_order_id;
  ELSE
    recipient:=lower(trim(_email));
    IF recipient IS NULL OR length(recipient)>254 OR recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('offer-recovery:'||recipient,0));
    SELECT id INTO existing_id FROM offer_access_deliveries WHERE kind='recovery' AND email=recipient AND created_at>now()-interval '1 hour' ORDER BY created_at DESC LIMIT 1;
    IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;
    SELECT array_agg(id ORDER BY fulfilled_at DESC,id) INTO ids FROM
      (SELECT id,fulfilled_at FROM offer_orders WHERE email=recipient AND status='fulfilled' ORDER BY fulfilled_at DESC,id LIMIT 20) items;
    IF ids IS NULL THEN RETURN NULL; END IF;
    key:='recovery:'||gen_random_uuid();
  END IF;
  INSERT INTO offer_access_deliveries(dedupe_key,kind,email,order_ids,status,last_error)
  VALUES(key,CASE WHEN _order_id IS NULL THEN 'recovery' ELSE 'initial' END,recipient,ids,
    CASE WHEN length(recipient)>254 THEN 'needs_review' ELSE 'pending' END,
    CASE WHEN length(recipient)>254 THEN 'legacy_recipient_too_long' ELSE NULL END)
  ON CONFLICT(dedupe_key) DO NOTHING RETURNING id INTO result_id;
  IF result_id IS NULL THEN SELECT id INTO result_id FROM offer_access_deliveries WHERE dedupe_key=key; END IF;
  RETURN result_id;
END $$;

-- Queue the initial message in the same transaction as fulfillment. No historical
-- rows are backfilled, and this trigger never calls the email provider.
CREATE OR REPLACE FUNCTION public.offer_enqueue_initial_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.status='fulfilled' THEN PERFORM offer_prepare_access_delivery(NEW.id,NULL); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER offer_enqueue_initial_access AFTER INSERT OR UPDATE OF status ON public.offer_orders
FOR EACH ROW EXECUTE FUNCTION public.offer_enqueue_initial_access();
REVOKE ALL ON FUNCTION public.offer_enqueue_initial_access() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.offer_claim_access_delivery(_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item offer_access_deliveries%ROWTYPE;
BEGIN
  SELECT * INTO item FROM offer_access_deliveries WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR item.status IN ('sent','needs_review') OR item.next_attempt_at>now() OR (item.lease_until IS NOT NULL AND item.lease_until>now()) THEN RETURN NULL; END IF;
  IF item.attempts>=10 OR (item.first_attempt_at IS NOT NULL AND item.first_attempt_at<now()-interval '20 hours') THEN
    UPDATE offer_access_deliveries SET status='needs_review',last_error='retry_window_closed',lease_id=NULL,lease_until=NULL WHERE id=_id;
    RETURN NULL;
  END IF;
  UPDATE offer_access_deliveries SET status='sending',lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()) WHERE id=_id RETURNING * INTO item;
  RETURN to_jsonb(item);
END $$;

CREATE OR REPLACE FUNCTION public.offer_freeze_access_delivery(_id uuid,_lease_id uuid,_payload_cipher text,_grants jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item offer_access_deliveries%ROWTYPE; grant_item jsonb; ids uuid[];
BEGIN
  SELECT * INTO item FROM offer_access_deliveries WHERE id=_id FOR UPDATE;
  IF NOT FOUND OR item.lease_id IS DISTINCT FROM _lease_id OR item.lease_until<=now() OR item.status<>'sending' THEN RETURN false; END IF;
  IF item.payload_cipher IS NOT NULL THEN RETURN false; END IF;
  IF _payload_cipher IS NULL OR length(_payload_cipher) NOT BETWEEN 32 AND 100000 OR jsonb_typeof(_grants)<>'array' OR jsonb_array_length(_grants)<>cardinality(item.order_ids) THEN RAISE EXCEPTION 'Invalid delivery payload'; END IF;
  SELECT array_agg((g->>'order_id')::uuid ORDER BY (g->>'order_id')::uuid) INTO ids FROM jsonb_array_elements(_grants) g;
  IF ids IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(item.order_ids) x) THEN RAISE EXCEPTION 'Grant order mismatch'; END IF;
  FOR grant_item IN SELECT * FROM jsonb_array_elements(_grants) LOOP
    INSERT INTO offer_access_grants(token_hash,order_id,delivery_id,expires_at)
    VALUES(grant_item->>'token_hash',(grant_item->>'order_id')::uuid,_id,now()+interval '30 days');
  END LOOP;
  UPDATE offer_access_deliveries SET payload_cipher=_payload_cipher WHERE id=_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.offer_finish_access_delivery(_id uuid,_lease_id uuid,_provider_id text DEFAULT NULL,_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF _provider_id IS NOT NULL AND (length(_provider_id)<1 OR length(_provider_id)>200) THEN RAISE EXCEPTION 'Invalid receipt'; END IF;
  UPDATE offer_access_deliveries SET status=CASE WHEN _provider_id IS NOT NULL THEN 'sent' WHEN _error IN ('recipient_suppressed','delivery_envelope_unavailable') THEN 'needs_review' ELSE 'pending' END,
    provider_id=_provider_id,sent_at=CASE WHEN _provider_id IS NOT NULL THEN now() ELSE NULL END,
    last_error=CASE WHEN _provider_id IS NOT NULL THEN NULL ELSE left(coalesce(_error,'provider_unavailable'),80) END,
    lease_id=NULL,lease_until=NULL,next_attempt_at=now()+interval '1 minute'
  WHERE id=_id AND lease_id=_lease_id AND status='sending';
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.offer_resolve_access_hash(_token_hash text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT token_hash FROM offer_orders WHERE token_hash=_token_hash
  UNION ALL
  SELECT o.token_hash FROM offer_access_grants g JOIN offer_orders o ON o.id=g.order_id
  WHERE g.token_hash=_token_hash AND g.expires_at>now()
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.offer_prepare_access_delivery(uuid,text),public.offer_claim_access_delivery(uuid),public.offer_freeze_access_delivery(uuid,uuid,text,jsonb),public.offer_finish_access_delivery(uuid,uuid,text,text),public.offer_resolve_access_hash(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.offer_prepare_access_delivery(uuid,text),public.offer_claim_access_delivery(uuid),public.offer_freeze_access_delivery(uuid,uuid,text,jsonb),public.offer_finish_access_delivery(uuid,uuid,text,text),public.offer_resolve_access_hash(text) TO service_role;
