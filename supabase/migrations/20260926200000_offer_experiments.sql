-- Optional, consented offer copy experiments. Private strategy and customer fields
-- never enter variant payloads. Existing offers and historic orders are untouched.
CREATE TABLE public.offer_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  hypothesis text NOT NULL CHECK(length(hypothesis) BETWEEN 10 AND 2000),
  metric text NOT NULL CHECK(metric IN ('free_claim','paid_order')),
  minimum_per_variant integer NOT NULL CHECK(minimum_per_variant BETWEEN 100 AND 1000000),
  minimum_days integer NOT NULL CHECK(minimum_days BETWEEN 7 AND 90),
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','running','stopped')),
  variant_a jsonb NOT NULL,
  variant_b jsonb NOT NULL,
  source_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX offer_experiments_one_running ON public.offer_experiments(offer_id) WHERE state='running';
CREATE TABLE public.offer_experiment_assignments (
  experiment_id uuid NOT NULL REFERENCES public.offer_experiments(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.conversion_sessions(id) ON DELETE CASCADE,
  variant text NOT NULL CHECK(variant IN ('a','b')),
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  exposed_at timestamptz,
  PRIMARY KEY(experiment_id,session_id)
);
CREATE INDEX offer_experiment_assignments_session ON public.offer_experiment_assignments(session_id);
ALTER TABLE public.offer_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_experiment_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offer_experiments,public.offer_experiment_assignments FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.offer_experiments,public.offer_experiment_assignments TO service_role;

CREATE FUNCTION public.offer_experiment_valid_copy(_copy jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(_copy)='object'
   AND (SELECT count(*)=3 FROM jsonb_object_keys(_copy))
   AND jsonb_typeof(_copy->'headline')='string' AND length(trim(_copy->>'headline')) BETWEEN 1 AND 300
   AND jsonb_typeof(_copy->'subheadline')='string' AND length(_copy->>'subheadline')<=1000
   AND jsonb_typeof(_copy->'ctaText')='string' AND length(trim(_copy->>'ctaText')) BETWEEN 1 AND 80,false)
$$;
ALTER TABLE public.offer_experiments ADD CONSTRAINT offer_experiments_copy CHECK(public.offer_experiment_valid_copy(variant_a) AND public.offer_experiment_valid_copy(variant_b) AND variant_a<>variant_b);

CREATE FUNCTION public.admin_offer_experiment_create(_offer_id uuid,_name text,_hypothesis text,_variant_b jsonb,_minimum_per_variant integer DEFAULT 1000,_minimum_days integer DEFAULT 14,_request_id uuid DEFAULT gen_random_uuid())
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o offers%ROWTYPE; prior offer_experiments%ROWTYPE; a jsonb; result uuid;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 IF _request_id IS NULL THEN RAISE EXCEPTION 'A save identifier is required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,714));
 SELECT * INTO prior FROM offer_experiments WHERE id=_request_id;
 IF FOUND THEN
   IF prior.offer_id IS DISTINCT FROM _offer_id OR prior.name IS DISTINCT FROM trim(_name) OR prior.hypothesis IS DISTINCT FROM trim(_hypothesis) OR prior.variant_b IS DISTINCT FROM _variant_b OR prior.minimum_per_variant IS DISTINCT FROM _minimum_per_variant OR prior.minimum_days IS DISTINCT FROM _minimum_days THEN RAISE EXCEPTION 'Save identifier belongs to different experiment content'; END IF;
   RETURN prior.id;
 END IF;
 SELECT * INTO o FROM offers WHERE id=_offer_id FOR UPDATE;
 IF NOT FOUND OR o.status<>'published' OR o.checkout_mode<>'native' OR o.funnel_only THEN RAISE EXCEPTION 'Choose a published native offer with a public claim page'; END IF;
 a:=jsonb_build_object('headline',coalesce(nullif(o.presentation#>>'{landing,headline}',''),o.title),'subheadline',coalesce(nullif(o.presentation#>>'{landing,subheadline}',''),o.summary),'ctaText',coalesce(nullif(trim(o.presentation#>>'{landing,ctaText}'),''),CASE WHEN o.kind='free' THEN CASE WHEN o.title ~* '\mkit\M' THEN 'Send Me the Kit' ELSE 'Send Me the Free Download' END ELSE 'Continue to checkout' END));
 INSERT INTO offer_experiments(id,offer_id,name,hypothesis,metric,minimum_per_variant,minimum_days,variant_a,variant_b,source_updated_at)
 VALUES(_request_id,o.id,trim(_name),trim(_hypothesis),CASE WHEN o.kind='free' THEN 'free_claim' ELSE 'paid_order' END,_minimum_per_variant,_minimum_days,a,_variant_b,o.updated_at) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.admin_offer_experiment_transition(_id uuid,_version integer,_state text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e offer_experiments%ROWTYPE; o offers%ROWTYPE;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 -- Offers are locked before experiments in every writer, including invalidation.
 SELECT o1.* INTO o FROM offers o1 JOIN offer_experiments e1 ON e1.offer_id=o1.id WHERE e1.id=_id FOR UPDATE OF o1;
 SELECT * INTO e FROM offer_experiments WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR e.version<>_version THEN RAISE EXCEPTION 'Experiment changed. Reload before continuing.'; END IF;
 IF _state='running' AND e.state='draft' THEN
   IF o.updated_at IS DISTINCT FROM e.source_updated_at OR o.status<>'published' OR o.checkout_mode<>'native' OR o.funnel_only THEN RAISE EXCEPTION 'Offer changed. Create a new experiment from its current version.'; END IF;
   UPDATE offer_experiments SET state='running',started_at=clock_timestamp(),version=version+1 WHERE id=e.id;
 ELSIF _state='stopped' AND e.state IN ('draft','running') THEN
   UPDATE offer_experiments SET state='stopped',ended_at=clock_timestamp(),end_reason='Stopped by administrator',version=version+1 WHERE id=e.id;
 ELSE RAISE EXCEPTION 'Invalid experiment transition'; END IF;
END $$;
CREATE FUNCTION public.offer_experiment_invalidate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW IS DISTINCT FROM OLD THEN
   UPDATE offer_experiments SET state='stopped',ended_at=clock_timestamp(),end_reason='Offer changed; create a new experiment',version=version+1 WHERE offer_id=NEW.id AND state='running';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER offer_experiment_invalidate AFTER UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION public.offer_experiment_invalidate();
CREATE FUNCTION public.offer_experiment_forget() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.revoked_at IS NOT NULL THEN DELETE FROM offer_experiment_assignments WHERE session_id=NEW.id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER offer_experiment_forget AFTER UPDATE OF revoked_at ON public.conversion_sessions FOR EACH ROW EXECUTE FUNCTION public.offer_experiment_forget();

CREATE FUNCTION public.offer_experiment_decide(_offer_id uuid,_session_id uuid,_token_hash text,_expose_id uuid DEFAULT NULL,_variant text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s conversion_sessions%ROWTYPE; e offer_experiments%ROWTYPE; a offer_experiment_assignments%ROWTYPE; stamp timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO s FROM conversion_sessions WHERE id=_session_id FOR UPDATE;
 IF NOT FOUND OR s.revoked_at IS NOT NULL OR s.token_hash IS DISTINCT FROM _token_hash OR s.last_seen_at<stamp-interval '30 minutes' OR s.started_at<stamp-interval '24 hours' THEN RETURN NULL; END IF;
 SELECT e1.* INTO e FROM offer_experiments e1 JOIN offers o ON o.id=e1.offer_id WHERE e1.offer_id=_offer_id AND e1.state='running' AND o.status='published' AND o.checkout_mode='native' AND NOT o.funnel_only AND o.updated_at=e1.source_updated_at FOR SHARE OF e1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF _expose_id IS NULL THEN
   INSERT INTO offer_experiment_assignments(experiment_id,session_id,variant) VALUES(e.id,s.id,CASE WHEN random()<0.5 THEN 'a' ELSE 'b' END) ON CONFLICT DO NOTHING;
 ELSE
   IF _expose_id<>e.id OR _variant NOT IN ('a','b') OR _variant IS NULL THEN RETURN NULL; END IF;
   UPDATE offer_experiment_assignments SET exposed_at=coalesce(exposed_at,stamp) WHERE experiment_id=e.id AND session_id=s.id AND variant=_variant;
 END IF;
 SELECT * INTO a FROM offer_experiment_assignments WHERE experiment_id=e.id AND session_id=s.id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('experiment_id',e.id,'variant',a.variant,'copy',CASE a.variant WHEN 'a' THEN e.variant_a ELSE e.variant_b END,'exposed',a.exposed_at IS NOT NULL);
END $$;

CREATE FUNCTION public.admin_offer_experiments() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 WITH outcomes AS (
   SELECT a.experiment_id,a.session_id,a.variant,
     EXISTS(SELECT 1 FROM offer_orders o JOIN conversion_order_links l ON l.order_id=o.id LEFT JOIN conversion_order_facts f ON f.order_id=o.id
       WHERE l.session_id=a.session_id AND o.offer_id=e.offer_id AND o.parent_order_id IS NULL AND o.created_at>=a.exposed_at AND o.created_at<coalesce(e.ended_at,'infinity') AND o.status='fulfilled'
       AND ((e.metric='free_claim' AND coalesce((SELECT i.amount_minor FROM offer_order_items i WHERE i.order_id=o.id AND i.role='primary'),o.amount_minor)=0 AND (o.amount_minor=0 OR f.payment_mode='live')) OR (e.metric='paid_order' AND o.amount_minor>0 AND f.payment_mode='live'))) converted,
     EXISTS(SELECT 1 FROM offer_orders o JOIN conversion_order_links l ON l.order_id=o.id JOIN conversion_order_facts f ON f.order_id=o.id
       WHERE l.session_id=a.session_id AND o.offer_id=e.offer_id AND o.parent_order_id IS NULL AND o.created_at>=a.exposed_at AND o.created_at<coalesce(e.ended_at,'infinity') AND o.status='fulfilled' AND o.amount_minor>0 AND f.payment_mode='test') test_paid,
     EXISTS(SELECT 1 FROM offer_orders o JOIN conversion_order_links l ON l.order_id=o.id
       WHERE l.session_id=a.session_id AND o.offer_id=e.offer_id AND o.parent_order_id IS NULL AND o.created_at>=a.exposed_at AND o.created_at<coalesce(e.ended_at,'infinity') AND o.status='refunded') refunded
   FROM offer_experiment_assignments a JOIN offer_experiments e ON e.id=a.experiment_id JOIN conversion_sessions s ON s.id=a.session_id
   WHERE a.exposed_at IS NOT NULL AND s.revoked_at IS NULL
 ), totals AS (SELECT experiment_id,variant,count(*) sessions,count(*) FILTER(WHERE converted) conversions,count(*) FILTER(WHERE test_paid) test_payments,count(*) FILTER(WHERE refunded) refunded_sessions FROM outcomes GROUP BY experiment_id,variant)
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC),'[]'::jsonb) INTO result FROM (
   SELECT e.*,o.title offer_title,o.slug offer_slug,
     coalesce((SELECT jsonb_agg(to_jsonb(t)-'experiment_id') FROM totals t WHERE t.experiment_id=e.id),'[]'::jsonb) results
   FROM offer_experiments e JOIN offers o ON o.id=e.offer_id ORDER BY e.created_at DESC LIMIT 100
 ) r;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.offer_experiment_valid_copy(jsonb),public.offer_experiment_invalidate(),public.offer_experiment_forget(),public.offer_experiment_decide(uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.offer_experiment_decide(uuid,uuid,text,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_offer_experiment_create(uuid,text,text,jsonb,integer,integer,uuid),public.admin_offer_experiment_transition(uuid,integer,text),public.admin_offer_experiments() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_offer_experiment_create(uuid,text,text,jsonb,integer,integer,uuid),public.admin_offer_experiment_transition(uuid,integer,text),public.admin_offer_experiments() TO authenticated;
