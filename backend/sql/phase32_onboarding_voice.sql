-- Phase 32: Voice onboarding transcript state on client_onboarding_state.
-- Run once in Supabase SQL editor after phase31.

ALTER TABLE client_onboarding_state
  ADD COLUMN IF NOT EXISTS voice_transcript jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN client_onboarding_state.voice_transcript IS
  'Voice onboarding progress: {status, audio_storage_path, audio_format, raw_transcript, structured_answers, edited_transcript, language, duration_s, generation_progress, at, error}.';
