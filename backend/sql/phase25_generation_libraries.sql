-- Phase 25: Per-client generation libraries
--
-- Reusable generation assets live here instead of clients.client_context.
-- The chosen asset is still snapshotted onto generation_sessions so old
-- sessions stay stable when a client edits their library later.
-- Legacy keys are copied over, then removed from client_context so Context
-- remains source/profile material only.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS generation_libraries jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_generation_libraries_shape;

ALTER TABLE clients
  ADD CONSTRAINT clients_generation_libraries_shape
  CHECK (
    jsonb_typeof(generation_libraries) = 'object'
    AND (
      NOT (generation_libraries ? 'cta_library')
      OR jsonb_typeof(generation_libraries->'cta_library') = 'array'
    )
    AND (
      NOT (generation_libraries ? 'carousel_templates')
      OR jsonb_typeof(generation_libraries->'carousel_templates') = 'array'
    )
    AND (
      NOT (generation_libraries ? 'cover_thumbnail_templates')
      OR jsonb_typeof(generation_libraries->'cover_thumbnail_templates') = 'array'
    )
  );

COMMENT ON COLUMN clients.generation_libraries IS
  'Per-client reusable generation assets: cta_library, carousel_templates, cover_thumbnail_templates. These are edited outside client_context and snapshotted onto generation_sessions when selected.';

UPDATE clients
SET generation_libraries =
  generation_libraries
  || CASE
       WHEN NOT (generation_libraries ? 'cta_library')
            AND client_context ? 'cta_library'
       THEN jsonb_build_object('cta_library', client_context->'cta_library')
       ELSE '{}'::jsonb
     END
  || CASE
       WHEN NOT (generation_libraries ? 'carousel_templates')
            AND client_context ? 'carousel_templates'
       THEN jsonb_build_object('carousel_templates', client_context->'carousel_templates')
       ELSE '{}'::jsonb
     END
  || CASE
       WHEN NOT (generation_libraries ? 'cover_thumbnail_templates')
            AND client_context ? 'cover_thumbnail_templates'
       THEN jsonb_build_object('cover_thumbnail_templates', client_context->'cover_thumbnail_templates')
       ELSE '{}'::jsonb
     END
WHERE
  client_context ? 'cta_library'
  OR client_context ? 'carousel_templates'
  OR client_context ? 'cover_thumbnail_templates';

UPDATE clients
SET client_context =
  client_context
  - 'cta_library'
  - 'carousel_templates'
  - 'cover_thumbnail_templates'
WHERE
  client_context ? 'cta_library'
  OR client_context ? 'carousel_templates'
  OR client_context ? 'cover_thumbnail_templates';
