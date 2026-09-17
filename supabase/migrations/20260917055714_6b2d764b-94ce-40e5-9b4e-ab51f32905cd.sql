-- Atomic batch claim for the autonomous drafting queue.
CREATE OR REPLACE FUNCTION public.content_claim_opportunities(
  _max integer,
  _daily_cap integer,
  _max_attempts integer DEFAULT 3,
  _stale_seconds integer DEFAULT 600
)
RETURNS TABLE(id uuid, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_used integer;
  v_budget integer;
BEGIN
  -- Release claims abandoned by a crashed or timed-out run.
  UPDATE public.content_opportunities o
     SET status = 'proposed'
   WHERE o.status = 'drafting'
     AND (o.last_attempt_at IS NULL
          OR o.last_attempt_at < now() - make_interval(secs => _stale_seconds));

  SELECT count(*) INTO v_used
    FROM public.posts p
   WHERE p.opportunity_id IS NOT NULL
     AND p.created_at > now() - interval '24 hours';

  v_budget := least(greatest(coalesce(_max, 0), 0),
                    greatest(coalesce(_daily_cap, 0) - v_used, 0));

  IF v_budget <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.content_opportunities o
     SET status = 'drafting',
         attempts = o.attempts + 1,
         last_attempt_at = now()
   WHERE o.id IN (
     SELECT o2.id
       FROM public.content_opportunities o2
      WHERE o2.status = 'proposed'
        AND o2.attempts < _max_attempts
      ORDER BY o2.opportunity_score DESC
      LIMIT v_budget
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.id, o.attempts;
END;
$$;

-- Atomic single-opportunity claim so two runs cannot draft the same idea.
CREATE OR REPLACE FUNCTION public.content_claim_opportunity(
  _id uuid,
  _stale_seconds integer DEFAULT 600
)
RETURNS TABLE(id uuid, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.content_opportunities o
     SET status = 'drafting',
         attempts = o.attempts + 1,
         last_attempt_at = now()
   WHERE o.id = _id
     AND o.status NOT IN ('queued', 'published')
     AND (o.status <> 'drafting'
          OR o.last_attempt_at IS NULL
          OR o.last_attempt_at < now() - make_interval(secs => _stale_seconds))
  RETURNING o.id, o.attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.content_claim_opportunities(integer, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.content_claim_opportunity(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.content_claim_opportunities(integer, integer, integer, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.content_claim_opportunity(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.content_claim_opportunities(integer, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.content_claim_opportunity(uuid, integer) TO service_role;