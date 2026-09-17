-- 1. Subscriber confirmation-send bookkeeping
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS last_confirmation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_send_count integer NOT NULL DEFAULT 0;

-- 2. Durable rate-limit buckets (service-role only; never exposed publicly)
CREATE TABLE IF NOT EXISTS public.newsletter_rate_limits (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.newsletter_rate_limits TO service_role;
ALTER TABLE public.newsletter_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: anon/authenticated have no access at all.

CREATE INDEX IF NOT EXISTS newsletter_rate_limits_window_idx
  ON public.newsletter_rate_limits (window_start);

-- 3. Atomic rate-limit hit. Returns TRUE when the caller is allowed.
CREATE OR REPLACE FUNCTION public.newsletter_rate_limit_hit(
  _key text,
  _limit integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO public.newsletter_rate_limits (bucket_key, window_start, hits, updated_at)
  VALUES (_key, now(), 1, now())
  ON CONFLICT (bucket_key) DO UPDATE
    SET hits = CASE
          WHEN public.newsletter_rate_limits.window_start < now() - make_interval(secs => _window_seconds)
            THEN 1
          ELSE public.newsletter_rate_limits.hits + 1
        END,
        window_start = CASE
          WHEN public.newsletter_rate_limits.window_start < now() - make_interval(secs => _window_seconds)
            THEN now()
          ELSE public.newsletter_rate_limits.window_start
        END,
        updated_at = now()
  RETURNING hits INTO v_hits;

  RETURN v_hits <= _limit;
END;
$$;

-- 4. Atomic public subscribe. Returns the resulting state plus a token only
-- when a confirmation email is actually due to be sent.
CREATE OR REPLACE FUNCTION public.newsletter_public_subscribe(
  _email text,
  _source text,
  _cooldown_seconds integer
) RETURNS TABLE(state text, token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text;
  v_last timestamptz;
  v_token uuid;
BEGIN
  INSERT INTO public.newsletter_subscribers (email, status, confirm_token, source)
  VALUES (_email, 'pending', gen_random_uuid(), _source)
  ON CONFLICT (email) DO NOTHING
  RETURNING id, confirm_token INTO v_id, v_token;

  IF v_id IS NOT NULL THEN
    UPDATE public.newsletter_subscribers
      SET last_confirmation_sent_at = now(),
          confirmation_send_count = confirmation_send_count + 1
      WHERE id = v_id;
    RETURN QUERY SELECT 'confirmation_due'::text, v_token;
    RETURN;
  END IF;

  -- Existing row: lock it so concurrent requests serialize.
  SELECT id, status, last_confirmation_sent_at, confirm_token
    INTO v_id, v_status, v_last, v_token
    FROM public.newsletter_subscribers
    WHERE email = _email
    FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT 'error'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_status = 'confirmed' THEN
    RETURN QUERY SELECT 'already_subscribed'::text, NULL::uuid;
    RETURN;
  END IF;

  -- Never resurrect suppressed recipients through the public endpoint.
  IF v_status IN ('bounced', 'complained') THEN
    RETURN QUERY SELECT 'suppressed'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_last IS NOT NULL
     AND v_last > now() - make_interval(secs => _cooldown_seconds) THEN
    RETURN QUERY SELECT 'cooldown'::text, NULL::uuid;
    RETURN;
  END IF;

  -- pending or unsubscribed (explicit re-opt-in): issue a fresh token.
  v_token := gen_random_uuid();
  UPDATE public.newsletter_subscribers
    SET status = 'pending',
        confirm_token = v_token,
        unsubscribed_at = NULL,
        source = COALESCE(_source, source),
        last_confirmation_sent_at = now(),
        confirmation_send_count = confirmation_send_count + 1
    WHERE id = v_id;

  RETURN QUERY SELECT 'confirmation_due'::text, v_token;
END;
$$;

-- 5. newsletter_sends: idempotency + claim bookkeeping
ALTER TABLE public.newsletter_sends
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.validate_newsletter_send_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('preview', 'sending', 'sent', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid newsletter_sends status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Atomic claim of a week's send. Only one caller can transition
-- preview -> sending, so retries and overlapping runs cannot resend.
CREATE OR REPLACE FUNCTION public.newsletter_claim_send(
  _week_key text,
  _stale_seconds integer DEFAULT 3600
) RETURNS TABLE(
  id uuid,
  subject text,
  intro text,
  post_blurbs jsonb,
  post_ids uuid[],
  idempotency_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  SELECT ns.idempotency_key INTO v_key
    FROM public.newsletter_sends ns
    WHERE ns.week_key = _week_key;

  IF v_key IS NULL THEN
    v_key := 'nl-' || _week_key;
  END IF;

  RETURN QUERY
  UPDATE public.newsletter_sends ns
     SET status = 'sending',
         claimed_at = now(),
         idempotency_key = v_key
   WHERE ns.week_key = _week_key
     AND (
       ns.status = 'preview'
       OR (ns.status = 'sending'
           AND ns.claimed_at < now() - make_interval(secs => _stale_seconds))
     )
  RETURNING ns.id, ns.subject, ns.intro, ns.post_blurbs, ns.post_ids, ns.idempotency_key;
END;
$$;

-- 7. Keep all of these off the public API surface.
REVOKE ALL ON FUNCTION public.newsletter_rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.newsletter_public_subscribe(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.newsletter_claim_send(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.newsletter_rate_limit_hit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.newsletter_public_subscribe(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.newsletter_claim_send(text, integer) TO service_role;