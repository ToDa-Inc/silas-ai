"""Pydantic models for client onboarding state machine."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

OnboardingStep = Literal[
    "workspace",
    "quiz",
    "source",
    "strategy_docs",
    "pipeline",
    "reel_review",
    "first_content",
    "editor",
    "action_plan",
    "tour",
    "done",
]

OnboardingStatus = Literal["in_progress", "completed", "abandoned"]


class OnboardingQuizAnswers(BaseModel):
    """Structured quiz payload stored on onboarding state."""

    model_config = ConfigDict(extra="allow")

    niche_summary: Optional[str] = None
    target_audience: Optional[str] = None
    content_goals: Optional[List[str]] = None
    brand_voice: Optional[str] = None
    offers: Optional[str] = None
    competitor_hints: Optional[List[str]] = None
    language: Optional[str] = None


class OnboardingStatusOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    client_id: str
    status: OnboardingStatus
    current_step: OnboardingStep
    completed_steps: List[str] = Field(default_factory=list)
    quiz_answers: Dict[str, Any] = Field(default_factory=dict)
    pipeline_progress: Dict[str, Any] = Field(default_factory=dict)
    ig_prefill: Dict[str, Any] = Field(default_factory=dict)
    voice_transcript: Dict[str, Any] = Field(default_factory=dict)
    context_preview_locked: bool = False
    job_ids: Dict[str, Any] = Field(default_factory=dict)
    selected_reel_id: Optional[str] = None
    selected_analysis_id: Optional[str] = None
    selected_generation_session_id: Optional[str] = None
    action_plan: Optional[Dict[str, Any]] = None
    last_error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    aha_completed_at: Optional[str] = None
    updated_at: Optional[str] = None
    aha_complete: bool = False


class OnboardingStatusPatch(BaseModel):
    status: Optional[OnboardingStatus] = None
    current_step: Optional[OnboardingStep] = None
    complete_step: Optional[OnboardingStep] = None
    quiz_answers: Optional[Dict[str, Any]] = None
    selected_reel_id: Optional[str] = None
    selected_analysis_id: Optional[str] = None
    selected_generation_session_id: Optional[str] = None
    mark_aha_complete: Optional[bool] = None


class ReelFeedbackItem(BaseModel):
    scraped_reel_id: str = Field(..., min_length=1)
    verdict: Literal["yes", "no"]
    reason: Optional[str] = Field(None, max_length=500)
    reel_analysis_id: Optional[str] = None


class ReelFeedbackBatchBody(BaseModel):
    items: List[ReelFeedbackItem] = Field(..., min_length=1, max_length=20)


class ReelCandidateOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reel: Dict[str, Any]
    analysis: Optional[Dict[str, Any]] = None
    score: float = 0.0
    already_voted: Optional[str] = None


class FirstContentStartBody(BaseModel):
    scraped_reel_id: str = Field(..., min_length=1)
    format_key: Optional[str] = Field(
        None,
        description="text_overlay | b_roll_reel | talking_head | carousel; default from analysis",
    )
