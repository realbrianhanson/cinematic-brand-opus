-- One payment owns an immutable basket. Historical orders and delivery queues
-- are intentionally not backfilled or rewritten.
ALTER TABLE public.offers
  ADD COLUMN bump_offer_id uuid REFERENCES public.offers(id) ON DELETE RESTRICT,
  ADD COLUMN downsell_offer_id uuid REFERENCES public.offers(id) ON DELETE RESTRICT,
  ADD CONSTRAINT offers_commerce_links CHECK (
    bump_offer_id IS DISTINCT FROM id AND downsell_offer_id IS DISTINCT FROM id
    AND (downsell_offer_id IS NULL OR (next_offer_id IS NOT NULL AND downsell_offer_id<>next_offer_id))
    AND (checkout_mode='native' OR (bump_offer_id IS NULL AND downsell_offer_id IS NULL))
  );
ALTER TABLE public.offer_orders
  ADD COLUMN downsell_offer_id uuid REFERENCES public.offers(id) ON DELETE RESTRICT,
  ADD COLUMN upsell_declined_at timestamptz;
CREATE INDEX offers_bump_offer_idx ON public.offers(bump_offer_id) WHERE bump_offer_id IS NOT NULL;
CREATE INDEX offers_downsell_offer_idx ON public.offers(downsell_offer_id) WHERE downsell_offer_id IS NOT NULL;
CREATE INDEX offer_orders_downsell_idx ON public.offer_orders(downsell_offer_id) WHERE downsell_offer_id IS NOT NULL;

CREATE TABLE public.offer_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.offer_orders(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('primary','bump')),
  title_snapshot text NOT NULL,
  asset_path_snapshot text NOT NULL,
  asset_name_snapshot text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor BETWEEN 0 AND 99999999),
  currency text NOT NULL CHECK (currency IN ('usd','cad','eur','gbp','aud')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,role), UNIQUE(order_id,offer_id),
  CHECK (role<>'bump' OR amount_minor>=50)
);
ALTER TABLE public.offer_order_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offer_order_items FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.offer_order_items TO service_role;
GRANT SELECT ON public.offer_order_items TO authenticated;
CREATE POLICY offer_order_items_admin_read ON public.offer_order_items FOR SELECT TO authenticated USING(public.is_admin(auth.uid()));
CREATE FUNCTION public.offer_order_items_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'Order item snapshots are immutable'; END $$;
CREATE TRIGGER offer_order_items_immutable BEFORE UPDATE OR DELETE ON public.offer_order_items FOR EACH ROW EXECUTE FUNCTION public.offer_order_items_immutable();
REVOKE ALL ON FUNCTION public.offer_order_items_immutable() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.offer_validate_graph() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reaches_self boolean; bump public.offers%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(671149920);
  IF NEW.checkout_mode='external' AND (
    EXISTS(SELECT 1 FROM offers WHERE NEW.id IN (next_offer_id,downsell_offer_id,bump_offer_id))
    OR EXISTS(SELECT 1 FROM offer_orders WHERE NEW.id IN (next_offer_id,downsell_offer_id))
  ) THEN RAISE EXCEPTION 'External listings cannot be targets for current or historical orders'; END IF;
  IF EXISTS(SELECT 1 FROM offers WHERE id IN (NEW.next_offer_id,NEW.downsell_offer_id) AND checkout_mode<>'native') THEN
    RAISE EXCEPTION 'External listings cannot be follow-up targets';
  END IF;
  IF NEW.bump_offer_id IS NOT NULL THEN
    SELECT * INTO bump FROM offers WHERE id=NEW.bump_offer_id;
    IF NOT FOUND OR bump.checkout_mode<>'native' OR bump.kind<>'paid' OR bump.currency<>NEW.currency THEN
      RAISE EXCEPTION 'The order bump must be a paid native offer in the same currency';
    END IF;
    IF NEW.amount_minor+bump.amount_minor>99999999 THEN RAISE EXCEPTION 'Combined checkout amount is too large'; END IF;
    IF NEW.status='published' AND bump.status<>'published' THEN RAISE EXCEPTION 'Publish the checkout extra before publishing this offer'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM offers WHERE bump_offer_id=NEW.id AND (NEW.kind<>'paid' OR NEW.checkout_mode<>'native' OR currency<>NEW.currency)) THEN
    RAISE EXCEPTION 'This offer is used as an order bump; keep native paid pricing and its currency';
  END IF;
  IF EXISTS(SELECT 1 FROM offers WHERE bump_offer_id=NEW.id AND amount_minor+NEW.amount_minor>99999999) THEN
    RAISE EXCEPTION 'Combined checkout amount is too large for a linked offer';
  END IF;
  -- Distinct reachable IDs bound traversal by the catalog size, not the
  -- number of paths through a branching DAG. Edges can reach NEW before an
  -- inserted row itself is visible, so multirow inserts cannot hide a cycle.
  WITH RECURSIVE chain(id) AS (
    SELECT target FROM unnest(ARRAY[NEW.next_offer_id,NEW.downsell_offer_id,NEW.bump_offer_id]) target WHERE target IS NOT NULL
    UNION
    SELECT target FROM chain c JOIN offers p ON p.id=c.id
      CROSS JOIN LATERAL unnest(ARRAY[p.next_offer_id,p.downsell_offer_id,p.bump_offer_id]) target WHERE target IS NOT NULL
  ) SELECT EXISTS(SELECT 1 FROM chain WHERE id=NEW.id) INTO reaches_self;
  IF reaches_self THEN RAISE EXCEPTION 'Offer funnel cannot contain a cycle'; END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END $$;

CREATE FUNCTION public.offer_order_snapshot(_order_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT to_jsonb(o)||jsonb_build_object('items',coalesce((
    SELECT jsonb_agg(to_jsonb(i) ORDER BY CASE WHEN role='primary' THEN 0 ELSE 1 END)
    FROM offer_order_items i WHERE i.order_id=o.id
  ),'[]'::jsonb)) FROM offer_orders o WHERE o.id=_order_id
$$;
REVOKE ALL ON FUNCTION public.offer_order_snapshot(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.offer_order_snapshot(uuid) TO service_role;

-- The new optional argument keeps old callers compatible while binding every
-- idempotency token to its selected basket, including an explicit no-bump choice.
DROP FUNCTION public.offer_reserve_order(uuid,text,text,text,text);
CREATE FUNCTION public.offer_reserve_order(_offer_id uuid,_token_hash text,_email text,_name text,_parent_hash text DEFAULT NULL,_bump_offer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.offers%ROWTYPE; bump public.offers%ROWTYPE; parent public.offer_orders%ROWTYPE; existing public.offer_orders%ROWTYPE; result public.offer_orders%ROWTYPE;
  normalized_email text:=lower(btrim(_email)); normalized_name text:=btrim(coalesce(_name,'')); chain_length integer; repeats boolean;
  reservation_time timestamptz; total integer; target uuid; existing_bump uuid;
BEGIN
  IF _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid access token'; END IF;
  IF normalized_email IS NULL OR length(normalized_email)>320 OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(normalized_name)>200 THEN RAISE EXCEPTION 'Invalid contact details'; END IF;
  -- Use the same graph-before-row lock order as publishing and graph edits.
  PERFORM pg_advisory_xact_lock(671149920);
  PERFORM pg_advisory_xact_lock(hashtextextended(_token_hash,671149921));
  IF _parent_hash IS NOT NULL THEN
    SELECT * INTO parent FROM offer_orders WHERE token_hash=_parent_hash FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid parent access'; END IF;
  END IF;
  SELECT * INTO existing FROM offer_orders WHERE token_hash=_token_hash;
  IF FOUND THEN
    SELECT offer_id INTO existing_bump FROM offer_order_items WHERE order_id=existing.id AND role='bump';
    IF existing.offer_id IS DISTINCT FROM _offer_id OR existing.email<>normalized_email OR existing.name<>normalized_name OR existing.parent_order_id IS DISTINCT FROM parent.id OR existing_bump IS DISTINCT FROM _bump_offer_id THEN RAISE EXCEPTION 'Order request does not match token'; END IF;
    RETURN offer_order_snapshot(existing.id);
  END IF;
  SELECT * INTO item FROM offers WHERE id=_offer_id AND status='published' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer is unavailable'; END IF;
  IF item.checkout_mode<>'native' THEN RAISE EXCEPTION 'External listings do not support local claims'; END IF;
  reservation_time:=clock_timestamp();
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='offer-files' AND name=item.asset_path) THEN RAISE EXCEPTION 'Offer file is unavailable'; END IF;
  total:=item.amount_minor;
  IF _bump_offer_id IS NOT NULL THEN
    SELECT * INTO bump FROM offers WHERE id=_bump_offer_id AND id=item.bump_offer_id AND id<>item.id AND status='published' AND checkout_mode='native' AND kind='paid' AND currency=item.currency FOR SHARE;
    IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='offer-files' AND name=bump.asset_path) THEN RAISE EXCEPTION 'Order bump is unavailable'; END IF;
    total:=total+bump.amount_minor;
    IF total>99999999 THEN RAISE EXCEPTION 'Combined checkout amount is too large'; END IF;
  END IF;
  IF parent.id IS NOT NULL THEN
    target:=CASE WHEN parent.upsell_declined_at IS NOT NULL THEN parent.downsell_offer_id ELSE parent.next_offer_id END;
    IF parent.status<>'fulfilled' OR target IS DISTINCT FROM item.id OR parent.declined_at IS NOT NULL OR (parent.next_offer_deadline IS NOT NULL AND parent.next_offer_deadline<=reservation_time) OR parent.email<>normalized_email THEN RAISE EXCEPTION 'Follow-up offer is unavailable'; END IF;
    IF EXISTS(SELECT 1 FROM offer_orders WHERE parent_order_id=parent.id) THEN RAISE EXCEPTION 'Follow-up offer already claimed'; END IF;
    WITH RECURSIVE ancestors AS (
      SELECT id,parent_order_id,offer_id,ARRAY[id] seen FROM offer_orders WHERE id=parent.id
      UNION ALL SELECT p.id,p.parent_order_id,p.offer_id,a.seen||p.id FROM offer_orders p JOIN ancestors a ON p.id=a.parent_order_id WHERE NOT p.id=ANY(a.seen)
    ) SELECT count(*),bool_or(offer_id=item.id) INTO chain_length,repeats FROM ancestors;
    IF chain_length>=10 OR repeats THEN RAISE EXCEPTION 'Offer funnel limit reached'; END IF;
  ELSIF item.funnel_only THEN RAISE EXCEPTION 'This offer requires a previous purchase or claim'; END IF;
  INSERT INTO offer_orders(offer_id,parent_order_id,token_hash,email,name,status,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency,next_offer_id,downsell_offer_id,next_offer_window_minutes,next_offer_deadline,checkout_expires_at,fulfilled_at)
  VALUES(item.id,parent.id,_token_hash,normalized_email,normalized_name,CASE WHEN total=0 THEN 'fulfilled' ELSE 'pending' END,item.title,item.asset_path,item.asset_name,total,item.currency,item.next_offer_id,item.downsell_offer_id,item.next_offer_window_minutes,
    CASE WHEN total=0 AND item.next_offer_id IS NOT NULL AND item.next_offer_window_minutes>0 THEN reservation_time+make_interval(mins=>item.next_offer_window_minutes) ELSE NULL END,
    reservation_time+interval '60 minutes',CASE WHEN total=0 THEN reservation_time ELSE NULL END) RETURNING * INTO result;
  INSERT INTO offer_order_items(order_id,offer_id,role,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency)
    VALUES(result.id,item.id,'primary',item.title,item.asset_path,item.asset_name,item.amount_minor,item.currency);
  IF bump.id IS NOT NULL THEN
    INSERT INTO offer_order_items(order_id,offer_id,role,title_snapshot,asset_path_snapshot,asset_name_snapshot,amount_minor,currency)
      VALUES(result.id,bump.id,'bump',bump.title,bump.asset_path,bump.asset_name,bump.amount_minor,bump.currency);
  END IF;
  RETURN offer_order_snapshot(result.id);
END $$;
REVOKE ALL ON FUNCTION public.offer_reserve_order(uuid,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.offer_reserve_order(uuid,text,text,text,text,uuid) TO service_role;

DROP FUNCTION public.offer_decline_next(text);
CREATE FUNCTION public.offer_decline_next(_token_hash text,_offer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.offer_orders%ROWTYPE; target uuid;
BEGIN
  SELECT * INTO item FROM offer_orders WHERE token_hash=_token_hash FOR UPDATE;
  IF NOT FOUND OR item.status<>'fulfilled' THEN RAISE EXCEPTION 'Order is unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM offer_orders WHERE parent_order_id=item.id) THEN RAISE EXCEPTION 'Follow-up offer already claimed'; END IF;
  -- Retries target the viewed offer, not whichever stage is now active.
  IF _offer_id IS NOT NULL AND _offer_id=item.next_offer_id AND item.upsell_declined_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true); END IF;
  IF item.declined_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true); END IF;
  target:=CASE WHEN item.upsell_declined_at IS NOT NULL THEN item.downsell_offer_id ELSE item.next_offer_id END;
  IF (_offer_id IS NULL AND item.downsell_offer_id IS NOT NULL) OR (_offer_id IS NOT NULL AND _offer_id IS DISTINCT FROM target) THEN RAISE EXCEPTION 'Follow-up changed; refresh before declining'; END IF;
  IF item.downsell_offer_id IS NOT NULL AND item.upsell_declined_at IS NULL AND (item.next_offer_deadline IS NULL OR item.next_offer_deadline>clock_timestamp()) THEN
    UPDATE offer_orders SET upsell_declined_at=clock_timestamp() WHERE id=item.id;
  ELSE
    UPDATE offer_orders SET declined_at=clock_timestamp() WHERE id=item.id;
  END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.offer_decline_next(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.offer_decline_next(text,uuid) TO service_role;

-- Existing private draft/revision validation and atomic publication include the new links.
CREATE OR REPLACE FUNCTION public.offer_builder_document_valid(_document jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
DECLARE builder jsonb; strategy jsonb; item record; lim integer;
  offer_keys text[] := ARRAY['slug','title','summary','body','cover_url','status','kind','amount_minor','currency','asset_path','asset_name','thank_you_message','next_offer_id','bump_offer_id','downsell_offer_id','next_offer_window_minutes','funnel_only','show_in_shop','shop_category','shop_featured','checkout_mode','price_display_mode','external_url','external_button_text','is_affiliate','affiliate_disclosure'];
BEGIN
  IF _document IS NULL OR octet_length(_document::text)>1000000 OR NOT coalesce(public.offer_builder_keys(_document,ARRAY['offer','builder']),false)
    OR jsonb_typeof(_document->'offer')<>'object' THEN RETURN false; END IF;
  FOR item IN SELECT key,value FROM jsonb_each(_document->'offer') LOOP
    IF NOT item.key=ANY(offer_keys) THEN RETURN false; END IF;
    IF item.key=ANY(ARRAY['funnel_only','show_in_shop','shop_featured','is_affiliate']) THEN
      IF jsonb_typeof(item.value)<>'boolean' THEN RETURN false; END IF;
    ELSIF item.key=ANY(ARRAY['amount_minor','next_offer_window_minutes']) THEN
      IF jsonb_typeof(item.value)<>'number' OR item.value::text !~ '^[0-9]+$' THEN RETURN false; END IF;
      IF (item.value::text)::numeric>99999999 THEN RETURN false; END IF;
    ELSIF item.value='null'::jsonb AND item.key=ANY(ARRAY['cover_url','asset_path','asset_name','next_offer_id','bump_offer_id','downsell_offer_id','external_url','affiliate_disclosure']) THEN
      CONTINUE;
    ELSE
      lim := CASE item.key WHEN 'body' THEN 40000 WHEN 'slug' THEN 160 WHEN 'title' THEN 200 WHEN 'summary' THEN 1000 WHEN 'asset_path' THEN 1024 WHEN 'asset_name' THEN 255 WHEN 'thank_you_message' THEN 2000 WHEN 'cover_url' THEN 2048 WHEN 'external_url' THEN 2048 WHEN 'affiliate_disclosure' THEN 1000 ELSE 80 END;
      IF NOT public.offer_builder_text(item.value,lim) THEN RETURN false; END IF;
    END IF;
  END LOOP;
  builder := _document->'builder'; strategy := builder->'strategy';
  IF NOT coalesce(public.offer_builder_keys(builder,ARRAY['version','strategy','presentation','proofIds']),false)
    OR builder->'version'<>'1'::jsonb OR NOT public.offer_builder_presentation_valid(builder->'presentation')
    OR NOT coalesce(public.offer_builder_keys(strategy,ARRAY['audience','traffic','problem','outcome','mechanism','deliverables','objections','evidence','adMessage']),false)
    OR NOT coalesce(strategy->>'traffic'=ANY(ARRAY['cold','email','organic','referral','customer']),false)
    OR jsonb_typeof(builder->'proofIds')<>'array' THEN RETURN false; END IF;
  FOR item IN SELECT key,value FROM jsonb_each(strategy) LOOP
    lim := CASE WHEN item.key=ANY(ARRAY['deliverables','objections','evidence']) THEN 3000 ELSE 2000 END;
    IF NOT public.offer_builder_text(item.value,lim) THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_array_length(builder->'proofIds')>30 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(builder->'proofIds') v WHERE jsonb_typeof(v)<>'string' OR v#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN RETURN false; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.offer_builder_save(_offer_id uuid,_document jsonb,_expected_offer_updated_at timestamptz,_expected_draft_version bigint,_publish boolean,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item public.offers%ROWTYPE; proposed public.offers%ROWTYPE; draft public.offer_builder_drafts%ROWTYPE;
  retry public.offer_builder_revisions%ROWTYPE; revision_id uuid:=gen_random_uuid(); snapshot jsonb; page_name text; response jsonb;
BEGIN
  IF NOT coalesce(public.is_admin(auth.uid()),false) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF _offer_id IS NULL OR _request_id IS NULL OR _publish IS NULL OR NOT public.offer_builder_document_valid(_document) THEN
    RAISE EXCEPTION 'Invalid offer builder document' USING ERRCODE='22023'; END IF;
  -- Follow the existing offer graph lock order before taking row locks.
  PERFORM pg_advisory_xact_lock(671149920);
  SELECT * INTO retry FROM public.offer_builder_revisions WHERE request_id=_request_id;
  IF FOUND THEN
    IF retry.offer_id IS DISTINCT FROM _offer_id OR retry.document IS DISTINCT FROM _document OR retry.published IS DISTINCT FROM _publish
      OR retry.expected_offer_updated_at IS DISTINCT FROM _expected_offer_updated_at OR retry.expected_draft_version IS DISTINCT FROM _expected_draft_version THEN
      RAISE EXCEPTION 'Save request identifier was already used for different content' USING ERRCODE='22023'; END IF;
    RETURN retry.result;
  END IF;
  SELECT * INTO item FROM public.offers WHERE id=_offer_id FOR UPDATE;
  IF FOUND THEN
    IF item.updated_at IS DISTINCT FROM _expected_offer_updated_at THEN RAISE EXCEPTION 'Offer changed elsewhere. Reload before saving.' USING ERRCODE='40001'; END IF;
  ELSE
    IF _expected_offer_updated_at IS NOT NULL OR _expected_draft_version IS NOT NULL THEN RAISE EXCEPTION 'Offer no longer exists. Reload before saving.' USING ERRCODE='40001'; END IF;
    INSERT INTO public.offers(id,slug,title) VALUES(_offer_id,'draft-'||_offer_id,coalesce(_document#>>'{offer,title}','')) RETURNING * INTO item;
  END IF;
  SELECT * INTO draft FROM public.offer_builder_drafts WHERE offer_id=_offer_id FOR UPDATE;
  IF draft.version IS DISTINCT FROM _expected_draft_version THEN RAISE EXCEPTION 'Draft changed elsewhere. Reload before saving.' USING ERRCODE='40001'; END IF;
  IF _publish THEN
    snapshot:=_document#>'{builder,presentation}';
    FOREACH page_name IN ARRAY ARRAY['landing','upsell'] LOOP
      snapshot:=jsonb_set(snapshot,ARRAY[page_name,'sections'],coalesce((SELECT jsonb_agg(jsonb_set(value,'{proofId}','""'::jsonb) ORDER BY ord) FROM jsonb_array_elements(snapshot#>ARRAY[page_name,'sections']) WITH ORDINALITY a(value,ord)),'[]'::jsonb));
    END LOOP;
    -- Populate only the allowlisted payload; generated IDs, timestamps and snapshots cannot be supplied.
    proposed:=jsonb_populate_record(item,_document->'offer');
    UPDATE public.offers SET slug=proposed.slug,title=proposed.title,summary=proposed.summary,body=proposed.body,cover_url=proposed.cover_url,
      status='published',kind=proposed.kind,amount_minor=proposed.amount_minor,currency=proposed.currency,
      asset_path=proposed.asset_path,asset_name=proposed.asset_name,thank_you_message=proposed.thank_you_message,
      next_offer_id=proposed.next_offer_id,bump_offer_id=proposed.bump_offer_id,downsell_offer_id=proposed.downsell_offer_id,next_offer_window_minutes=proposed.next_offer_window_minutes,funnel_only=proposed.funnel_only,
      show_in_shop=proposed.show_in_shop,shop_category=proposed.shop_category,shop_featured=proposed.shop_featured,
      checkout_mode=proposed.checkout_mode,price_display_mode=proposed.price_display_mode,external_url=proposed.external_url,
      external_button_text=proposed.external_button_text,is_affiliate=proposed.is_affiliate,affiliate_disclosure=proposed.affiliate_disclosure,
      presentation=snapshot WHERE id=_offer_id RETURNING * INTO item;
  END IF;
  INSERT INTO public.offer_builder_drafts(offer_id,document,version,base_offer_updated_at)
    VALUES(_offer_id,_document,coalesce(draft.version,0)+1,item.updated_at)
    ON CONFLICT(offer_id) DO UPDATE SET document=EXCLUDED.document,version=EXCLUDED.version,base_offer_updated_at=EXCLUDED.base_offer_updated_at,updated_at=clock_timestamp()
    RETURNING * INTO draft;
  response:=jsonb_build_object('offer',to_jsonb(item),'draft',to_jsonb(draft),'revision_id',revision_id,'published',_publish);
  INSERT INTO public.offer_builder_revisions(id,offer_id,document,version,published,request_id,expected_offer_updated_at,expected_draft_version,result)
    VALUES(revision_id,_offer_id,_document,draft.version,_publish,_request_id,_expected_offer_updated_at,_expected_draft_version,response);
  RETURN response;
END $$;
REVOKE ALL ON FUNCTION public.offer_builder_save(uuid,jsonb,timestamptz,bigint,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.offer_builder_save(uuid,jsonb,timestamptz,bigint,boolean,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.offer_builder_keys(jsonb,text[]),public.offer_builder_text(jsonb,integer),public.offer_builder_page_valid(jsonb,boolean),public.offer_builder_presentation_valid(jsonb,boolean),public.offer_builder_document_valid(jsonb),public.offer_proof_touch() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.offer_builder_keys(jsonb,text[]),public.offer_builder_text(jsonb,integer),public.offer_builder_page_valid(jsonb,boolean),public.offer_builder_presentation_valid(jsonb,boolean),public.offer_builder_document_valid(jsonb) TO authenticated,service_role;


-- A narrow public projection: neither source configuration nor private files
-- are exposed, and unpublished/archived/external targets disappear immediately.
CREATE OR REPLACE FUNCTION public.offer_public_bump(_offer_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object('id',b.id,'slug',b.slug,'title',b.title,
    'summary',b.summary,'cover_url',b.cover_url,'kind',b.kind,
    'amount_minor',b.amount_minor,'currency',b.currency)
  FROM public.offers s JOIN public.offers b ON b.id=s.bump_offer_id
  WHERE s.id=_offer_id AND s.status='published' AND s.checkout_mode='native'
    AND b.status='published' AND b.checkout_mode='native' AND b.kind='paid'
    AND b.currency=s.currency;
$$;
REVOKE ALL ON FUNCTION public.offer_public_bump(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.offer_public_bump(uuid) TO anon,authenticated,service_role;
