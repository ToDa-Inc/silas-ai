-- Phase 27 — Per-client bookmark flag on scraped_reels (Intelligence "star" / replicate shortlist).
-- Run once in Supabase SQL editor. Safe to re-run.

ALTER TABLE scraped_reels
  ADD COLUMN IF NOT EXISTS is_bookmarked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN scraped_reels.is_bookmarked IS
  'User-set shortlist for reels to replicate; preserved across upserts that omit this column.';

CREATE INDEX IF NOT EXISTS idx_scraped_reels_client_bookmarked
  ON scraped_reels (client_id, is_bookmarked)
  WHERE is_bookmarked = true;
