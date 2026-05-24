-- Phase 29: Persist AI variant alternates per generation session.
--
-- Today, "regenerate" gives you ONE option — to see another you regenerate
-- again and lose the previous. Real iteration is "show me 5 options, pick one";
-- Phase F (variant viewer) wires that into the inspector. This migration adds
-- the storage layer.
--
-- Shape (JSONB):
--   {
--     "hook":   [ { id, text, source, created_at } , ... ],
--     "blocks": [ { id, text, source, created_at } , ... ],
--     "cover":  [ { id, text, source, created_at } , ... ],
--     "caption":[ { id, text, source, created_at } , ... ]
--   }
--
-- Each element kind keeps a small ring of recent options (capped by the API
-- to ~5) plus a `source` discriminator (`"auto"` from the initial generation,
-- `"variants"` from explicit variant calls, `"refine"` from AI refine outputs)
-- and timestamps for UI sorting.
--
-- The currently-committed value lives in its native column (session.hooks[0],
-- session.cover_text_options, etc) — `alternates` is purely the alternate
-- pool the inspector exposes for one-click swap.

ALTER TABLE generation_sessions
  ADD COLUMN IF NOT EXISTS alternates jsonb;

COMMENT ON COLUMN generation_sessions.alternates IS
  'Per-element-kind variant pool for the Studio inspector. Shape:
   { "hook" | "blocks" | "cover" | "caption": [ { id, text, source, created_at } ] }.
   Capped to ~5 entries per kind by the variants endpoint; user-pinned ids
   are preserved across regeneration.';

CREATE INDEX IF NOT EXISTS idx_generation_sessions_alternates
  ON generation_sessions (client_id)
  WHERE alternates IS NOT NULL;
