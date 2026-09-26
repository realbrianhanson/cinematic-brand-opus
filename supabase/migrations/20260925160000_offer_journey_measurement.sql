-- Optional, bounded follow-up measurement. No order IDs, access capabilities,
-- contact fields, URL fragments or arbitrary browser metadata enter event rows.
-- Existing session revocation, capability checks, RLS and 90-day retention apply.
ALTER TABLE public.conversion_measurement_config ADD COLUMN journey_started_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE public.conversion_events ADD COLUMN parent_offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL;
ALTER TABLE public.conversion_events DROP CONSTRAINT conversion_events_type_check;
ALTER TABLE public.conversion_events ADD CONSTRAINT conversion_events_type_check CHECK (
  type IN ('page_view','shop_view','offer_view','outbound_click','build_plan_created','build_prompt_copied','build_plan_downloaded','build_training_clicked','upsell_view','upsell_accept','upsell_decline')
);
ALTER TABLE public.conversion_events ADD CONSTRAINT conversion_events_journey_check CHECK (
  (type LIKE 'upsell_%' AND path='/offer-access' AND placement IS NULL AND destination IS NULL AND (parent_offer_id IS NULL OR offer_id IS NULL OR parent_offer_id<>offer_id))
  OR (type NOT LIKE 'upsell_%' AND path<>'/offer-access' AND parent_offer_id IS NULL)
);
CREATE INDEX conversion_events_journey_idx ON public.conversion_events(session_id,parent_offer_id,offer_id,created_at) WHERE type='upsell_view';
CREATE INDEX conversion_events_parent_offer_idx ON public.conversion_events(parent_offer_id) WHERE parent_offer_id IS NOT NULL;
CREATE INDEX offer_orders_fulfilled_journey_idx ON public.offer_orders(offer_id,next_offer_id) WHERE status='fulfilled' AND next_offer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.conversion_record_events(_session_id uuid,_token_hash text,_events jsonb,_attribution jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s conversion_sessions%ROWTYPE; e jsonb; stamp timestamptz:=clock_timestamp(); source_value text; medium_value text; campaign_value text; item offers%ROWTYPE;
BEGIN
  IF _session_id IS NULL OR _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' OR jsonb_typeof(_events) IS DISTINCT FROM 'array' OR jsonb_array_length(_events) NOT BETWEEN 1 AND 10 THEN RETURN false; END IF;
  -- All paths and optional fields are revalidated before touching the session.
  FOR e IN SELECT value FROM jsonb_array_elements(_events) LOOP
    IF (e->>'id') IS NULL OR (e->>'id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      OR (e->>'type') IS NULL OR (e->>'type') NOT IN ('page_view','shop_view','offer_view','outbound_click','build_plan_created','build_prompt_copied','build_plan_downloaded','build_training_clicked','upsell_view','upsell_accept','upsell_decline')
      OR (e->>'path') IS NULL OR length(e->>'path')>240
      OR (e->>'path') !~ '^/(|offer-access|shop|start-here|first-ai-build|about|speaking|support|privacy|terms|sitemap|blog(/[a-z0-9]+(-[a-z0-9]+)*)?|guides/[a-z0-9]+(-[a-z0-9]+)*|news(/[a-f0-9-]{36})?|resources(/[a-z0-9]+(-[a-z0-9]+)*){0,2}|offers/[a-z0-9]+(-[a-z0-9]+)*)$'
      OR (e->>'placement') NOT IN ('nav','hero','event','shop','offer','footer','resource','other')
      OR (e->>'destination') NOT IN ('summit','workshop','external_offer','external_resource')
      OR ((e->>'type') LIKE 'upsell_%' AND ((e->>'path')<>'/offer-access' OR (e->>'offer_id') IS NULL OR (e->>'parent_offer_id') IS NULL OR (e->>'parent_offer_id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR lower(e->>'parent_offer_id')=lower(e->>'offer_id') OR e->>'placement' IS NOT NULL))
      OR ((e->>'type') NOT LIKE 'upsell_%' AND ((e->>'path')='/offer-access' OR e->>'parent_offer_id' IS NOT NULL))
      OR ((e->>'type')='shop_view' AND (e->>'path')<>'/shop')
      OR ((e->>'type')='offer_view' AND ((e->>'offer_id') IS NULL OR (e->>'path') NOT LIKE '/offers/%'))
      OR ((e->>'type')='outbound_click' AND (e->>'destination') IS NULL)
      OR ((e->>'type')<>'outbound_click' AND (e->>'destination') IS NOT NULL)
      OR ((e->>'destination')='external_offer' AND (e->>'offer_id') IS NULL)
      OR ((e->>'type') LIKE 'build_%' AND ((e->>'path')<>'/first-ai-build' OR (e->>'project') IS NULL OR (e->>'project') NOT IN ('follow-up','inquiries','onboarding')))
      OR ((e->>'type') NOT LIKE 'build_%' AND (e->>'project') IS NOT NULL)
      OR ((e->>'type')='build_training_clicked' AND (e->>'offer_id') IS NULL)
      THEN RETURN false; END IF;
    IF e->>'offer_id' IS NOT NULL THEN
      IF (e->>'offer_id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN false; END IF;
      SELECT * INTO item FROM offers WHERE id=(e->>'offer_id')::uuid AND status='published';
      IF NOT FOUND OR ((e->>'type')='offer_view' AND (e->>'path')<>('/offers/'||item.slug)) OR ((e->>'destination')='external_offer' AND item.checkout_mode<>'external') THEN RETURN false; END IF;
    END IF;
    IF (e->>'type') LIKE 'upsell_%' AND (item.checkout_mode<>'native' OR NOT EXISTS(
      SELECT 1 FROM offers p WHERE p.id=(e->>'parent_offer_id')::uuid AND p.status='published' AND p.checkout_mode='native'
        AND (p.next_offer_id=item.id OR EXISTS (
          SELECT 1 FROM offer_orders prior WHERE prior.offer_id=p.id AND prior.next_offer_id=item.id AND prior.status='fulfilled'
        ))
    )) THEN RETURN false; END IF;
  END LOOP;
  source_value:=CASE WHEN (_attribution->>'source') ~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN _attribution->>'source' ELSE 'direct' END;
  medium_value:=CASE WHEN (_attribution->>'medium') ~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN _attribution->>'medium' ELSE 'none' END;
  campaign_value:=CASE WHEN (_attribution->>'campaign') ~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN _attribution->>'campaign' ELSE 'none' END;
  INSERT INTO conversion_sessions(id,token_hash,started_at,last_seen_at,source,medium,campaign)
    VALUES(_session_id,_token_hash,stamp,stamp,source_value,medium_value,campaign_value) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO s FROM conversion_sessions WHERE id=_session_id FOR UPDATE;
  IF s.revoked_at IS NOT NULL OR s.token_hash IS DISTINCT FROM _token_hash OR s.last_seen_at<stamp-interval '30 minutes' OR s.started_at<stamp-interval '24 hours' THEN RETURN false; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(_events) LOOP
    -- Continue/decline is an action on an actually recorded view, never a purchase.
    -- Batches retain their order so a preceding view in this same batch can qualify.
    IF (e->>'type') IN ('upsell_accept','upsell_decline') AND NOT EXISTS(
      SELECT 1 FROM conversion_events WHERE session_id=s.id AND type='upsell_view'
        AND offer_id=(e->>'offer_id')::uuid AND parent_offer_id=(e->>'parent_offer_id')::uuid AND created_at<=stamp
    ) THEN RETURN false; END IF;
    INSERT INTO conversion_events(id,session_id,created_at,type,path,offer_id,placement,destination,project,parent_offer_id)
      VALUES((e->>'id')::uuid,s.id,stamp,e->>'type',e->>'path',(e->>'offer_id')::uuid,e->>'placement',e->>'destination',e->>'project',(e->>'parent_offer_id')::uuid) ON CONFLICT(id) DO NOTHING;
  END LOOP;
  UPDATE conversion_sessions SET last_seen_at=stamp WHERE id=s.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.conversion_bind_order(_order_id uuid,_payment_mode text,_session_id uuid DEFAULT NULL,_token_hash text DEFAULT NULL)
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
  IF o.parent_order_id IS NULL THEN
    IF NOT EXISTS(SELECT 1 FROM conversion_events WHERE session_id=s.id AND type='offer_view' AND offer_id=o.offer_id AND created_at<=o.created_at) THEN RETURN false; END IF;
  ELSE
    -- Bind to the immutable preceding order's offer and next-offer snapshot.
    -- A public landing view of the child cannot stand in for seeing this step.
    IF NOT EXISTS(
      SELECT 1 FROM offer_orders parent JOIN conversion_events e ON e.parent_offer_id=parent.offer_id
      WHERE parent.id=o.parent_order_id AND parent.next_offer_id=o.offer_id
        AND e.session_id=s.id AND e.type='upsell_view' AND e.offer_id=o.offer_id AND e.created_at<=o.created_at
    ) THEN RETURN false; END IF;
  END IF;
  INSERT INTO conversion_order_links(order_id,session_id) VALUES(o.id,s.id) ON CONFLICT(order_id) DO NOTHING;
  RETURN EXISTS(SELECT 1 FROM conversion_order_links WHERE order_id=o.id AND session_id=s.id);
END $$;

-- Kept separate from the landing-page report: each denominator is a measured
-- session that saw this exact parent/child step, not total traffic or clicks.
CREATE FUNCTION public.admin_offer_journey_snapshot(_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE start_time timestamptz; end_time timestamptz:=clock_timestamp(); result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF _days IS NULL OR _days NOT IN (7,30,90) THEN RAISE EXCEPTION 'Choose 7, 30 or 90 days'; END IF;
  start_time:=(date_trunc('day',end_time AT TIME ZONE 'UTC')-make_interval(days=>_days-1)) AT TIME ZONE 'UTC';
  WITH cohort AS MATERIALIZED (
    SELECT id FROM conversion_sessions WHERE revoked_at IS NULL AND started_at>=start_time AND started_at<end_time
  ), views AS MATERIALIZED (
    SELECT e.session_id,e.parent_offer_id,e.offer_id,min(e.created_at) viewed_at
    FROM conversion_events e JOIN cohort s ON s.id=e.session_id
    WHERE e.type='upsell_view' AND e.created_at<end_time AND e.parent_offer_id IS NOT NULL AND e.offer_id IS NOT NULL
    GROUP BY e.session_id,e.parent_offer_id,e.offer_id
  ), qualified AS MATERIALIZED (
    SELECT o.id,o.offer_id,parent.offer_id parent_offer_id,o.amount_minor,l.session_id,coalesce(f.payment_mode,'unknown') payment_mode
    FROM offer_orders o JOIN offer_orders parent ON parent.id=o.parent_order_id AND parent.next_offer_id=o.offer_id
    JOIN conversion_order_links l ON l.order_id=o.id
    JOIN views v ON v.session_id=l.session_id AND v.offer_id=o.offer_id AND v.parent_offer_id=parent.offer_id AND v.viewed_at<=o.created_at
    LEFT JOIN conversion_order_facts f ON f.order_id=o.id
    WHERE o.status='fulfilled' AND o.fulfilled_at<end_time
  ), measured AS (
    SELECT v.*,
      EXISTS(SELECT 1 FROM conversion_events e WHERE e.session_id=v.session_id AND e.parent_offer_id=v.parent_offer_id AND e.offer_id=v.offer_id AND e.type='upsell_accept' AND e.created_at>=v.viewed_at AND e.created_at<end_time) continued,
      EXISTS(SELECT 1 FROM conversion_events e WHERE e.session_id=v.session_id AND e.parent_offer_id=v.parent_offer_id AND e.offer_id=v.offer_id AND e.type='upsell_decline' AND e.created_at>=v.viewed_at AND e.created_at<end_time) declined,
      EXISTS(SELECT 1 FROM qualified q WHERE q.session_id=v.session_id AND q.parent_offer_id=v.parent_offer_id AND q.offer_id=v.offer_id AND q.amount_minor=0) claimed,
      EXISTS(SELECT 1 FROM qualified q WHERE q.session_id=v.session_id AND q.parent_offer_id=v.parent_offer_id AND q.offer_id=v.offer_id AND q.amount_minor>0 AND q.payment_mode='live') paid
    FROM views v
  ), steps AS (
    SELECT m.parent_offer_id,parent.title parent_title,m.offer_id,child.title,
      count(*) view_sessions,count(*) FILTER(WHERE continued) continue_sessions,count(*) FILTER(WHERE declined) decline_sessions,
      count(*) FILTER(WHERE claimed) free_claim_sessions,count(*) FILTER(WHERE paid) paid_order_sessions
    FROM measured m JOIN offers parent ON parent.id=m.parent_offer_id JOIN offers child ON child.id=m.offer_id
    GROUP BY m.parent_offer_id,parent.title,m.offer_id,child.title
  ), native AS MATERIALIZED (
    SELECT o.*,parent.offer_id parent_offer_id,coalesce(f.payment_mode,'unknown') payment_mode
    FROM offer_orders o JOIN offer_orders parent ON parent.id=o.parent_order_id AND parent.next_offer_id=o.offer_id
    LEFT JOIN conversion_order_facts f ON f.order_id=o.id
    WHERE o.fulfilled_at>=start_time AND o.fulfilled_at<end_time AND o.status IN ('fulfilled','refunded')
  ), operational AS (
    SELECT n.parent_offer_id,parent.title parent_title,n.offer_id,child.title,
      count(*) FILTER(WHERE n.status='fulfilled' AND n.amount_minor=0) free_claims,
      count(*) FILTER(WHERE n.status='fulfilled' AND n.amount_minor>0 AND n.payment_mode='live') paid_orders,
      count(*) FILTER(WHERE n.status='fulfilled' AND n.amount_minor>0 AND n.payment_mode='test') test_paid_orders,
      count(*) FILTER(WHERE n.status='fulfilled' AND n.amount_minor>0 AND n.payment_mode='unknown') unknown_mode_paid_orders,
      count(*) FILTER(WHERE n.status='refunded') refunded_orders,
      coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY currency) FROM (
        SELECT currency,sum(amount_minor)::bigint amount_minor FROM native paid
        WHERE paid.parent_offer_id=n.parent_offer_id AND paid.offer_id=n.offer_id AND paid.status='fulfilled' AND paid.amount_minor>0 AND paid.payment_mode='live'
        GROUP BY currency
      ) r),'[]'::jsonb) revenue_by_currency
    FROM native n JOIN offers parent ON parent.id=n.parent_offer_id JOIN offers child ON child.id=n.offer_id
    GROUP BY n.parent_offer_id,parent.title,n.offer_id,child.title
  )
  SELECT jsonb_build_object(
    'generated_at',end_time,'measurement_started_at',(SELECT journey_started_at FROM conversion_measurement_config WHERE singleton),
    'range',jsonb_build_object('start',start_time,'end',end_time,'timezone','UTC'),
    'steps',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY view_sessions DESC,parent_offer_id,offer_id) FROM steps s),'[]'::jsonb),
    'native_steps',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY paid_orders DESC,parent_offer_id,offer_id) FROM operational s),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_offer_journey_snapshot(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_offer_journey_snapshot(integer) TO authenticated;
-- CREATE OR REPLACE preserves existing ACLs; restate collection/binding explicitly.
REVOKE ALL ON FUNCTION public.conversion_record_events(uuid,text,jsonb,jsonb),public.conversion_bind_order(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conversion_record_events(uuid,text,jsonb,jsonb),public.conversion_bind_order(uuid,text,uuid,text) TO service_role;

-- Follow-up-only visits do not dilute public landing-page session cohorts.
CREATE OR REPLACE FUNCTION public.admin_conversion_snapshot(_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE start_time timestamptz; end_time timestamptz:=clock_timestamp(); result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF _days IS NULL OR _days NOT IN (7,30,90) THEN RAISE EXCEPTION 'Choose 7, 30 or 90 days'; END IF;
  start_time:=(date_trunc('day',end_time AT TIME ZONE 'UTC')-make_interval(days=>_days-1)) AT TIME ZONE 'UTC';
  WITH cohort AS MATERIALIZED (SELECT s.* FROM conversion_sessions s WHERE s.revoked_at IS NULL AND s.started_at>=start_time AND s.started_at<end_time AND EXISTS(SELECT 1 FROM conversion_events public_event WHERE public_event.session_id=s.id AND public_event.type NOT LIKE 'upsell_%' AND public_event.created_at<end_time)),
  ev AS MATERIALIZED (SELECT e.* FROM conversion_events e JOIN cohort s ON s.id=e.session_id WHERE e.created_at<end_time AND e.type NOT LIKE 'upsell_%'),
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
    'first_ai_build',jsonb_build_object(
      'visit_sessions',(SELECT count(DISTINCT session_id) FROM ev WHERE path='/first-ai-build' AND type='page_view'),
      'plan_sessions',(SELECT count(DISTINCT session_id) FROM ev WHERE type='build_plan_created'),
      'copy_sessions',(SELECT count(DISTINCT session_id) FROM ev WHERE type='build_prompt_copied'),
      'download_sessions',(SELECT count(DISTINCT session_id) FROM ev WHERE type='build_plan_downloaded'),
      'training_sessions',(SELECT count(DISTINCT session_id) FROM ev WHERE type='build_training_clicked')),
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

CREATE INDEX offer_orders_fulfilled_reporting_idx ON public.offer_orders(fulfilled_at) WHERE status IN ('fulfilled','refunded');
