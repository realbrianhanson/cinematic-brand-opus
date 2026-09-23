-- Private working documents and immutable revisions; only a validated presentation is public.
-- Acquire the graph lock before any offer row lock, including legacy direct edits.
-- The existing BEFORE ROW validator reacquires this transaction lock safely, but
-- cannot establish lock order on its own because UPDATE has already locked its row.
CREATE FUNCTION public.offer_lock_graph_statement() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(671149920);
  RETURN NULL;
END $$;
CREATE TRIGGER offers_lock_graph_statement BEFORE INSERT OR UPDATE OR DELETE ON public.offers
  FOR EACH STATEMENT EXECUTE FUNCTION public.offer_lock_graph_statement();
REVOKE ALL ON FUNCTION public.offer_lock_graph_statement() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.offer_builder_keys(_value jsonb, _keys text[]) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
BEGIN
  IF jsonb_typeof(_value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  RETURN _value ?& _keys
    AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(_value) k WHERE NOT k=ANY(_keys));
END $$;
CREATE FUNCTION public.offer_builder_text(_value jsonb, _limit integer) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
  SELECT coalesce(jsonb_typeof(_value)='string' AND length(_value #>> '{}')<=_limit,false);
$$;
CREATE FUNCTION public.offer_builder_page_valid(_page jsonb, _public boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
DECLARE section jsonb;
BEGIN
  IF NOT coalesce(public.offer_builder_keys(_page,ARRAY['headline','subheadline','eyebrow','ctaText','ctaMicrocopy','focusMode','sections']),false)
    OR NOT public.offer_builder_text(_page->'headline',300) OR NOT public.offer_builder_text(_page->'subheadline',1000)
    OR NOT public.offer_builder_text(_page->'eyebrow',100) OR NOT public.offer_builder_text(_page->'ctaText',80)
    OR NOT public.offer_builder_text(_page->'ctaMicrocopy',500) OR jsonb_typeof(_page->'focusMode')<>'boolean'
    OR jsonb_typeof(_page->'sections')<>'array' THEN RETURN false; END IF;
  IF jsonb_array_length(_page->'sections')>30 THEN RETURN false; END IF;
  FOR section IN SELECT value FROM jsonb_array_elements(_page->'sections') LOOP
    IF NOT coalesce(public.offer_builder_keys(section,ARRAY['id','type','heading','body','imageUrl','caption','proofId']),false)
      OR NOT public.offer_builder_text(section->'id',80) OR length(section->>'id')=0
      OR NOT coalesce(section->>'type'=ANY(ARRAY['text','problem','benefits','method','deliverables','proof','faq','guarantee','image','video','cta']),false)
      OR NOT public.offer_builder_text(section->'heading',300) OR NOT public.offer_builder_text(section->'body',6000)
      OR NOT public.offer_builder_text(section->'caption',500) OR NOT public.offer_builder_text(section->'proofId',80)
      OR NOT public.offer_builder_text(section->'imageUrl',2048)
      OR ((section->>'imageUrl')<>'' AND NOT public.offer_valid_external_url(section->>'imageUrl'))
      OR (_public AND section->>'proofId'<>'') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
CREATE FUNCTION public.offer_builder_presentation_valid(_presentation jsonb, _public boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
BEGIN
  RETURN coalesce(public.offer_builder_keys(_presentation,ARRAY['version','landing','upsell','thankYou'])
    AND _presentation->'version'='1'::jsonb
    AND public.offer_builder_page_valid(_presentation->'landing',_public)
    AND public.offer_builder_page_valid(_presentation->'upsell',_public)
    AND public.offer_builder_keys(_presentation->'thankYou',ARRAY['headline','body','firstStep'])
    AND public.offer_builder_text(_presentation#>'{thankYou,headline}',300)
    AND public.offer_builder_text(_presentation#>'{thankYou,body}',2000)
    AND public.offer_builder_text(_presentation#>'{thankYou,firstStep}',2000),false);
END $$;
CREATE FUNCTION public.offer_builder_document_valid(_document jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$
DECLARE builder jsonb; strategy jsonb; item record; lim integer;
  offer_keys text[] := ARRAY['slug','title','summary','body','cover_url','status','kind','amount_minor','currency','asset_path','asset_name','thank_you_message','next_offer_id','next_offer_window_minutes','funnel_only','show_in_shop','shop_category','shop_featured','checkout_mode','price_display_mode','external_url','external_button_text','is_affiliate','affiliate_disclosure'];
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
    ELSIF item.value='null'::jsonb AND item.key=ANY(ARRAY['cover_url','asset_path','asset_name','next_offer_id','external_url','affiliate_disclosure']) THEN
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

ALTER TABLE public.offers ADD COLUMN presentation jsonb;
ALTER TABLE public.offers ADD CONSTRAINT offers_presentation_valid CHECK (presentation IS NULL OR public.offer_builder_presentation_valid(presentation,true));
GRANT SELECT(presentation) ON public.offers TO anon;

CREATE TABLE public.offer_builder_drafts (
  offer_id uuid PRIMARY KEY REFERENCES public.offers(id) ON DELETE CASCADE,
  document jsonb NOT NULL CHECK (public.offer_builder_document_valid(document)),
  version bigint NOT NULL CHECK (version>0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  base_offer_updated_at timestamptz NOT NULL
);
CREATE TABLE public.offer_builder_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  document jsonb NOT NULL CHECK (public.offer_builder_document_valid(document)),
  version bigint NOT NULL CHECK (version>0),
  published boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id uuid NOT NULL UNIQUE,
  expected_offer_updated_at timestamptz,
  expected_draft_version bigint,
  result jsonb NOT NULL,
  UNIQUE(offer_id,version)
);
CREATE INDEX offer_builder_revisions_history_idx ON public.offer_builder_revisions(offer_id,version DESC);
CREATE TABLE public.offer_proof_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('testimonial','demonstration','fact')),
  content text NOT NULL DEFAULT '' CHECK (length(content)<=6000),
  attribution text NOT NULL DEFAULT '' CHECK (length(attribution)<=500),
  source_url text NOT NULL DEFAULT '' CHECK (source_url='' OR public.offer_valid_external_url(source_url)),
  notes text NOT NULL DEFAULT '' CHECK (length(notes)<=3000),
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION public.offer_proof_touch() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN NEW.updated_at:=clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER offer_proof_touch BEFORE UPDATE ON public.offer_proof_items FOR EACH ROW EXECUTE FUNCTION public.offer_proof_touch();
ALTER TABLE public.offer_builder_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_builder_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_proof_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offer_builder_drafts,public.offer_builder_revisions,public.offer_proof_items FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.offer_builder_drafts,public.offer_builder_revisions TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.offer_proof_items TO authenticated;
GRANT ALL ON public.offer_builder_drafts,public.offer_builder_revisions,public.offer_proof_items TO service_role;
CREATE POLICY offer_builder_drafts_admin_read ON public.offer_builder_drafts FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY offer_builder_revisions_admin_read ON public.offer_builder_revisions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY offer_proof_admin_manage ON public.offer_proof_items FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE FUNCTION public.offer_builder_save(_offer_id uuid,_document jsonb,_expected_offer_updated_at timestamptz,_expected_draft_version bigint,_publish boolean,_request_id uuid)
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
      next_offer_id=proposed.next_offer_id,next_offer_window_minutes=proposed.next_offer_window_minutes,funnel_only=proposed.funnel_only,
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

-- Persist limits across server instances, without recording prompts or private copy.
CREATE TABLE public.offer_copy_usage (
  admin_id uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX offer_copy_usage_admin_time_idx ON public.offer_copy_usage(admin_id,requested_at DESC);
ALTER TABLE public.offer_copy_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offer_copy_usage FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.offer_copy_usage TO service_role;
CREATE FUNCTION public.admin_offer_copy_allow() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE who uuid:=auth.uid(); at_time timestamptz:=clock_timestamp(); per_minute integer; per_day integer;
BEGIN
  IF NOT coalesce(public.is_admin(who),false) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(who::text,671149927));
  DELETE FROM public.offer_copy_usage WHERE admin_id=who AND requested_at<at_time-interval '1 day';
  SELECT count(*) FILTER (WHERE requested_at>at_time-interval '1 minute'),count(*) INTO per_minute,per_day FROM public.offer_copy_usage WHERE admin_id=who;
  IF per_minute>=12 OR per_day>=100 THEN RETURN false; END IF;
  INSERT INTO public.offer_copy_usage(admin_id,requested_at) VALUES(who,at_time);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_offer_copy_allow() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_offer_copy_allow() TO authenticated;
