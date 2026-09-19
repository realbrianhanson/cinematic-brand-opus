-- Digital offers are public; fulfillment files, customer data and Stripe state are private.
CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 160),
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 200),
  summary text NOT NULL DEFAULT '' CHECK (length(summary) <= 1000),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 40000),
  cover_url text CHECK (cover_url IS NULL OR (cover_url ~ '^https://[^[:space:]]+$' AND length(cover_url) <= 2048)),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  kind text NOT NULL DEFAULT 'free' CHECK (kind IN ('free','paid')),
  amount_minor integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd' CHECK (currency IN ('usd','cad','eur','gbp','aud')),
  asset_path text CHECK (asset_path IS NULL OR (length(asset_path) <= 1024 AND asset_path !~ '(^/|\.\.|[[:cntrl:]])')),
  asset_name text CHECK (asset_name IS NULL OR (length(btrim(asset_name)) BETWEEN 1 AND 255 AND asset_name !~ '[/\\[:cntrl:]]')),
  thank_you_message text NOT NULL DEFAULT '' CHECK (length(thank_you_message) <= 2000),
  next_offer_id uuid REFERENCES public.offers(id) ON DELETE RESTRICT,
  next_offer_window_minutes integer NOT NULL DEFAULT 0 CHECK (next_offer_window_minutes = 0 OR next_offer_window_minutes BETWEEN 30 AND 10080),
  funnel_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offers_price CHECK ((kind='free' AND amount_minor=0) OR (kind='paid' AND amount_minor BETWEEN 50 AND 99999999)),
  CONSTRAINT offers_ready_to_publish CHECK (status <> 'published' OR (length(btrim(title))>0 AND length(btrim(summary))>0 AND length(btrim(asset_path))>0 AND asset_path IS NOT NULL AND asset_name IS NOT NULL)),
  CONSTRAINT offers_not_self_referencing CHECK (next_offer_id IS DISTINCT FROM id)
);

CREATE TABLE public.offer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE RESTRICT,
  parent_order_id uuid UNIQUE REFERENCES public.offer_orders(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320 AND email=lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 200),
  status text NOT NULL CHECK (status IN ('pending','fulfilled','failed','expired','refunded')),
  title_snapshot text NOT NULL,
  asset_path_snapshot text NOT NULL,
  asset_name_snapshot text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor BETWEEN 0 AND 99999999),
  currency text NOT NULL CHECK (currency IN ('usd','cad','eur','gbp','aud')),
  next_offer_id uuid REFERENCES public.offers(id) ON DELETE RESTRICT,
  next_offer_window_minutes integer NOT NULL DEFAULT 0 CHECK (next_offer_window_minutes=0 OR next_offer_window_minutes BETWEEN 30 AND 10080),
  next_offer_deadline timestamptz,
  declined_at timestamptz,
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  stripe_checkout_url text,
  checkout_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  CONSTRAINT offer_order_fulfilled_time CHECK (status <> 'fulfilled' OR fulfilled_at IS NOT NULL)
);
CREATE INDEX offer_orders_created_idx ON public.offer_orders(created_at DESC);
CREATE INDEX offer_orders_offer_idx ON public.offer_orders(offer_id);
CREATE TABLE public.offer_stripe_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offers,public.offer_orders,public.offer_stripe_events FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,slug,title,summary,body,cover_url,status,kind,amount_minor,currency,thank_you_message,funnel_only,created_at,updated_at) ON public.offers TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.offers TO authenticated;
GRANT SELECT ON public.offer_orders TO authenticated;
GRANT ALL ON public.offers,public.offer_orders,public.offer_stripe_events TO service_role;
CREATE POLICY offers_public_read ON public.offers FOR SELECT TO anon USING (status='published');
CREATE POLICY offers_admin_manage ON public.offers FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY offer_orders_admin_read ON public.offer_orders FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('offer-files','offer-files',false,26214400,ARRAY['application/pdf','application/zip','application/x-zip-compressed','application/epub+zip','text/plain'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
CREATE POLICY offer_files_admin_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='offer-files' AND public.is_admin(auth.uid()));
CREATE POLICY offer_files_admin_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='offer-files' AND public.is_admin(auth.uid()) AND name ~ '^[a-f0-9-]{36}/[^/]+$' AND name !~ '\.\.');
-- No overwrite/delete policy: every upload uses a new UUID; sold file snapshots stay available.

CREATE FUNCTION public.offer_validate_graph() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reaches_self boolean;
BEGIN
  -- Serialize graph edits, including otherwise disjoint rows that could jointly create a cycle.
  PERFORM pg_advisory_xact_lock(671149920);
  IF NEW.next_offer_id IS NOT NULL THEN
    WITH RECURSIVE chain AS (
      SELECT id,next_offer_id,ARRAY[id] AS seen FROM public.offers WHERE id=NEW.next_offer_id
      UNION ALL
      SELECT o.id,o.next_offer_id,c.seen||o.id FROM public.offers o JOIN chain c ON o.id=c.next_offer_id WHERE NOT o.id=ANY(c.seen)
    ) SELECT EXISTS(SELECT 1 FROM chain WHERE id=NEW.id) INTO reaches_self;
    IF reaches_self THEN RAISE EXCEPTION 'Offer funnel cannot contain a cycle'; END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER offers_validate_graph BEFORE INSERT OR UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.offer_validate_graph();
REVOKE ALL ON FUNCTION public.offer_validate_graph() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.offer_reserve_order(_offer_id uuid,_token_hash text,_email text,_name text,_parent_hash text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.offers%ROWTYPE; parent public.offer_orders%ROWTYPE; existing public.offer_orders%ROWTYPE; result public.offer_orders%ROWTYPE;
  normalized_email text := lower(btrim(_email)); normalized_name text := btrim(coalesce(_name,'')); chain_length integer; repeats boolean; reservation_time timestamptz;
BEGIN
  IF _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid access token'; END IF;
  IF normalized_email IS NULL OR length(normalized_email)>320 OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(normalized_name)>200 THEN RAISE EXCEPTION 'Invalid contact details'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_token_hash,671149921));
  IF _parent_hash IS NOT NULL THEN
    SELECT * INTO parent FROM public.offer_orders WHERE token_hash=_parent_hash FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid parent access'; END IF;
  END IF;
  SELECT * INTO existing FROM public.offer_orders WHERE token_hash=_token_hash;
  IF FOUND THEN
    IF existing.offer_id IS DISTINCT FROM _offer_id OR existing.email<>normalized_email OR existing.name<>normalized_name OR existing.parent_order_id IS DISTINCT FROM parent.id THEN RAISE EXCEPTION 'Order request does not match token'; END IF;
    RETURN to_jsonb(existing);
  END IF;
  SELECT * INTO item FROM public.offers WHERE id=_offer_id AND status='published' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer is unavailable'; END IF;
  reservation_time := clock_timestamp();
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='offer-files' AND name=item.asset_path) THEN RAISE EXCEPTION 'Offer file is unavailable'; END IF;
  IF parent.id IS NOT NULL THEN
    IF parent.status<>'fulfilled' OR parent.next_offer_id IS DISTINCT FROM item.id OR parent.declined_at IS NOT NULL OR (parent.next_offer_deadline IS NOT NULL AND parent.next_offer_deadline<=reservation_time) OR parent.email<>normalized_email THEN RAISE EXCEPTION 'Follow-up offer is unavailable'; END IF;
    IF EXISTS(SELECT 1 FROM public.offer_orders WHERE parent_order_id=parent.id) THEN RAISE EXCEPTION 'Follow-up offer already claimed'; END IF;
    WITH RECURSIVE ancestors AS (
      SELECT id,parent_order_id,offer_id,ARRAY[id] seen FROM public.offer_orders WHERE id=parent.id
      UNION ALL
      SELECT p.id,p.parent_order_id,p.offer_id,a.seen||p.id FROM public.offer_orders p JOIN ancestors a ON p.id=a.parent_order_id WHERE NOT p.id=ANY(a.seen)
    ) SELECT count(*),bool_or(offer_id=item.id) INTO chain_length,repeats FROM ancestors;
    IF chain_length>=10 OR repeats THEN RAISE EXCEPTION 'Offer funnel limit reached'; END IF;
  ELSIF item.funnel_only THEN
    RAISE EXCEPTION 'This offer requires a previous purchase or claim';
  END IF;
  INSERT INTO public.offer_orders(offer_id,parent_order_id,token_hash,email,name,status,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency,next_offer_id,next_offer_window_minutes,next_offer_deadline,checkout_expires_at,fulfilled_at)
  VALUES(item.id,parent.id,_token_hash,normalized_email,normalized_name,CASE WHEN item.kind='free' THEN 'fulfilled' ELSE 'pending' END,item.title,item.asset_path,item.asset_name,item.amount_minor,item.currency,item.next_offer_id,item.next_offer_window_minutes,
    CASE WHEN item.kind='free' AND item.next_offer_id IS NOT NULL AND item.next_offer_window_minutes>0 THEN reservation_time+make_interval(mins=>item.next_offer_window_minutes) ELSE NULL END,reservation_time+interval '60 minutes',CASE WHEN item.kind='free' THEN reservation_time ELSE NULL END)
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END $$;

CREATE FUNCTION public.offer_record_checkout(_order_id uuid,_session_id text,_checkout_url text,_payment_intent_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.offer_orders%ROWTYPE;
BEGIN
  IF _session_id IS NULL OR _session_id !~ '^cs_[a-zA-Z0-9_]+$' OR _checkout_url IS NULL OR _checkout_url !~ '^https://checkout\.stripe\.com/[^[:space:]]+$' THEN RAISE EXCEPTION 'Invalid checkout session'; END IF;
  SELECT * INTO item FROM public.offer_orders WHERE id=_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown order'; END IF;
  IF item.amount_minor=0 OR (item.stripe_session_id IS NOT NULL AND item.stripe_session_id<>_session_id) OR (_payment_intent_id IS NOT NULL AND item.stripe_payment_intent_id IS NOT NULL AND item.stripe_payment_intent_id<>_payment_intent_id) THEN RAISE EXCEPTION 'Checkout session does not match order'; END IF;
  IF item.status NOT IN ('pending','fulfilled','refunded') THEN RAISE EXCEPTION 'Order cannot start checkout'; END IF;
  IF item.status='pending' AND item.stripe_session_id IS NULL AND item.checkout_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Checkout has expired'; END IF;
  UPDATE public.offer_orders SET stripe_session_id=_session_id,stripe_checkout_url=coalesce(stripe_checkout_url,_checkout_url),stripe_payment_intent_id=coalesce(stripe_payment_intent_id,_payment_intent_id) WHERE id=item.id RETURNING * INTO item;
  RETURN to_jsonb(item);
END $$;

CREATE FUNCTION public.offer_apply_stripe_event(_event_id text,_event_type text,_session_id text,_order_id uuid,_payment_intent_id text,_amount_minor integer,_currency text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.offer_orders%ROWTYPE; event_time timestamptz := clock_timestamp();
BEGIN
  IF _event_id IS NULL OR length(_event_id)>255 OR _event_id !~ '^evt_[a-zA-Z0-9_]+$' THEN RAISE EXCEPTION 'Invalid Stripe event'; END IF;
  IF _event_type IS NULL OR _event_type NOT IN ('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','charge.refunded') THEN RAISE EXCEPTION 'Unsupported Stripe event'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_event_id,671149922));
  IF EXISTS(SELECT 1 FROM public.offer_stripe_events WHERE event_id=_event_id) THEN RETURN jsonb_build_object('duplicate',true); END IF;
  IF _event_type='charge.refunded' THEN
    SELECT * INTO item FROM public.offer_orders WHERE stripe_payment_intent_id=_payment_intent_id FOR UPDATE;
    -- An early refund must be retried after the checkout event has associated the payment intent.
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown payment intent'; END IF;
    UPDATE public.offer_orders SET status='refunded' WHERE id=item.id RETURNING * INTO item;
  ELSE
    SELECT * INTO item FROM public.offer_orders WHERE id=_order_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown order'; END IF;
    IF item.amount_minor=0 OR _session_id IS NULL OR _session_id !~ '^cs_[a-zA-Z0-9_]+$' OR (item.stripe_session_id IS NOT NULL AND item.stripe_session_id<>_session_id) OR (_payment_intent_id IS NOT NULL AND item.stripe_payment_intent_id IS NOT NULL AND item.stripe_payment_intent_id<>_payment_intent_id) THEN RAISE EXCEPTION 'Stripe event does not match order'; END IF;
    IF _event_type IN ('checkout.session.completed','checkout.session.async_payment_succeeded') THEN
      IF _amount_minor IS DISTINCT FROM item.amount_minor OR lower(_currency) IS DISTINCT FROM item.currency OR _payment_intent_id IS NULL THEN RAISE EXCEPTION 'Stripe payment amount or currency does not match order'; END IF;
      UPDATE public.offer_orders SET stripe_session_id=_session_id,stripe_payment_intent_id=_payment_intent_id,
        status=CASE WHEN status='refunded' THEN 'refunded' ELSE 'fulfilled' END,
        fulfilled_at=coalesce(fulfilled_at,event_time),
        next_offer_deadline=coalesce(next_offer_deadline,CASE WHEN next_offer_id IS NOT NULL AND next_offer_window_minutes>0 THEN coalesce(fulfilled_at,event_time)+make_interval(mins=>next_offer_window_minutes) ELSE NULL END)
      WHERE id=item.id RETURNING * INTO item;
    ELSE
      UPDATE public.offer_orders SET stripe_session_id=_session_id,stripe_payment_intent_id=coalesce(stripe_payment_intent_id,_payment_intent_id),status=CASE WHEN status='pending' THEN CASE WHEN _event_type='checkout.session.expired' THEN 'expired' ELSE 'failed' END ELSE status END WHERE id=item.id RETURNING * INTO item;
    END IF;
  END IF;
  INSERT INTO public.offer_stripe_events(event_id,event_type) VALUES(_event_id,_event_type);
  RETURN jsonb_build_object('order_id',item.id,'status',item.status,'duplicate',false);
END $$;

CREATE FUNCTION public.offer_decline_next(_token_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.offer_orders%ROWTYPE;
BEGIN
  SELECT * INTO item FROM public.offer_orders WHERE token_hash=_token_hash FOR UPDATE;
  IF NOT FOUND OR item.status<>'fulfilled' THEN RAISE EXCEPTION 'Order is unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM public.offer_orders WHERE parent_order_id=item.id) THEN RAISE EXCEPTION 'Follow-up offer already claimed'; END IF;
  UPDATE public.offer_orders SET declined_at=coalesce(declined_at,clock_timestamp()) WHERE id=item.id;
  RETURN jsonb_build_object('ok',true);
END $$;

REVOKE ALL ON FUNCTION public.offer_reserve_order(uuid,text,text,text,text),public.offer_record_checkout(uuid,text,text,text),public.offer_apply_stripe_event(text,text,text,uuid,text,integer,text),public.offer_decline_next(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.offer_reserve_order(uuid,text,text,text,text),public.offer_record_checkout(uuid,text,text,text),public.offer_apply_stripe_event(text,text,text,uuid,text,integer,text),public.offer_decline_next(text) TO service_role;
