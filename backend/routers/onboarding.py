"""Client onboarding state machine API."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from supabase import Client

from core.config import Settings, get_settings
from core.database import get_supabase
from core.deps import require_org_access, resolve_client_id
from core.id_generator import generate_job_id
from models.generation import GenerationStartBody
from models.onboarding import (
    FirstContentStartBody,
    OnboardingStatusOut,
    OnboardingStatusPatch,
    ReelCandidateOut,
    ReelFeedbackBatchBody,
)
from services.job_queue import fail_abandoned_queued_jobs, has_active_job
from services.onboarding_action_plan import generate_action_plan
from services.onboarding_candidates import list_onboarding_reel_candidates
from services.onboarding_state import (
    apply_quiz_to_client,
    ensure_onboarding_state,
    generate_onboarding_feedback_id,
    get_onboarding_state,
    update_onboarding_state,
)
from services.client_dna_compile import maybe_recompile_client_dna

router = APIRouter(prefix="/api/v1/clients", tags=["onboarding"])
logger = logging.getLogger(__name__)


class PipelineStartOut(BaseModel):
    job_id: str
    already_running: bool = False


_PIPELINE_TERMINAL_PHASES = {"complete", "failed"}


def _reconcile_stuck_pipeline(supabase: Client, client_id: str, row: Dict[str, Any]) -> Dict[str, Any]:
    """Self-heal ``pipeline_progress`` if the underlying job died without updating it.

    A job can fail outside of its own try/except (e.g. a worker picks it up but
    doesn't recognize the job type, or the job row is abandoned/stale) and never
    calls back into ``update_onboarding_state``. When that happens the client
    stays stuck showing "queued"/"in progress" forever even though nothing is
    running anymore. We check the referenced job row on every status poll and
    patch the state to "failed" (with a real error message + retry path) if
    it's actually dead.
    """
    pp = row.get("pipeline_progress") or {}
    phase = pp.get("phase")
    job_id = (row.get("job_ids") or {}).get("pipeline")
    if not phase or phase in _PIPELINE_TERMINAL_PHASES or not job_id:
        return row
    try:
        res = (
            supabase.table("background_jobs")
            .select("status,error_message,created_at")
            .eq("id", job_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return row
    jobs = res.data or []
    if not jobs:
        return row
    job = jobs[0]
    job_status = job.get("status")
    is_dead = job_status == "failed"
    if not is_dead and job_status == "queued":
        # Never claimed by any worker after a while -> treat as dead so the
        # user gets a retry button instead of an infinite spinner.
        created_at = job.get("created_at")
        if created_at:
            try:
                created = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
                is_dead = (datetime.now(timezone.utc) - created) > timedelta(minutes=5)
            except ValueError:
                is_dead = False
    if not is_dead:
        return row
    err = job.get("error_message") or "Discovery job stopped unexpectedly."
    return update_onboarding_state(
        supabase,
        client_id,
        pipeline_progress={"phase": "failed", "error": err[:2000]},
        last_error=err[:2000],
    )


@router.get("/{slug}/onboarding/status", response_model=OnboardingStatusOut)
def onboarding_status(
    slug: str,
    client_id: Annotated[str, Depends(resolve_client_id)],
    supabase: Annotated[Client, Depends(get_supabase)],
) -> Dict[str, Any]:
    _ = slug
    row = ensure_onboarding_state(supabase, client_id)
    row = _reconcile_stuck_pipeline(supabase, client_id, row)
    return row


@router.patch("/{slug}/onboarding/status", response_model=OnboardingStatusOut)
def patch_onboarding_status(
    slug: str,
    body: OnboardingStatusPatch,
    client_id: Annotated[str, Depends(resolve_client_id)],
    supabase: Annotated[Client, Depends(get_supabase)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Dict[str, Any]:
    _ = slug
    if body.quiz_answers:
        apply_quiz_to_client(supabase, client_id, body.quiz_answers)
        maybe_recompile_client_dna(settings, supabase, client_id, force=False)

    row = update_onboarding_state(
        supabase,
        client_id,
        status=body.status,
        current_step=body.current_step,
        complete_step=body.complete_step,
        quiz_answers=body.quiz_answers,
        selected_reel_id=body.selected_reel_id,
        selected_analysis_id=body.selected_analysis_id,
        selected_generation_session_id=body.selected_generation_session_id,
        mark_aha_complete=bool(body.mark_aha_complete),
    )
    return row


@router.post("/{slug}/onboarding/pipeline/start", response_model=PipelineStartOut)
def start_onboarding_pipeline(
    slug: str,
    org_id: Annotated[str, Depends(require_org_access)],
    client_id: Annotated[str, Depends(resolve_client_id)],
    supabase: Annotated[Client, Depends(get_supabase)],
) -> Dict[str, Any]:
    _ = slug
    fail_abandoned_queued_jobs(supabase, client_id=client_id, job_type="onboarding_pipeline")
    if has_active_job(supabase, client_id=client_id, job_type="onboarding_pipeline"):
        res = (
            supabase.table("background_jobs")
            .select("id")
            .eq("client_id", client_id)
            .eq("job_type", "onboarding_pipeline")
            .in_("status", ["queued", "running"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            return {"job_id": str(res.data[0]["id"]), "already_running": True}
        raise HTTPException(status_code=409, detail="Pipeline already running")

    jid = generate_job_id()
    supabase.table("background_jobs").insert(
        {
            "id": jid,
            "org_id": org_id,
            "client_id": client_id,
            "job_type": "onboarding_pipeline",
            "payload": {},
            "status": "queued",
            "priority": 30,
        }
    ).execute()
    update_onboarding_state(
        supabase,
        client_id,
        current_step="pipeline",
        pipeline_progress={"phase": "queued", "job_id": jid},
        job_ids_patch={"pipeline": jid},
    )
    return {"job_id": jid, "already_running": False}


@router.post("/{slug}/onboarding/ig-prefill/start", response_model=PipelineStartOut)
def start_onboarding_ig_prefill(
    slug: str,
    org_id: Annotated[str, Depends(require_org_access)],
    client_id: Annotated[str, Depends(resolve_client_id)],
    supabase: Annotated[Client, Depends(get_supabase)],
) -> Dict[str, Any]:
    """Best-effort: quick IG read to draft quiz/source answers ahead of those steps."""
    _ = slug
    fail_abandoned_queued_jobs(supabase, client_id=client_id, job_type="onboarding_ig_prefill")
    if has_active_job(supabase, client_id=client_id, job_type="onboarding_ig_prefill"):
        res = (
            supabase.table("background_jobs")
            .select("id")
            .eq("client_id", client_id)
            .eq("job_type", "onboarding_ig_prefill")
            .in_("status", ["queued", "running"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            return {"job_id": str(res.data[0]["id"]), "already_running": True}

    jid = generate_job_id()
    supabase.table("background_jobs").insert(
        {
            "id": jid,
            "org_id": org_id,
            "client_id": client_id,
            "job_type": "onboarding_ig_prefill",
            "payload": {},
            "status": "queued",
            "priority": 40,
        }
    ).execute()
    update_onboarding_state(
        supabase,
        client_id,
        ig_prefill_patch={"status": "pending"},
        job_ids_patch={"ig_prefill": jid},
    )
    return {"job_id": jid, "already_running": False}


@router.get("/{slug}/onboarding/reel-candidates", response_model=List[ReelCandidateOut])
def reel_candidates(
    slug: str,
    client_id: Annotated[str, Depends(resolve_client_id)],
    supabase: Annotated[Client, Depends(get_supabase)],
) -> List[Dict[str, Any]]:
    _ = slug
    return list_onboarding_reel_candidates(supabase, client_id)


@router.post("/{slug}/onboarding/reel-feedback")
def post_reel_feedback(
    slug: str,
    body: ReelFeedbackBatchBody,
    client_id: Annotated[str, Depends(resolve_client_id)],
    supabase: Annotated[Client, Depends(get_supabase)],
) -> Dict[str, Any]:
    _ = slug
    saved = 0
    for item in body.items:
        row = {
            "id": generate_onboarding_feedback_id(),
            "client_id": client_id,
            "scraped_reel_id": item.scraped_reel_id,
            "verdict": item.verdict,
            "reason": item.reason,
            "reel_analysis_id": item.reel_analysis_id,
        }
        supabase.table("onboarding_reel_feedback").upsert(
            row,
            on_conflict="client_id,scraped_reel_id",
        ).execute()
        saved += 1
    return {"saved": saved}


@router.post("/{slug}/onboarding/first-content/start")
def start_first_content(
    slug: str,
    body: FirstContentStartBody,
    client_id: Annotated[str, Depends(resolve_client_id)],
    supabase: Annotated[Client, Depends(get_supabase)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Dict[str, Any]:
    """Start generation session from approved onboarding reel (url_adapt)."""
    _ = slug
    from routers.generation import generation_start

    reel_res = (
        supabase.table("scraped_reels")
        .select("id, post_url")
        .eq("client_id", client_id)
        .eq("id", body.scraped_reel_id)
        .limit(1)
        .execute()
    )
    if not reel_res.data:
        raise HTTPException(status_code=404, detail="Reel not found")
    reel = reel_res.data[0]
    post_url = str(reel.get("post_url") or "").strip()
    if not post_url:
        raise HTTPException(status_code=400, detail="Reel has no post_url")

    analysis_id: Optional[str] = None
    ar = (
        supabase.table("reel_analyses")
        .select("id")
        .eq("client_id", client_id)
        .eq("reel_id", body.scraped_reel_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if ar.data:
        analysis_id = str(ar.data[0]["id"])

    gen_body = GenerationStartBody(
        source_type="url_adapt",
        url=post_url,
        format_key=body.format_key,
        extra_instruction="First onboarding content — adapt this approved outlier closely.",
    )
    session = generation_start(
        slug,
        gen_body,
        client_id=client_id,
        supabase=supabase,
        settings=settings,
    )

    update_onboarding_state(
        supabase,
        client_id,
        selected_reel_id=body.scraped_reel_id,
        selected_analysis_id=analysis_id,
        selected_generation_session_id=str(session.get("id") or ""),
        current_step="editor",
        complete_step="first_content",
    )
    return {"session": session, "reel_id": body.scraped_reel_id}


@router.post("/{slug}/onboarding/action-plan", response_model=Dict[str, Any])
def create_action_plan(
    slug: str,
    client_id: Annotated[str, Depends(resolve_client_id)],
    supabase: Annotated[Client, Depends(get_supabase)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Dict[str, Any]:
    _ = slug
    state = ensure_onboarding_state(supabase, client_id)
    crow = supabase.table("clients").select("*").eq("id", client_id).limit(1).execute()
    if not crow.data:
        raise HTTPException(status_code=404, detail="Client not found")
    client = crow.data[0]

    fb = (
        supabase.table("onboarding_reel_feedback")
        .select("scraped_reel_id, verdict")
        .eq("client_id", client_id)
        .execute()
    )
    yes_ids = [str(r["scraped_reel_id"]) for r in (fb.data or []) if r.get("verdict") == "yes"]
    no_count = sum(1 for r in (fb.data or []) if r.get("verdict") == "no")
    candidates = list_onboarding_reel_candidates(supabase, client_id, limit=20)
    yes_reels = [c for c in candidates if str((c.get("reel") or {}).get("id")) in yes_ids]

    plan = generate_action_plan(
        settings,
        client_row=client,
        onboarding_state=state,
        yes_reels=yes_reels,
        no_count=no_count,
    )
    row = update_onboarding_state(
        supabase,
        client_id,
        action_plan=plan,
        complete_step="action_plan",
        current_step="tour",
    )
    return {"action_plan": plan, "onboarding": row}
