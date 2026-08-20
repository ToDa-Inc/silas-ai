-- Phase 33: Once-per-day opportunity picks snapshot for the home dashboard.

CREATE TABLE IF NOT EXISTS client_daily_opportunities (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  pick_date date NOT NULL,
  fresh_niche_reel_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  competitor_win_reel_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'cron',
  UNIQUE (client_id, pick_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_opps_client_date
  ON client_daily_opportunities (client_id, pick_date);

COMMENT ON TABLE client_daily_opportunities IS
  'Daily snapshot of home-feed opportunity reel IDs; first writer per client+date wins.';
