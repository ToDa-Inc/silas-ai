-- Phase 33: Persist content-generation failures on generation_sessions so the UI can retry.

ALTER TABLE generation_sessions
  ADD COLUMN IF NOT EXISTS last_error text;

COMMENT ON COLUMN generation_sessions.last_error IS
  'Last content-packaging error when status stayed angles_ready; cleared on successful package/regen.';
