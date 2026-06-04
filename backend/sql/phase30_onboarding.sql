-- Phase 30: Client onboarding state machine (first-run journey → aha moment).
-- Run once in Supabase SQL editor after prior migrations.

CREATE TABLE IF NOT EXISTS client_onboarding_state (
  id                      text PRIMARY KEY,
  client_id               text NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  status                  text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  current_step            text NOT NULL DEFAULT 'quiz'
    CHECK (current_step IN (
      'workspace', 'quiz', 'source', 'strategy_docs', 'pipeline',
      'reel_review', 'first_content', 'editor', 'action_plan', 'tour', 'done'
    )),
  completed_steps         jsonb NOT NULL DEFAULT '[]'::jsonb,
  quiz_answers            jsonb NOT NULL DEFAULT '{}'::jsonb,
  pipeline_progress       jsonb NOT NULL DEFAULT '{}'::jsonb,
  job_ids                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_reel_id        text REFERENCES scraped_reels(id) ON DELETE SET NULL,
  selected_analysis_id    uuid,
  selected_generation_session_id text,
  action_plan             jsonb,
  last_error              text,
  started_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz,
  aha_completed_at        timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_onboarding_state_client
  ON client_onboarding_state (client_id);

CREATE INDEX IF NOT EXISTS idx_client_onboarding_state_aha
  ON client_onboarding_state (aha_completed_at)
  WHERE aha_completed_at IS NULL;

CREATE TABLE IF NOT EXISTS onboarding_reel_feedback (
  id                text PRIMARY KEY,
  client_id         text NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  scraped_reel_id   text NOT NULL REFERENCES scraped_reels(id) ON DELETE CASCADE,
  reel_analysis_id  uuid,
  verdict           text NOT NULL CHECK (verdict IN ('yes', 'no')),
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, scraped_reel_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_reel_feedback_client
  ON onboarding_reel_feedback (client_id, verdict);

COMMENT ON TABLE client_onboarding_state IS
  'Per-creator first-run onboarding progress. Gates dashboard until aha_completed_at is set.';

COMMENT ON TABLE onboarding_reel_feedback IS
  'User yes/no votes on candidate reels during onboarding reel_review step.';
