-- Global OpenRouter request pacing (shared across API + worker replicas).
-- Apply in Supabase SQL Editor. Used by backend/services/openrouter_limiter.py
-- to avoid account-wide request bursts when multiple worker/API processes score reels.

CREATE TABLE IF NOT EXISTS public.openrouter_rate_limit (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  next_allowed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.openrouter_rate_limit IS
  'Single-row account-wide request pacer for OpenRouter chat completions.';

INSERT INTO public.openrouter_rate_limit (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reserve_openrouter_request(
  p_requests_per_minute integer
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserved_at timestamptz;
  v_interval interval;
BEGIN
  IF p_requests_per_minute IS NULL OR p_requests_per_minute < 1 THEN
    RETURN now();
  END IF;

  v_interval := make_interval(secs => (60.0 / LEAST(p_requests_per_minute, 600)));

  UPDATE public.openrouter_rate_limit
  SET
    next_allowed_at = GREATEST(next_allowed_at, now()) + v_interval,
    updated_at = now()
  WHERE id = true
  RETURNING next_allowed_at - v_interval INTO v_reserved_at;

  RETURN COALESCE(v_reserved_at, now());
END;
$$;

COMMENT ON FUNCTION public.reserve_openrouter_request(integer) IS
  'Reserves the next account-wide OpenRouter request timestamp. Caller sleeps until returned timestamp.';

GRANT EXECUTE ON FUNCTION public.reserve_openrouter_request(integer) TO service_role;
