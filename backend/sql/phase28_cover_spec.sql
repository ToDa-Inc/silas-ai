-- Phase 28: Persist the cover/thumbnail editor state on generation_sessions.
--
-- Before this migration, the cover style (template / theme / layout / appearance /
-- crop / zoom / wash) lived only in React state and was reset to defaults on every
-- page mount. Only the rendered thumbnail PNG (`thumbnail_url`) survived a refresh,
-- which meant users silently lost their styling choices the moment they navigated
-- away from the editor.
--
-- We now mirror the video_spec pattern: a JSONB column the editor hydrates from,
-- PATCHes on commit (debounced), and the cover render endpoints read as the
-- source of truth when no body overrides are provided.

ALTER TABLE generation_sessions
  ADD COLUMN IF NOT EXISTS cover_spec jsonb;

COMMENT ON COLUMN generation_sessions.cover_spec IS
  'Persisted cover editor state: { cropY, zoom, wash, templateId, themeId, textTreatment, layout, appearance, hookText }.
   Source of truth for the cover editor; thumbnail_url is a derived artifact.';

CREATE INDEX IF NOT EXISTS idx_generation_sessions_cover_spec
  ON generation_sessions (client_id)
  WHERE cover_spec IS NOT NULL;
