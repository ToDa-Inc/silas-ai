-- Phase 31: Instagram-based prefill for onboarding quiz/source questions.
-- Lets Silas draft guesses for quiz/source answers from a quick IG read,
-- started right after the workspace step, while the user is still typing.

ALTER TABLE client_onboarding_state
  ADD COLUMN IF NOT EXISTS ig_prefill jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN client_onboarding_state.ig_prefill IS
  'Best-effort draft answers inferred from the client Instagram bio/captions: {status, data, at, error}.';
