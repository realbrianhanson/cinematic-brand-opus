-- Optional browser observations only. Functional journey capabilities, answers,
-- customer identities, URLs and purchase claims never enter this table.
ALTER TABLE public.conversion_measurement_config ADD COLUMN funnel_started_at timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE TABLE public.funnel_journey_measurement_events (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.conversion_sessions(id) ON DELETE CASCADE,
  journey_id uuid NOT NULL,
  revision integer NOT NULL,
  step_id text NOT NULL CHECK(step_id ~ '^[a-z][a-z0-9-]{0,47}$'),
  type text NOT NULL CHECK(type IN ('step_view','step_continue','offer_handoff','provider_handoff')),
  option_id text CHECK(option_id ~ '^[a-z][a-z0-9-]{0,47}$'),
  next_step_id text CHECK(next_step_id ~ '^[a-z][a-z0-9-]{0,47}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(journey_id,revision) REFERENCES public.funnel_journey_revisions(journey_id,version),
  UNIQUE(session_id,journey_id,revision,step_id,type),
  CHECK(type='step_continue' OR (option_id IS NULL AND next_step_id IS NULL))
);
CREATE INDEX funnel_measurement_revision_idx ON public.funnel_journey_measurement_events(journey_id,revision,created_at);
ALTER TABLE public.funnel_journey_measurement_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.funnel_journey_measurement_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.funnel_journey_measurement_events TO service_role;

CREATE FUNCTION public.funnel_journey_measurement_revoke() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.revoked_at IS NOT NULL THEN DELETE FROM public.funnel_journey_measurement_events WHERE session_id=NEW.id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER funnel_measurement_revoke AFTER UPDATE OF revoked_at ON public.conversion_sessions
  FOR EACH ROW EXECUTE FUNCTION public.funnel_journey_measurement_revoke();
REVOKE ALL ON FUNCTION public.funnel_journey_measurement_revoke() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.funnel_journey_record_measurement(_session_id uuid,_token_hash text,_events jsonb,_attribution jsonb DEFAULT '{}',_consent boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e jsonb; r funnel_journey_revisions; node jsonb; s conversion_sessions; existing funnel_journey_measurement_events; target text; stamp timestamptz:=clock_timestamp();
BEGIN
  IF _consent IS DISTINCT FROM true OR _session_id IS NULL OR _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(_events) IS DISTINCT FROM 'array' OR jsonb_array_length(_events) NOT BETWEEN 1 AND 10 THEN RETURN false; END IF;
  -- Validate the entire batch before creating an optional measurement session.
  FOR e IN SELECT value FROM jsonb_array_elements(_events) LOOP
    IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(e) k WHERE k NOT IN ('id','slug','revision','step_id','type','option_id'))
      OR coalesce(e->>'id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      OR coalesce(e->>'slug','') !~ '^[a-z][a-z0-9-]{0,79}$' OR jsonb_typeof(e->'revision') IS DISTINCT FROM 'number'
      OR coalesce(e->>'revision','') !~ '^[1-9][0-9]{0,9}$' OR (e->>'revision')::numeric>2147483647
      OR coalesce(e->>'step_id','') !~ '^[a-z][a-z0-9-]{0,47}$'
      OR coalesce(e->>'type','') NOT IN ('step_view','step_continue','offer_handoff','provider_handoff') THEN RETURN false; END IF;
    SELECT rev.* INTO r FROM funnel_journey_revisions rev JOIN funnel_journeys j ON j.id=rev.journey_id
      WHERE rev.slug=e->>'slug' AND rev.version=(e->>'revision')::integer AND rev.published AND j.active;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT value INTO node FROM jsonb_array_elements(r.graph->'steps') WHERE value->>'id'=e->>'step_id';
    IF NOT FOUND THEN RETURN false; END IF;
    IF e->>'type'='step_continue' THEN
      IF node->>'kind'='end' THEN RETURN false; END IF;
      IF node->>'kind'='choice' THEN
        IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(node->'options') o WHERE o->>'id'=e->>'option_id') THEN RETURN false; END IF;
      ELSIF e ? 'option_id' THEN RETURN false; END IF;
    ELSIF e ? 'option_id' THEN RETURN false; END IF;
    IF e->>'type'='offer_handoff' AND (node->>'kind'<>'offer' OR NOT EXISTS(SELECT 1 FROM offers WHERE id=(node->>'offerId')::uuid AND status='published' AND NOT funnel_only)) THEN RETURN false; END IF;
    IF e->>'type'='provider_handoff' AND node->>'kind'<>'provider' THEN RETURN false; END IF;
  END LOOP;
  INSERT INTO conversion_sessions(id,token_hash,started_at,last_seen_at,source,medium,campaign)
    VALUES(_session_id,_token_hash,stamp,stamp,
      CASE WHEN _attribution->>'source' ~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN _attribution->>'source' ELSE 'direct' END,
      CASE WHEN _attribution->>'medium' ~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN _attribution->>'medium' ELSE 'none' END,
      CASE WHEN _attribution->>'campaign' ~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN _attribution->>'campaign' ELSE 'none' END) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO s FROM conversion_sessions WHERE id=_session_id FOR UPDATE;
  IF s.revoked_at IS NOT NULL OR s.token_hash IS DISTINCT FROM _token_hash OR s.last_seen_at<stamp-interval '30 minutes' OR s.started_at<stamp-interval '24 hours' THEN RETURN false; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(_events) LOOP
    SELECT * INTO r FROM funnel_journey_revisions WHERE slug=e->>'slug' AND version=(e->>'revision')::integer AND published;
    SELECT value INTO node FROM jsonb_array_elements(r.graph->'steps') WHERE value->>'id'=e->>'step_id';
    target:=NULL;
    IF e->>'type'='step_continue' THEN target:=CASE WHEN node->>'kind'='choice' THEN coalesce(node->'branches'->>(e->>'option_id'),node->>'defaultStepId') ELSE node->>'nextStepId' END; END IF;
    IF e->>'type'<>'step_view' AND NOT EXISTS(SELECT 1 FROM funnel_journey_measurement_events WHERE session_id=s.id AND journey_id=r.journey_id AND revision=r.version AND step_id=e->>'step_id' AND type='step_view') THEN
      RAISE EXCEPTION 'A step action requires a recorded view' USING ERRCODE='22023';
    END IF;
    SELECT * INTO existing FROM funnel_journey_measurement_events WHERE id=(e->>'id')::uuid;
    IF FOUND AND (existing.session_id<>s.id OR existing.journey_id<>r.journey_id OR existing.revision<>r.version OR existing.step_id<>e->>'step_id' OR existing.type<>e->>'type' OR existing.option_id IS DISTINCT FROM e->>'option_id') THEN
      RAISE EXCEPTION 'Measurement retry mismatch' USING ERRCODE='22023';
    END IF;
    -- First observation/action for a step is kept. Reloads, retries and repeated
    -- clicks cannot turn one measured session into several visitors/actions.
    INSERT INTO funnel_journey_measurement_events(id,session_id,journey_id,revision,step_id,type,option_id,next_step_id,created_at)
      VALUES((e->>'id')::uuid,s.id,r.journey_id,r.version,e->>'step_id',e->>'type',e->>'option_id',target,stamp) ON CONFLICT DO NOTHING;
  END LOOP;
  UPDATE conversion_sessions SET last_seen_at=stamp WHERE id=s.id;
  RETURN true;
EXCEPTION WHEN invalid_parameter_value THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.funnel_journey_record_measurement(uuid,text,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.funnel_journey_record_measurement(uuid,text,jsonb,jsonb,boolean) TO service_role;

CREATE FUNCTION public.admin_funnel_journey_measurement(_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE start_time timestamptz; end_time timestamptz:=clock_timestamp(); result jsonb;
BEGIN
  IF NOT coalesce(public.is_admin(auth.uid()),false) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF _days IS NULL OR _days NOT IN (7,30,90) THEN RAISE EXCEPTION 'Choose 7, 30 or 90 days'; END IF;
  start_time:=(date_trunc('day',end_time AT TIME ZONE 'UTC')-make_interval(days=>_days-1)) AT TIME ZONE 'UTC';
  WITH first_seen AS MATERIALIZED (
    SELECT session_id,journey_id,revision,min(created_at) started_at FROM funnel_journey_measurement_events WHERE type='step_view' GROUP BY session_id,journey_id,revision
  ), cohort AS MATERIALIZED (
    SELECT f.*, (s.last_seen_at<end_time-interval '30 minutes' OR s.started_at<end_time-interval '24 hours') settled
    FROM first_seen f JOIN conversion_sessions s ON s.id=f.session_id WHERE s.revoked_at IS NULL AND f.started_at>=start_time AND f.started_at<end_time
  ), ev AS MATERIALIZED (
    SELECT e.*,c.settled FROM funnel_journey_measurement_events e JOIN cohort c USING(session_id,journey_id,revision) WHERE e.created_at<end_time
  ), revision_list AS MATERIALIZED (
    SELECT c.journey_id,c.revision,count(*) sessions,r.slug,r.title,r.graph
    FROM cohort c JOIN funnel_journey_revisions r ON r.journey_id=c.journey_id AND r.version=c.revision
    GROUP BY c.journey_id,c.revision,r.slug,r.title,r.graph ORDER BY count(*) DESC,c.journey_id,c.revision LIMIT 20
  ), steps AS (
    SELECT r.journey_id,r.revision,n.value node,n.ordinality position FROM revision_list r CROSS JOIN LATERAL jsonb_array_elements(r.graph->'steps') WITH ORDINALITY n
  ), views AS MATERIALIZED (
    SELECT v.*, EXISTS(SELECT 1 FROM ev a WHERE a.session_id=v.session_id AND a.journey_id=v.journey_id AND a.revision=v.revision AND a.step_id=v.step_id AND a.type='step_continue') continued,
      EXISTS(SELECT 1 FROM ev a WHERE a.session_id=v.session_id AND a.journey_id=v.journey_id AND a.revision=v.revision AND a.step_id=v.step_id AND a.type IN ('offer_handoff','provider_handoff')) handoff
    FROM ev v WHERE v.type='step_view'
  ), metrics AS (
    SELECT st.journey_id,st.revision,st.position,st.node,
      count(v.id) view_sessions,count(v.id) FILTER(WHERE v.continued) continue_sessions,count(v.id) FILTER(WHERE v.handoff) handoff_sessions,
      count(v.id) FILTER(WHERE st.node->>'kind'<>'end' AND NOT v.continued AND NOT v.handoff AND v.settled) no_next_action_sessions,
      count(v.id) FILTER(WHERE st.node->>'kind'<>'end' AND NOT v.continued AND NOT v.handoff AND NOT v.settled) still_active_sessions
    FROM steps st LEFT JOIN views v ON v.journey_id=st.journey_id AND v.revision=st.revision AND v.step_id=st.node->>'id'
    GROUP BY st.journey_id,st.revision,st.position,st.node
  ) SELECT jsonb_build_object('generated_at',end_time,'measurement_started_at',(SELECT funnel_started_at FROM conversion_measurement_config WHERE singleton),
    'range',jsonb_build_object('start',start_time,'end',end_time,'timezone','UTC'),
    'revision_count',(SELECT count(*) FROM (SELECT DISTINCT journey_id,revision FROM cohort) c),
    'revisions',coalesce((SELECT jsonb_agg(jsonb_build_object('journey_id',r.journey_id,'revision',r.revision,'slug',r.slug,'title',r.title,'measured_sessions',r.sessions,
      'entry_sessions',(SELECT count(*) FROM views v WHERE v.journey_id=r.journey_id AND v.revision=r.revision AND v.step_id=r.graph->>'entryStepId'),
      'steps',(SELECT jsonb_agg(jsonb_build_object('step_id',m.node->>'id','title',m.node->>'title','kind',m.node->>'kind','view_sessions',m.view_sessions,'continue_sessions',m.continue_sessions,'handoff_sessions',m.handoff_sessions,'no_next_action_sessions',m.no_next_action_sessions,'still_active_sessions',m.still_active_sessions,
        'branches',CASE WHEN m.node->>'kind'='choice' THEN (SELECT jsonb_agg(jsonb_build_object('option_id',o->>'id','label',o->>'label','next_step_id',coalesce(m.node->'branches'->>(o->>'id'),m.node->>'defaultStepId'),'sessions',(SELECT count(*) FROM ev a WHERE a.journey_id=r.journey_id AND a.revision=r.revision AND a.step_id=m.node->>'id' AND a.type='step_continue' AND a.option_id=o->>'id'))) FROM jsonb_array_elements(m.node->'options') o) ELSE '[]'::jsonb END) ORDER BY m.position) FROM metrics m WHERE m.journey_id=r.journey_id AND m.revision=r.revision))) FROM revision_list r),'[]'::jsonb)) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_funnel_journey_measurement(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_funnel_journey_measurement(integer) TO authenticated;
