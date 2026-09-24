-- Count visits to the new /about page in first-party measurement.
-- Identical to conversion_record_events from 20260919220000_conversion_measurement.sql
-- except "about" is added to the allowed page paths. CREATE OR REPLACE keeps the
-- existing owner and grants.
CREATE OR REPLACE FUNCTION public.conversion_record_events(_session_id uuid,_token_hash text,_events jsonb,_attribution jsonb DEFAULT '{}'::jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s conversion_sessions%ROWTYPE; e jsonb; stamp timestamptz:=clock_timestamp(); source_value text; medium_value text; campaign_value text; item offers%ROWTYPE;
BEGIN
  IF _session_id IS NULL OR _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$' OR jsonb_typeof(_events) IS DISTINCT FROM 'array' OR jsonb_array_length(_events) NOT BETWEEN 1 AND 10 THEN RETURN false; END IF;
  -- All paths and optional fields are revalidated before touching the session.
  FOR e IN SELECT value FROM jsonb_array_elements(_events) LOOP
    IF (e->>'id') IS NULL OR (e->>'id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
      OR (e->>'type') IS NULL OR (e->>'type') NOT IN ('page_view','shop_view','offer_view','outbound_click')
      OR (e->>'path') IS NULL OR length(e->>'path')>240
      OR (e->>'path') !~ '^/(|shop|start-here|about|speaking|support|privacy|terms|sitemap|blog(/[a-z0-9]+(-[a-z0-9]+)*)?|guides/[a-z0-9]+(-[a-z0-9]+)*|news(/[a-f0-9-]{36})?|resources(/[a-z0-9]+(-[a-z0-9]+)*){0,2}|offers/[a-z0-9]+(-[a-z0-9]+)*)$'
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
