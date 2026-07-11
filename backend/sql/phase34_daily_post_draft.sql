-- Phase 34: One canonical daily post draft per client (script-ready session).

ALTER TABLE client_daily_opportunities
  ADD COLUMN IF NOT EXISTS primary_reel_id text,
  ADD COLUMN IF NOT EXISTS daily_session_id text,
  ADD COLUMN IF NOT EXISTS draft_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS draft_error text,
  ADD COLUMN IF NOT EXISTS draft_attempted_at timestamptz;

COMMENT ON COLUMN client_daily_opportunities.primary_reel_id IS
  'Single hero pick for today — competitor win preferred, else fresh niche.';
COMMENT ON COLUMN client_daily_opportunities.daily_session_id IS
  'generation_sessions id for today''s 1:1 url_adapt draft when ready.';
COMMENT ON COLUMN client_daily_opportunities.draft_status IS
  'pending | ready | failed | skipped';
