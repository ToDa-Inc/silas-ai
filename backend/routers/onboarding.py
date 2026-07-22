"""Client onboarding state machine API."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
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
from services.job_queue import fail_abandoned_queued_jobs, fail_stale_running_jobs, has_active_job
from services.onboarding_action_plan import generate_action_plan
from services.onboarding_candidates import list_onboarding_reel_candidates
from services.onboarding_questions import ONBOARDING_VOICE_QUESTIONS, normalize_lang, question_text
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

VOICE_STORAGE_BUCKET = "client-context"
MAX_VOICE_BYTES = 24 * 1024 * 1024
ALLOWED_AUDIO_FORMATS = frozenset({"webm", "mp4", "m4a", "mp3", "wav", "ogg", "aac"})


def _run_voice_transcribe_inline(settings: Settings, job: Dict[str, Any]) -> None:
    """Run onboarding voice STT in the API process (avoids stale/remote workers on shared Supabase)."""
    from jobs.onboarding_voice_transcribe import run_onboarding_voice_transcribe

    try:
        run_onboarding_voice_transcribe(settings, job)
    except Exception:
        logger.exception("inline onboarding_voice_transcribe failed job=%s", job.get("id"))


def _run_brain_generate_inline(settings: Settings, job: Dict[str, Any]) -> None:
    from jobs.onboarding_brain_generate import run_onboarding_brain_generate

    try:
        run_onboarding_brain_generate(settings, job)
    except Exception:
        logger.exception("inline onboarding_brain_generate failed job=%s", job.get("id"))


def _run_onboarding_pipeline_inline(settings: Settings, job: Dict[str, Any]) -> None:
    """Run the full onboarding pipeline in the API process (avoids stale/remote workers on
    shared Supabase — see docstring in jobs/onboarding_pipeline.py for why this matters:
    competitor_discovery/keyword_reel_similarity used to be enqueued as separate "queued"
    rows that any worker sharing this Supabase project could steal and instantly fail)."""
    from jobs.onboarding_pipeline import run_onboarding_pipeline

    try:
        run_onboarding_pipeline(settings, job)
    except Exception:
        logger.exception("inline onboarding_pipeline failed job=%s", job.get("id"))


class PipelineStartOut(BaseModel):
    job_id: str
    already_running: bool = False


class VoiceGenerateBody(BaseModel):
    answers: Dict[str, str] = Field(..., min_length=1)


class VoiceTextBody(BaseModel):
    text: str = Field(..., min_length=40)


def _context_preview_locked(supabase: Client, client_id: str) -> bool:
    crow = supabase.table("clients").select("org_id").eq("id", client_id).limit(1).execute()
    if not crow.data:
        return False
    org_id = crow.data[0].get("org_id")
    if not org_id:
        return False
    org = supabase.table("organizations").select("plan").eq("id", org_id).limit(1).execute()
    if not org.data:
        return False
    plan = str(org.data[0].get("plan") or "free").strip().lower()
    return plan == "free"


def _enrich_onboarding_row(supabase: Client, client_id: str, row: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(row)
    out["context_preview_locked"] = _context_preview_locked(supabase, client_id)
    out["aha_complete"] = bool(out.get("aha_completed_at"))
    return out


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


_VOICE_IN_PROGRESS = frozenset({"pending", "transcribing", "queued_generate", "generating"})

_VOICE_JOB_KEY = {
    "pending": "voice_transcribe",
    "transcribing": "voice_transcribe",
    "queued_generate": "brain_generate",
    "generating": "brain_generate",
    "generate_failed": "brain_generate",
}


def _voice_job_is_dead(job: Dict[str, Any]) -> bool:
    job_status = job.get("status")
    if job_status == "failed":
        return True
    if job_status == "completed":
        return False
    ts_raw = job.get("started_at") or job.get("created_at")
    ts: Optional[datetime] = None
    if ts_raw:
        try:
            ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            ts = ts.astimezone(timezone.utc)
        except ValueError:
            ts = None
    if job_status == "running" and ts is not None:
        # Inline API jobs normally finish in under a few minutes.
        return (datetime.now(timezone.utc) - ts) > timedelta(minutes=5)
    if job_status == "queued" and ts is not None:
        return (datetime.now(timezone.utc) - ts) > timedelta(minutes=5)
    return False


def _reconcile_voice_transcript(supabase: Client, client_id: str, row: Dict[str, Any]) -> Dict[str, Any]:
    """Self-heal voice_transcript when the background job died without updating state."""
    vt = dict(row.get("voice_transcript") or {})
    phase = str(vt.get("status") or "")
    if phase not in _VOICE_IN_PROGRESS:
        return row

    job_key = _VOICE_JOB_KEY.get(phase)
    job_id = (row.get("job_ids") or {}).get(job_key or "")
    if not job_id:
        return row
    try:
        res = (
            supabase.table("background_jobs")
            .select("status,error_message,created_at,started_at")
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
    if not _voice_job_is_dead(job):
        return row
    err = str(job.get("error_message") or vt.get("generate_error") or vt.get("error") or "Voice processing stopped unexpectedly.")
    # Brain doc generation failed but transcription answers are still usable — keep review UI.
    if phase in ("generate_failed",) or (
        phase == "failed" and (vt.get("structured_answers") or vt.get("edited_answers"))
    ):
        return update_onboarding_state(
            supabase,
            client_id,
            voice_transcript_patch={
                "status": "generate_failed",
                "generate_error": err[:2000],
                "at": datetime.now(timezone.utc).isoformat(),
            },
            last_error=err[:2000],
        )
    return update_onboarding_state(
        supabase,
        client_id,
        voice_transcript_patch={"status": "failed", "error": err[:2000], "at": datetime.now(timezone.utc).isoformat()},
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
    row = _reconcile_voice_transcript(supabase, client_id, row)
    return _enrich_onboarding_row(supabase, client_id, row)


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
    return _enrich_onboarding_row(supabase, client_id, row)


@router.get("/{slug}/onboarding/voice/questions")
def onboarding_voice_questions(slug: str, lang: str = "de") -> List[Dict[str, Any]]:
    _ = slug
    locale = normalize_lang(lang)
    out: List[Dict[str, Any]] = []
    for q in ONBOARDING_VOICE_QUESTIONS:
        out.append(
            {
                "id": q["id"],
                "text": question_text(q, locale),
                "text_de": q.get("text_de"),
                "text_en": q.get("text_en"),
            }
        )
    return out


@router.post("/{slug}/onboarding/voice/upload", response_model=PipelineStartOut)
async def upload_onboarding_voice(
    slug: str,
    background_tasks: BackgroundTasks,
    org_id: Annotated[str, Depends(require_org_access)],
    client_id: Annotated[str, Depends(resolve_client_id)],
    supabase: Annotated[Client, Depends(get_supabase)],
    settings: Annotated[Settings, Depends(get_settings)],
    audio_format: Annotated[str, Form()] = "webm",
    language: Annotated[str, Form()] = "auto",
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    """Upload voice memo and transcribe inline in the API (not the shared worker queue)."""
    _ = slug
    fmt = (audio_format or "webm").strip().lower().lstrip(".")
    lang = (language or "auto").strip().lower()
    if lang not in ("auto", "de", "en"):
        lang = "auto"
    if fmt not in ALLOWED_AUDIO_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format. Allowed: {', '.join(sorted(ALLOWED_AUDIO_FORMATS))}",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(data) > MAX_VOICE_BYTES:
        raise HTTPException(status_code=413, detail="Audio too large (max 24 MB)")

    fail_abandoned_queued_jobs(supabase, client_id=client_id, job_type="onboarding_voice_transcribe")
    fail_stale_running_jobs(supabase, client_id=client_id, job_type="onboarding_voice_transcribe", max_age_minutes=5)
    if has_active_job(supabase, client_id=client_id, job_type="onboarding_voice_transcribe"):
        res = (
            supabase.table("background_jobs")
            .select("id")
            .eq("client_id", client_id)
            .eq("job_type", "onboarding_voice_transcribe")
            .in_("status", ["queued", "running"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            return {"job_id": str(res.data[0]["id"]), "already_running": True}

    storage_path = f"{client_id}/onboarding-audio/{uuid.uuid4().hex}.{fmt}"
    try:
        supabase.storage.from_(VOICE_STORAGE_BUCKET).upload(
            storage_path,
            data,
            {"content-type": file.content_type or f"audio/{fmt}", "upsert": "true"},
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Storage upload failed: {e}") from e

    jid = generate_job_id()
    now = datetime.now(timezone.utc).isoformat()
    payload = {"storage_path": storage_path, "audio_format": fmt, "language": lang, "inline_api": True}
    supabase.table("background_jobs").insert(
        {
            "id": jid,
            "org_id": org_id,
            "client_id": client_id,
            "job_type": "onboarding_voice_transcribe",
            "payload": payload,
            "status": "running",
            "started_at": now,
            "priority": 45,
        }
    ).execute()
    update_onboarding_state(
        supabase,
        client_id,
        voice_transcript_patch={
            "status": "pending",
            "error": "",
            "audio_storage_path": storage_path,
            "audio_format": fmt,
        },
        job_ids_patch={"voice_transcribe": jid},
    )
    job_row = {"id": jid, "client_id": client_id, "payload": payload}
    background_tasks.add_task(_run_voice_transcribe_inline, settings, job_row)
    logger.info("onboarding_voice_transcribe dispatched inline job=%s client=%s", jid, client_id)
    return {"job_id": jid, "already_running": False}


@router.post("/{slug}/onboarding/voice/submit-text", response_model=PipelineStartOut)
def submit_onboarding_voice_text(
    slug: str,
    body: VoiceTextBody,
    background_tasks: BackgroundTasks,
    org_id: Annotated[str, Depends(require_org_access)],
    client_id: Annotated[str, Depends(resolve_client_id)],
    supabase: Annotated[Client, Depends(get_supabase)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Dict[str, Any]:
    """Paste or upload text — skip STT, structure into per-question answers inline."""
    _ = slug
    text = body.text.strip()
    if len(text) < 40:
        raise HTTPException(status_code=400, detail="Text too short — add more detail about your business")

    fail_abandoned_queued_jobs(supabase, client_id=client_id, job_type="onboarding_voice_transcribe")
    fail_stale_running_jobs(supabase, client_id=client_id, job_type="onboarding_voice_transcribe", max_age_minutes=5)
    if has_active_job(supabase, client_id=client_id, job_type="onboarding_voice_transcribe"):
        res = (
            supabase.table("background_jobs")
            .select("id")
            .eq("client_id", client_id)
            .eq("job_type", "onboarding_voice_transcribe")
            .in_("status", ["queued", "running"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            return {"job_id": str(res.data[0]["id"]), "already_running": True}

    jid = generate_job_id()
    now = datetime.now(timezone.utc).isoformat()
    payload = {"source": "text", "text": text, "language": "auto", "inline_api": True}
    supabase.table("background_jobs").insert(
        {
            "id": jid,
            "org_id": org_id,
            "client_id": client_id,
            "job_type": "onboarding_voice_transcribe",
            "payload": payload,
            "status": "running",
            "started_at": now,
            "priority": 45,
        }
    ).execute()
    update_onboarding_state(
        supabase,
        client_id,
        voice_transcript_patch={
            "status": "pending",
            "error": "",
            "input_source": "text",
        },
        job_ids_patch={"voice_transcribe": jid},
    )
    job_row = {"id": jid, "client_id": client_id, "payload": payload}
    background_tasks.add_task(_run_voice_transcribe_inline, settings, job_row)
    logger.info("onboarding_voice_text dispatched inline job=%s client=%s", jid, client_id)
    return {"job_id": jid, "already_running": False}


@router.post("/{slug}/onboarding/voice/generate", response_model=PipelineStartOut)
def start_onboarding_brain_generate(
    slug: str,
    body: VoiceGenerateBody,
    background_tasks: BackgroundTasks,
    org_id: Annotated[str, Depends(require_org_access)],
    client_id: Annotated[str, Depends(resolve_client_id)],
    supabase: Annotated[Client, Depends(get_supabase)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Dict[str, Any]:
    """After user reviews per-question answers, generate strategy docs inline in the API."""
    _ = slug
    answers = {str(k): str(v).strip() for k, v in body.answers.items() if str(v).strip()}
    if not answers:
        raise HTTPException(status_code=400, detail="At least one answer is required")

    fail_abandoned_queued_jobs(supabase, client_id=client_id, job_type="onboarding_brain_generate")
    fail_stale_running_jobs(supabase, client_id=client_id, job_type="onboarding_brain_generate", max_age_minutes=5)
    if has_active_job(supabase, client_id=client_id, job_type="onboarding_brain_generate"):
        res = (
            supabase.table("background_jobs")
            .select("id")
            .eq("client_id", client_id)
            .eq("job_type", "onboarding_brain_generate")
            .in_("status", ["queued", "running"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            return {"job_id": str(res.data[0]["id"]), "already_running": True}

    jid = generate_job_id()
    now = datetime.now(timezone.utc).isoformat()
    payload = {"answers": answers, "inline_api": True}
    supabase.table("background_jobs").insert(
        {
            "id": jid,
            "org_id": org_id,
            "client_id": client_id,
            "job_type": "onboarding_brain_generate",
            "payload": payload,
            "status": "running",
            "started_at": now,
            "priority": 40,
        }
    ).execute()
    update_onboarding_state(
        supabase,
        client_id,
        voice_transcript_patch={"status": "queued_generate", "edited_answers": answers},
        job_ids_patch={"brain_generate": jid},
    )
    job_row = {"id": jid, "client_id": client_id, "payload": payload}
    background_tasks.add_task(_run_brain_generate_inline, settings, job_row)
    logger.info("onboarding_brain_generate dispatched inline job=%s client=%s", jid, client_id)
    return {"job_id": jid, "already_running": False}


@router.post("/{slug}/onboarding/pipeline/start", response_model=PipelineStartOut)
def start_onboarding_pipeline(
    slug: str,
    background_tasks: BackgroundTasks,
    org_id: Annotated[str, Depends(require_org_access)],
    client_id: Annotated[str, Depends(resolve_client_id)],
    supabase: Annotated[Client, Depends(get_supabase)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Dict[str, Any]:
    """Runs the whole onboarding pipeline inline in this API process — see
    jobs/onboarding_pipeline.py docstring for why it never goes through the shared
    background_jobs "queued" state (a teammate's local worker or the production Railway
    worker sharing this Supabase project would otherwise race to claim and fail it)."""
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
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("background_jobs").insert(
        {
            "id": jid,
            "org_id": org_id,
            "client_id": client_id,
            "job_type": "onboarding_pipeline",
            "payload": {},
            "status": "running",
            "started_at": now,
            "priority": 30,
        }
    ).execute()
    update_onboarding_state(
        supabase,
        client_id,
        current_step="pipeline",
        pipeline_progress={"phase": "running", "job_id": jid},
        job_ids_patch={"pipeline": jid},
    )
    job_row = {"id": jid, "org_id": org_id, "client_id": client_id, "payload": {}}
    background_tasks.add_task(_run_onboarding_pipeline_inline, settings, job_row)
    logger.info("onboarding_pipeline dispatched inline job=%s client=%s", jid, client_id)
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
    now = datetime.now(timezone.utc).isoformat()
    for item in body.items:
        existing = (
            supabase.table("onboarding_reel_feedback")
            .select("id")
            .eq("client_id", client_id)
            .eq("scraped_reel_id", item.scraped_reel_id)
            .limit(1)
            .execute()
        )
        row: Dict[str, Any] = {
            "id": (
                str(existing.data[0]["id"])
                if existing.data
                else generate_onboarding_feedback_id()
            ),
            "client_id": client_id,
            "scraped_reel_id": item.scraped_reel_id,
            "verdict": item.verdict,
            "reason": item.reason,
            "updated_at": now,
        }
        if item.reel_analysis_id:
            row["reel_analysis_id"] = item.reel_analysis_id
        try:
            supabase.table("onboarding_reel_feedback").upsert(
                row,
                on_conflict="client_id,scraped_reel_id",
            ).execute()
        except Exception as e:
            logger.exception(
                "onboarding reel-feedback upsert failed client=%s reel=%s",
                client_id,
                item.scraped_reel_id,
            )
            raise HTTPException(
                status_code=500,
                detail=f"Could not save reel vote: {str(e)[:300]}",
            ) from e
        saved += 1
    return {"saved": saved}


@router.post("/{slug}/onboarding/first-content/start")
def start_first_content(
    slug: str,
    body: FirstContentStartBody,
    background_tasks: BackgroundTasks,
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
        # Onboarding drops the user straight into the editor with no angle-picker UI, so
        # skip angle generation/selection entirely and package a script immediately —
        # otherwise the session lands on "angles_ready" with an empty script and the
        # editor has nothing to hand off to rendering/HeyGen.
        recreate_mode="one_to_one",
    )
    try:
        session = generation_start(
            slug,
            gen_body,
            background_tasks,
            client_id=client_id,
            supabase=supabase,
            settings=settings,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "onboarding first-content generation_start failed client=%s reel=%s",
            client_id,
            body.scraped_reel_id,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Could not start first content: {str(e)[:400]}",
        ) from e

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
