-- Phase 26: User-chosen carousel length (3–10) at session start; template = visual style only.

ALTER TABLE generation_sessions
  ADD COLUMN IF NOT EXISTS carousel_slide_count smallint
    CHECK (carousel_slide_count IS NULL OR (carousel_slide_count >= 3 AND carousel_slide_count <= 10));

COMMENT ON COLUMN generation_sessions.carousel_slide_count IS
  'Target slide count for carousel generation (3–10). Set at session start; template images cycle when count exceeds references.';
