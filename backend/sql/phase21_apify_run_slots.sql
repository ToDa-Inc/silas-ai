-- Global Apify actor concurrency slots (shared across API + worker replicas).
-- Apply in Supabase SQL Editor after deploy. Required for services.apify.run_actor slot limiter
-- when APIFY_MAX_CONCURRENT_RUNS > 0.

CREATE TABLE IF NOT EXISTS public.apify_run_slots (
  slot_no integer PRIMARY KEY CHECK (slot_no >= 1 AND slot_no <= 32),
  holder_id text,
  actor_id text,
  acquired_at timestamptz,
  heartbeat_at timestamptz
);

COMMENT ON TABLE public.apify_run_slots IS
  'Fixed slots 1..32; holder_id identifies one in-flight run_actor() call. Stale rows are cleared by claim_apify_run_slot.';

INSERT INTO public.apify_run_slots (slot_no)
SELECT g FROM generate_series(1, 32) AS g
ON CONFLICT (slot_no) DO NOTHING;

-- Clear stale holders, then claim one free slot with slot_no <= p_max_slots.
CREATE OR REPLACE FUNCTION public.claim_apify_run_slot(
  p_max_slots integer,
  p_holder_id text,
  p_actor_id text,
  p_stale_after_seconds integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot integer;
BEGIN
  IF p_max_slots IS NULL OR p_max_slots < 1 THEN
    RETURN NULL;
  END IF;

  UPDATE public.apify_run_slots
  SET
    holder_id = NULL,
    actor_id = NULL,
    acquired_at = NULL,
    heartbeat_at = NULL
  WHERE holder_id IS NOT NULL
    AND COALESCE(heartbeat_at, acquired_at, now())
        < (now() - make_interval(secs => GREATEST(p_stale_after_seconds, 60)));

  WITH picked AS (
    SELECT s.slot_no
    FROM public.apify_run_slots s
    WHERE s.slot_no <= LEAST(p_max_slots, 32)
      AND s.holder_id IS NULL
    ORDER BY s.slot_no
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.apify_run_slots s
  SET
    holder_id = p_holder_id,
    actor_id = p_actor_id,
    acquired_at = now(),
    heartbeat_at = now()
  FROM picked p
  WHERE s.slot_no = p.slot_no
  RETURNING s.slot_no INTO v_slot;

  RETURN v_slot;
END;
$$;

COMMENT ON FUNCTION public.claim_apify_run_slot(integer, text, text, integer) IS
  'Atomically clears stale slots and claims one free slot <= p_max_slots. Returns slot_no or NULL.';

CREATE OR REPLACE FUNCTION public.release_apify_run_slot(p_holder_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.apify_run_slots
  SET
    holder_id = NULL,
    actor_id = NULL,
    acquired_at = NULL,
    heartbeat_at = NULL
  WHERE holder_id = p_holder_id;
END;
$$;

COMMENT ON FUNCTION public.release_apify_run_slot(text) IS
  'Releases the slot held by p_holder_id (idempotent).';

GRANT EXECUTE ON FUNCTION public.claim_apify_run_slot(integer, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_apify_run_slot(text) TO service_role;
