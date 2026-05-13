-- Phase 20: posted_date generated column for day-level multi-sort.
--
-- posted_at is timestamptz with second-level precision. When used as a
-- multi-sort primary key every reel has a unique timestamp, so any secondary
-- sort (e.g. comments) never fires as a tiebreaker.
--
-- This generated column buckets by UTC calendar day, making "day + comments"
-- or "day + views" multi-sort work as expected. The column is virtual
-- (STORED) so it stays in sync automatically with no app logic needed.
--
-- Run once in Supabase SQL editor. Safe to re-run (IF NOT EXISTS guards).

ALTER TABLE scraped_reels
  ADD COLUMN IF NOT EXISTS posted_date DATE
    GENERATED ALWAYS AS ((posted_at AT TIME ZONE 'UTC')::date) STORED;

CREATE INDEX IF NOT EXISTS idx_scraped_reels_client_posted_date
  ON scraped_reels (client_id, posted_date DESC NULLS LAST);

COMMENT ON COLUMN scraped_reels.posted_date IS
  'UTC calendar date of posted_at. Use for day-level multi-sort (e.g. day + comments) '
  'to avoid the timestamp-precision problem where every reel has a unique posted_at.';
