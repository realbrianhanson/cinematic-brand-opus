-- Optional audience measurement is private and separate from native order accounting.
-- No historical sessions/events or fabricated conversions are backfilled.
CREATE TABLE public.conversion_measurement_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.conversion_measurement_config(singleton) VALUES(true);
CREATE TABLE public.conversion_sessions (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  source text NOT NULL CHECK (source ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  medium text NOT NULL CHECK (medium ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  campaign text NOT NULL CHECK (campaign ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
);
CREATE INDEX conversion_sessions_started_idx ON public.conversion_sessions(started_at);
CREATE TABLE public.conversion_events (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.conversion_sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  type text NOT NULL CHECK (type IN ('page_view','shop_view','offer_view','outbound_click')),
  path text NOT NULL CHECK (length(path)<=240 AND path ~ '^/[a-z0-9/-]*$'),
  offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  placement text CHECK (placement IN ('nav','hero','event','shop','offer','footer','resource','other')),
  destination text CHECK (destination IN ('summit','workshop','external_offer','external_resource'))
);
CREATE INDEX conversion_events_session_idx ON public.conversion_events(session_id,type,offer_id,created_at);
CREATE INDEX conversion_events_offer_idx ON public.conversion_events(offer_id) WHERE offer_id IS NOT NULL;
CREATE TABLE public.conversion_order_links (
  order_id uuid PRIMARY KEY REFERENCES public.offer_orders(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.conversion_sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX conversion_order_links_session_idx ON public.conversion_order_links(session_id);
-- Operational facts have no visitor identity. They preserve once-per-order fulfillment semantics.
CREATE TABLE public.conversion_order_facts (
  order_id uuid PRIMARY KEY REFERENCES public.offer_orders(id) ON DELETE CASCADE,
  payment_mode text NOT NULL CHECK (payment_mode IN ('live','test','unknown')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  first_download_at timestamptz
);
CREATE INDEX conversion_order_facts_download_idx ON public.conversion_order_facts(first_download_at) WHERE first_download_at IS NOT NULL;
ALTER TABLE public.conversion_measurement_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_order_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_order_facts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.conversion_measurement_config,public.conversion_sessions,public.conversion_events,public.conversion_order_links,public.conversion_order_facts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.conversion_measurement_config,public.conversion_sessions,public.conversion_events,public.conversion_order_links,public.conversion_order_facts TO service_role;

CREATE FUNCTION public.conversion_record_events(_session_id uuid,_token_hash text,_events jsonb,_attribution jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s conversion_sessions%ROWTYPE; e jsonb; stamp timestamptz:=clock_timestamp(); source_value text; medium_value text; campaign_value text; item offers%ROWTYPE;
BEGIN
  IF _session_id IS NULL OR _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' OR jsonb_typeof(_events) IS DISTINCT FROM 'array' OR jsonb_array_length(_events) NOT BETWEEN 1 AND 10 THEN RETURN false; END IF;
  -- All paths and optional fields are revalidated before touching the session.
  FOR e IN SELECT value FROM jsonb_array_elements(_events) LOOP
    IF (e->>'id') IS NULL OR (e->>'id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      OR (e->>'type') IS NULL OR (e->>'type') NOT IN ('page_view','shop_view','offer_view','outbound_click')
      OR (e->>'path') IS NULL OR length(e->>'path')>240
      OR (e->>'path') !~ '^/(|shop|start-here|speaking|support|privacy|terms|sitemap|blog(/[a-z0-9]+(-[a-z0-9]+)*)?|guides/[a-z0-9]+(-[a-z0-9]+)*|news(/[a-f0-9-]{36})?|resources(/[a-z0-9]+(-[a-z0-9]+)*){0,2}|offers/[a-z0-9]+(-[a-z0-9]+)*)$'
      OR (e->>'placement') NOT IN ('nav','hero','event','shop','offer','footer','resource','other')
      OR (e->>'destination') NOT IN ('summit','workshop','external_offer','external_resource')
      OR ((e->>'type')='shop_view' AND (e->>'path')<>'/shop')
      OR ((e->>'type')='offer_view' AND ((e->>'offer_id') IS NULL OR (e->>'path') NOT LIKE '/offers/%'))
      OR ((e->>'type')='outbound_click' AND (e->>'destination') IS NULL)
      OR ((e->>'type')<>'outbound_click' AND (e->>'destination') IS NOT NULL)
      OR ((e->>'destination')='external_offer' AND (e->>'offer_id') IS NULL)
      THEN RETURN false; END IF;
    IF e->>'offer_id' IS NOT NULL THEN
      IF (e->>'offer_id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN false; END IF;
      SELECT * INTO item FROM offers WHERE id=(e->>'offer_id')::uuid AND status='published';
      IF NOT FOUND OR ((e->>'type')='offer_view' AND (e->>'path')<>('/offers/'||item.slug)) OR ((e->>'destination')='external_offer' AND item.checkout_mode<>'external') THEN RETURN false; END IF;
    END IF;
  END LOOP;
  source_value:=CASE WHEN (_attribution->>'source') ~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN _attribution->>'source' ELSE 'direct' END;
  medium_value:=CASE WHEN (_attribution->>'medium') ~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN _attribution->>'medium' ELSE 'none' END;
  campaign_value:=CASE WHEN (_attribution->>'campaign') ~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN _attribution->>'campaign' ELSE 'none' END;
  INSERT INTO conversion_sessions(id,token_hash,started_at,last_seen_at,source,medium,campaign)
    VALUES(_session_id,_token_hash,stamp,stamp,source_value,medium_value,campaign_value) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO s FROM conversion_sessions WHERE id=_session_id FOR UPDATE;
  IF s.revoked_at IS NOT NULL OR s.token_hash IS DISTINCT FROM _token_hash OR s.last_seen_at<stamp-interval '30 minutes' OR s.started_at<stamp-interval '24 hours' THEN RETURN false; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(_events) LOOP
    INSERT INTO conversion_events(id,session_id,created_at,type,path,offer_id,placement,destination)
      VALUES((e->>'id')::uuid,s.id,stamp,e->>'type',e->>'path',(e->>'offer_id')::uuid,e->>'placement',e->>'destination') ON CONFLICT(id) DO NOTHING;
  END LOOP;
  UPDATE conversion_sessions SET last_seen_at=stamp WHERE id=s.id;
  RETURN true;
END $$;

CREATE FUNCTION public.conversion_forget_session(_session_id uuid,_token_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  -- Keep only a minimal tombstone until scheduled retention, preventing an in-flight
  -- browser batch from recreating optional measurement after consent is withdrawn.
  IF _session_id IS NULL OR _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' THEN RETURN; END IF;
  -- Withdrawal can reach the database before the first delayed record request.
  INSERT INTO conversion_sessions(id,token_hash,source,medium,campaign,revoked_at)
    VALUES(_session_id,_token_hash,'direct','none','none',clock_timestamp()) ON CONFLICT(id) DO NOTHING;
  PERFORM 1 FROM conversion_sessions WHERE id=_session_id AND token_hash=_token_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE conversion_sessions SET revoked_at=coalesce(revoked_at,clock_timestamp()),source='direct',medium='none',campaign='none' WHERE id=_session_id;
  DELETE FROM conversion_events WHERE session_id=_session_id;
  DELETE FROM conversion_order_links WHERE session_id=_session_id;
END $$;

CREATE FUNCTION public.conversion_bind_order(_order_id uuid,_payment_mode text,_session_id uuid DEFAULT NULL,_token_hash text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o offer_orders%ROWTYPE; s conversion_sessions%ROWTYPE; stamp timestamptz:=clock_timestamp();
BEGIN
  SELECT * INTO o FROM offer_orders WHERE id=_order_id;
  IF NOT FOUND OR o.created_at<stamp-interval '5 minutes' OR NOT EXISTS(SELECT 1 FROM offers WHERE id=o.offer_id AND checkout_mode='native') THEN RETURN false; END IF;
  INSERT INTO conversion_order_facts(order_id,payment_mode) VALUES(o.id,'unknown') ON CONFLICT(order_id) DO NOTHING;
  IF _session_id IS NULL OR _token_hash IS NULL THEN RETURN false; END IF;
  SELECT * INTO s FROM conversion_sessions WHERE id=_session_id FOR UPDATE;
  IF NOT FOUND OR s.revoked_at IS NOT NULL OR s.token_hash IS DISTINCT FROM _token_hash OR s.last_seen_at<stamp-interval '30 minutes' OR s.started_at<stamp-interval '24 hours' OR s.started_at>o.created_at THEN RETURN false; END IF;
  -- A session cannot receive credit for an offer it never actually viewed before reservation.
  IF NOT EXISTS(SELECT 1 FROM conversion_events WHERE session_id=s.id AND type='offer_view' AND offer_id=o.offer_id AND created_at<=o.created_at) THEN RETURN false; END IF;
  INSERT INTO conversion_order_links(order_id,session_id) VALUES(o.id,s.id) ON CONFLICT(order_id) DO NOTHING;
  RETURN EXISTS(SELECT 1 FROM conversion_order_links WHERE order_id=o.id AND session_id=s.id);
END $$;

-- Only the verified Stripe webhook records a known payment mode, after its payment
-- mutation succeeds. Reservation/configuration alone cannot prove a live payment.
CREATE FUNCTION public.conversion_record_payment_mode(_order_id uuid,_payment_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF _payment_mode IS NULL OR _payment_mode NOT IN ('live','test') OR NOT EXISTS(
    SELECT 1 FROM offer_orders WHERE id=_order_id AND amount_minor>0 AND status IN ('fulfilled','refunded') AND stripe_session_id IS NOT NULL AND stripe_payment_intent_id IS NOT NULL
  ) THEN RETURN; END IF;
  INSERT INTO conversion_order_facts(order_id,payment_mode) VALUES(_order_id,_payment_mode)
    ON CONFLICT(order_id) DO UPDATE SET payment_mode=EXCLUDED.payment_mode WHERE conversion_order_facts.payment_mode='unknown';
END $$;

CREATE FUNCTION public.conversion_record_download(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM offer_orders WHERE id=_order_id AND status='fulfilled') THEN RETURN; END IF;
  INSERT INTO conversion_order_facts(order_id,payment_mode,first_download_at) VALUES(_order_id,'unknown',clock_timestamp())
    ON CONFLICT(order_id) DO UPDATE SET first_download_at=coalesce(conversion_order_facts.first_download_at,EXCLUDED.first_download_at);
END $$;

CREATE FUNCTION public.conversion_cleanup()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  DELETE FROM conversion_sessions WHERE started_at<clock_timestamp()-interval '90 days';
$$;
-- Sessions cascade-delete events and optional order attribution. Operational order mode and
-- once-per-order download facts remain tied to the order, without browser identity.
REVOKE ALL ON FUNCTION public.conversion_record_events(uuid,text,jsonb,jsonb),public.conversion_forget_session(uuid,text),public.conversion_bind_order(uuid,text,uuid,text),public.conversion_record_download(uuid),public.conversion_record_payment_mode(uuid,text),public.conversion_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conversion_record_events(uuid,text,jsonb,jsonb),public.conversion_forget_session(uuid,text),public.conversion_bind_order(uuid,text,uuid,text),public.conversion_record_download(uuid),public.conversion_record_payment_mode(uuid,text),public.conversion_cleanup() TO service_role;

CREATE FUNCTION public.admin_conversion_snapshot(_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE start_time timestamptz; end_time timestamptz:=clock_timestamp(); result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF _days IS NULL OR _days NOT IN (7,30,90) THEN RAISE EXCEPTION 'Choose 7, 30 or 90 days'; END IF;
  start_time:=(date_trunc('day',end_time AT TIME ZONE 'UTC')-make_interval(days=>_days-1)) AT TIME ZONE 'UTC';
  WITH cohort AS MATERIALIZED (SELECT * FROM conversion_sessions WHERE revoked_at IS NULL AND started_at>=start_time AND started_at<end_time),
  ev AS MATERIALIZED (SELECT e.* FROM conversion_events e JOIN cohort s ON s.id=e.session_id WHERE e.created_at<end_time),
  native AS MATERIALIZED (
    SELECT o.*,coalesce(f.payment_mode,'unknown') payment_mode FROM offer_orders o LEFT JOIN conversion_order_facts f ON f.order_id=o.id
    WHERE o.fulfilled_at>=start_time AND o.fulfilled_at<end_time AND o.status IN ('fulfilled','refunded')
  ),
  qualified AS MATERIALIZED (
    SELECT o.id,o.offer_id,o.amount_minor,l.session_id,o.fulfilled_at,coalesce(f.payment_mode,'unknown') payment_mode
    FROM offer_orders o JOIN conversion_order_links l ON l.order_id=o.id JOIN conversion_sessions s ON s.id=l.session_id LEFT JOIN conversion_order_facts f ON f.order_id=o.id
    WHERE s.revoked_at IS NULL AND o.status='fulfilled' AND o.fulfilled_at<end_time AND EXISTS(SELECT 1 FROM conversion_events e WHERE e.session_id=s.id AND e.type='offer_view' AND e.offer_id=o.offer_id AND e.created_at<=o.created_at)
  ),
  attributed AS MATERIALIZED (SELECT q.* FROM qualified q JOIN cohort s ON s.id=q.session_id),
  attributed_sessions AS MATERIALIZED (
    SELECT session_id,
      count(*) FILTER(WHERE amount_minor=0) free_claims,
      count(*) FILTER(WHERE amount_minor>0 AND payment_mode='live') paid_orders
    FROM attributed GROUP BY session_id
  ),
  session_metrics AS MATERIALIZED (
    SELECT s.*,
      EXISTS(SELECT 1 FROM ev WHERE session_id=s.id AND type='shop_view') shop,
      EXISTS(SELECT 1 FROM ev WHERE session_id=s.id AND type='offer_view') offer,
      EXISTS(SELECT 1 FROM ev WHERE session_id=s.id AND type='outbound_click') outbound,
      coalesce(a.free_claims,0) free_claims,
      coalesce(a.paid_orders,0) paid_orders
    FROM cohort s LEFT JOIN attributed_sessions a ON a.session_id=s.id
  ),
  event_offers AS MATERIALIZED (
    SELECT offer_id,
      count(DISTINCT session_id) FILTER(WHERE type='offer_view') view_sessions,
      count(DISTINCT session_id) FILTER(WHERE type='outbound_click') outbound_sessions
    FROM ev WHERE offer_id IS NOT NULL GROUP BY offer_id
  ),
  attributed_offers AS MATERIALIZED (
    SELECT offer_id,
      count(DISTINCT session_id) FILTER(WHERE amount_minor=0) free_claim_sessions,
      count(DISTINCT session_id) FILTER(WHERE amount_minor>0 AND payment_mode='live') paid_order_sessions,
      count(*) FILTER(WHERE amount_minor=0) free_claims,
      count(*) FILTER(WHERE amount_minor>0 AND payment_mode='live') paid_orders
    FROM attributed GROUP BY offer_id
  ),
  offer_metrics AS (
    SELECT o.id offer_id,o.title,o.slug,o.checkout_mode,
      coalesce(e.view_sessions,0) view_sessions,
      coalesce(e.outbound_sessions,0) outbound_sessions,
      coalesce(a.free_claim_sessions,0) free_claim_sessions,
      coalesce(a.paid_order_sessions,0) paid_order_sessions,
      coalesce(a.free_claims,0) free_claims,
      coalesce(a.paid_orders,0) paid_orders
    FROM offers o LEFT JOIN event_offers e ON e.offer_id=o.id LEFT JOIN attributed_offers a ON a.offer_id=o.id
    WHERE e.offer_id IS NOT NULL OR a.offer_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'generated_at',end_time,'measurement_started_at',(SELECT started_at FROM conversion_measurement_config WHERE singleton),
    'range',jsonb_build_object('start',start_time,'end',end_time,'timezone','UTC'),
    'summary',jsonb_build_object(
      'measured_sessions',(SELECT count(*) FROM cohort),'page_views',(SELECT count(*) FROM ev WHERE type='page_view'),
      'shop_sessions',(SELECT count(*) FROM session_metrics WHERE shop),'offer_sessions',(SELECT count(*) FROM session_metrics WHERE offer),
      'outbound_sessions',(SELECT count(*) FROM session_metrics WHERE outbound),'attributed_free_claim_sessions',(SELECT count(*) FROM session_metrics WHERE free_claims>0),
      'attributed_paid_order_sessions',(SELECT count(*) FROM session_metrics WHERE paid_orders>0)),
    'native_totals',jsonb_build_object(
      'free_claims',(SELECT count(*) FROM native WHERE status='fulfilled' AND amount_minor=0),
      'paid_orders',(SELECT count(*) FROM native WHERE status='fulfilled' AND amount_minor>0 AND payment_mode='live'),
      'test_paid_orders',(SELECT count(*) FROM native WHERE status='fulfilled' AND amount_minor>0 AND payment_mode='test'),
      'unknown_mode_paid_orders',(SELECT count(*) FROM native WHERE status='fulfilled' AND amount_minor>0 AND payment_mode='unknown'),
      'refunded_orders',(SELECT count(*) FROM native WHERE status='refunded'),
      'download_links_issued',(SELECT count(*) FROM conversion_order_facts WHERE first_download_at>=start_time AND first_download_at<end_time),
      'revenue_by_currency',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY currency) FROM (SELECT currency,sum(amount_minor)::bigint amount_minor FROM native WHERE status='fulfilled' AND amount_minor>0 AND payment_mode='live' GROUP BY currency) r),'[]'::jsonb)),
    'coverage',jsonb_build_object('session_retention_days',90,
      'unattributed_free_claims',(SELECT count(*) FROM native n WHERE status='fulfilled' AND amount_minor=0 AND NOT EXISTS(SELECT 1 FROM qualified q WHERE q.id=n.id)),
      'unattributed_paid_orders',(SELECT count(*) FROM native n WHERE status='fulfilled' AND amount_minor>0 AND payment_mode='live' AND NOT EXISTS(SELECT 1 FROM qualified q WHERE q.id=n.id))),
    'daily',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY date) FROM (
      SELECT to_char(day,'YYYY-MM-DD') date,count(s.id) sessions,count(s.id) FILTER(WHERE outbound) outbound_sessions,count(s.id) FILTER(WHERE free_claims>0) free_claim_sessions,count(s.id) FILTER(WHERE paid_orders>0) paid_order_sessions
      FROM generate_series(start_time AT TIME ZONE 'UTC',end_time AT TIME ZONE 'UTC',interval '1 day') day
      LEFT JOIN session_metrics s ON (s.started_at AT TIME ZONE 'UTC')::date=day::date GROUP BY day
    ) d),'[]'::jsonb),
    'sources',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY sessions DESC,source,medium,campaign) FROM (
      SELECT source,medium,campaign,count(*) sessions,count(*) FILTER(WHERE shop) shop_sessions,count(*) FILTER(WHERE offer) offer_sessions,count(*) FILTER(WHERE outbound) outbound_sessions,
      count(*) FILTER(WHERE free_claims>0) free_claim_sessions,count(*) FILTER(WHERE paid_orders>0) paid_order_sessions,sum(free_claims)::bigint free_claims,sum(paid_orders)::bigint paid_orders
      FROM session_metrics GROUP BY source,medium,campaign ORDER BY count(*) DESC,source,medium,campaign LIMIT 20
    ) r),'[]'::jsonb),
    'offers',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY view_sessions DESC,offer_id) FROM (SELECT * FROM offer_metrics ORDER BY view_sessions DESC,offer_id LIMIT 20) r),'[]'::jsonb),
    'placements',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY clicks DESC,placement,destination) FROM (
      SELECT coalesce(placement,'other') placement,destination,count(*) clicks,count(DISTINCT session_id) sessions FROM ev WHERE type='outbound_click'
      GROUP BY coalesce(placement,'other'),destination ORDER BY count(*) DESC,coalesce(placement,'other'),destination LIMIT 20
    ) r),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_conversion_snapshot(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_conversion_snapshot(integer) TO authenticated;

-- Fail the migration if scheduled retention cannot be installed; do not promise unscheduled cleanup.
SELECT cron.schedule('conversion-retention-daily','23 4 * * *','SELECT public.conversion_cleanup()');
