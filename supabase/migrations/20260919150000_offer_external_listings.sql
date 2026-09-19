-- External products are editorial listings. They never reserve a local order,
-- charge through this site's Stripe account, or grant a local download.
CREATE FUNCTION public.offer_valid_external_url(_url text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
DECLARE authority text; host text; port text; parts text[]; label text;
BEGIN
  IF _url IS NULL OR length(_url)>2048 OR _url ~ '[[:space:][:cntrl:]\\]' THEN RETURN false; END IF;
  parts := regexp_match(_url,'^https://([^/?#]+)([/?#].*)?$','i');
  IF parts IS NULL THEN RETURN false; END IF;
  authority := parts[1];
  IF authority LIKE '%@%' THEN RETURN false; END IF;
  IF left(authority,1)='[' THEN
    parts := regexp_match(authority,'^\[([0-9a-fA-F:.]+)\](:([0-9]{1,5}))?$');
    IF parts IS NULL THEN RETURN false; END IF;
    host := parts[1]; port := parts[3];
    BEGIN IF family(host::inet)<>6 THEN RETURN false; END IF;
    EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
  ELSE
    parts := regexp_match(authority,'^([a-zA-Z0-9.-]+)(:([0-9]{1,5}))?$');
    IF parts IS NULL THEN RETURN false; END IF;
    host := rtrim(parts[1],'.'); port := parts[3];
    IF length(host)=0 OR length(host)>253 THEN RETURN false; END IF;
    FOREACH label IN ARRAY string_to_array(host,'.') LOOP
      IF label !~ '^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$' THEN RETURN false; END IF;
    END LOOP;
    IF host ~ '^[0-9.]+$' THEN
      BEGIN IF family(host::inet)<>4 THEN RETURN false; END IF;
      EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
    END IF;
  END IF;
  RETURN port IS NULL OR port::integer<=65535;
END $$;
REVOKE ALL ON FUNCTION public.offer_valid_external_url(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.offer_valid_external_url(text) TO authenticated,service_role;

ALTER TABLE public.offers
  ADD COLUMN checkout_mode text NOT NULL DEFAULT 'native' CHECK (checkout_mode IN ('native','external')),
  ADD COLUMN price_display_mode text NOT NULL DEFAULT 'fixed' CHECK (price_display_mode IN ('fixed','provider')),
  ADD COLUMN external_url text CHECK (external_url IS NULL OR public.offer_valid_external_url(external_url)),
  ADD COLUMN external_button_text text NOT NULL DEFAULT '' CHECK (length(external_button_text)<=80),
  ADD COLUMN is_affiliate boolean NOT NULL DEFAULT false,
  ADD COLUMN affiliate_disclosure text CHECK (affiliate_disclosure IS NULL OR length(affiliate_disclosure)<=1000),
  DROP CONSTRAINT offers_price,
  DROP CONSTRAINT offers_ready_to_publish,
  ADD CONSTRAINT offers_price CHECK (
    (price_display_mode='fixed' AND ((kind='free' AND amount_minor=0) OR (kind='paid' AND amount_minor BETWEEN 50 AND 99999999)))
    OR (checkout_mode='external' AND price_display_mode='provider' AND kind='paid' AND amount_minor=0)
  ),
  ADD CONSTRAINT offers_native_fixed_price CHECK (checkout_mode<>'native' OR price_display_mode='fixed'),
  ADD CONSTRAINT offers_external_no_funnel CHECK (checkout_mode<>'external' OR (next_offer_id IS NULL AND NOT funnel_only AND next_offer_window_minutes=0)),
  ADD CONSTRAINT offers_ready_to_publish CHECK (
    status<>'published' OR (
      length(btrim(title))>0 AND length(btrim(summary))>0 AND
      ((checkout_mode='native' AND asset_path IS NOT NULL AND length(btrim(asset_path))>0 AND asset_name IS NOT NULL)
       OR (checkout_mode='external' AND external_url IS NOT NULL AND public.offer_valid_external_url(external_url)))
    )
  );
GRANT SELECT(checkout_mode,price_display_mode,external_url,external_button_text,is_affiliate,affiliate_disclosure) ON public.offers TO anon;

-- Keep target validation bounded as order history grows. These checks run
-- while holding the graph lock shared by offer edits.
CREATE INDEX offers_next_offer_idx ON public.offers(next_offer_id) WHERE next_offer_id IS NOT NULL;
CREATE INDEX offer_orders_next_offer_idx ON public.offer_orders(next_offer_id) WHERE next_offer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.offer_validate_graph() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reaches_self boolean;
BEGIN
  -- Reuse the shared graph lock so concurrent edits cannot introduce an
  -- external target between validation of a parent and conversion of a child.
  PERFORM pg_advisory_xact_lock(671149920);
  IF NEW.checkout_mode='external' AND (
    EXISTS(SELECT 1 FROM public.offers WHERE next_offer_id=NEW.id)
    OR EXISTS(SELECT 1 FROM public.offer_orders WHERE next_offer_id=NEW.id)
  ) THEN RAISE EXCEPTION 'External listings cannot be follow-up targets for current or historical orders'; END IF;
  IF NEW.next_offer_id IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.offers WHERE id=NEW.next_offer_id AND checkout_mode='external') THEN
      RAISE EXCEPTION 'External listings cannot be follow-up targets';
    END IF;
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

-- Existing-token retries return their immutable order before checking listing mode.
CREATE OR REPLACE FUNCTION public.offer_reserve_order(_offer_id uuid,_token_hash text,_email text,_name text,_parent_hash text DEFAULT NULL)
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
  IF item.checkout_mode<>'native' THEN RAISE EXCEPTION 'External listings do not support local claims'; END IF;
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
