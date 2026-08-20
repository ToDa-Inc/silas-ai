"""CRUD helpers for client_onboarding_state."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from core.id_generator import generate_key
from supabase import Client

ONBOARDING_STEPS_ORDER = [
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


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_onboarding_state_id() -> str:
    return generate_key(8, prefix="obs_")


def generate_onboarding_feedback_id() -> str:
    return generate_key(8, prefix="obf_")


def _normalize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(row)
    completed = out.get("completed_steps")
    if not isinstance(completed, list):
        out["completed_steps"] = []
    out["aha_complete"] = bool(out.get("aha_completed_at"))
    return out


def get_onboarding_state(supabase: Client, client_id: str) -> Optional[Dict[str, Any]]:
    res = (
        supabase.table("client_onboarding_state")
        .select("*")
        .eq("client_id", client_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    return _normalize_row(res.data[0])


def ensure_onboarding_state(supabase: Client, client_id: str) -> Dict[str, Any]:
    existing = get_onboarding_state(supabase, client_id)
    if existing:
        return existing
    now = _now_iso()
    row = {
        "id": generate_onboarding_state_id(),
        "client_id": client_id,
        "status": "in_progress",
        "current_step": "quiz",
        "completed_steps": ["workspace"],
        "quiz_answers": {},
        "pipeline_progress": {},
        "job_ids": {},
        "started_at": now,
        "updated_at": now,
    }
    ins = supabase.table("client_onboarding_state").insert(row).execute()
    if not ins.data:
        raise RuntimeError("Failed to create client_onboarding_state row")
    return _normalize_row(ins.data[0])


def _merge_completed_steps(existing: List[str], step: str) -> List[str]:
    steps = list(existing) if isinstance(existing, list) else []
    if step not in steps:
        steps.append(step)
    return steps


def update_onboarding_state(
    supabase: Client,
    client_id: str,
    *,
    current_step: Optional[str] = None,
    complete_step: Optional[str] = None,
    quiz_answers: Optional[Dict[str, Any]] = None,
    pipeline_progress: Optional[Dict[str, Any]] = None,
    ig_prefill_patch: Optional[Dict[str, Any]] = None,
    voice_transcript_patch: Optional[Dict[str, Any]] = None,
    job_ids_patch: Optional[Dict[str, Any]] = None,
    selected_reel_id: Optional[str] = None,
    selected_analysis_id: Optional[str] = None,
    selected_generation_session_id: Optional[str] = None,
    action_plan: Optional[Dict[str, Any]] = None,
    mark_aha_complete: bool = False,
    last_error: Optional[str] = None,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    row = ensure_onboarding_state(supabase, client_id)
    patch: Dict[str, Any] = {"updated_at": _now_iso()}

    completed = list(row.get("completed_steps") or [])
    if complete_step:
        completed = _merge_completed_steps(completed, complete_step)
        patch["completed_steps"] = completed
        if current_step is None:
            try:
                idx = ONBOARDING_STEPS_ORDER.index(complete_step)
                if idx + 1 < len(ONBOARDING_STEPS_ORDER):
                    patch["current_step"] = ONBOARDING_STEPS_ORDER[idx + 1]
            except ValueError:
                pass

    if current_step is not None:
        patch["current_step"] = current_step
    if quiz_answers is not None:
        merged = dict(row.get("quiz_answers") or {})
        merged.update(quiz_answers)
        patch["quiz_answers"] = merged
    if pipeline_progress is not None:
        merged = dict(row.get("pipeline_progress") or {})
        merged.update(pipeline_progress)
        patch["pipeline_progress"] = merged
    if ig_prefill_patch is not None:
        merged = dict(row.get("ig_prefill") or {})
        merged.update(ig_prefill_patch)
        patch["ig_prefill"] = merged
    if voice_transcript_patch is not None:
        merged = dict(row.get("voice_transcript") or {})
        merged.update(voice_transcript_patch)
        patch["voice_transcript"] = merged
    if job_ids_patch is not None:
        merged = dict(row.get("job_ids") or {})
        merged.update(job_ids_patch)
        patch["job_ids"] = merged
    if selected_reel_id is not None:
        patch["selected_reel_id"] = selected_reel_id
    if selected_analysis_id is not None:
        patch["selected_analysis_id"] = selected_analysis_id
    if selected_generation_session_id is not None:
        patch["selected_generation_session_id"] = selected_generation_session_id
    if action_plan is not None:
        patch["action_plan"] = action_plan
    if last_error is not None:
        patch["last_error"] = last_error
    if status is not None:
        patch["status"] = status

    if complete_step == "tour" or current_step == "done":
        patch["status"] = "completed"
        patch["completed_at"] = _now_iso()

    if mark_aha_complete:
        now = _now_iso()
        patch["aha_completed_at"] = now
        patch["current_step"] = "action_plan"
        completed = _merge_completed_steps(completed, "editor")
        patch["completed_steps"] = completed

    supabase.table("client_onboarding_state").update(patch).eq("client_id", client_id).execute()
    out = get_onboarding_state(supabase, client_id)
    if not out:
        raise RuntimeError("Onboarding state missing after update")
    return out


def apply_quiz_to_client(
    supabase: Client,
    client_id: str,
    quiz: Dict[str, Any],
    *,
    language_fallback: str = "de",
) -> None:
    """Map quiz answers into clients.niche_config, icp, products.competitor_seeds."""
    res = supabase.table("clients").select("*").eq("id", client_id).limit(1).execute()
    if not res.data:
        raise ValueError("Client not found")
    client = dict(res.data[0])

    summary = str(quiz.get("niche_summary") or "").strip()
    audience = str(quiz.get("target_audience") or "").strip()
    voice = str(quiz.get("brand_voice") or "").strip()
    offers = str(quiz.get("offers") or "").strip()
    goals = quiz.get("content_goals")
    if not isinstance(goals, list):
        goals = []
    goals = [str(g).strip() for g in goals if str(g).strip()]

    keywords: List[str] = []
    for g in goals[:6]:
        keywords.append(g)
    if summary:
        for part in summary.replace(";", ",").split(","):
            t = part.strip()
            if t and len(t) > 2 and t not in keywords:
                keywords.append(t[:80])

    niche_config = [
        {
            "id": "onboarding-quiz",
            "name": "Primary niche",
            "description": summary or "Primary niche from onboarding quiz",
            "keywords": keywords[:12] if keywords else ["content creator"],
            "keywords_de": [],
            "content_angles": goals[:8],
            "hashtags": [],
            "hashtags_de": [],
        }
    ]

    icp: Dict[str, Any] = dict(client.get("icp") or {}) if isinstance(client.get("icp"), dict) else {}
    if audience:
        icp["target"] = audience
    if goals:
        icp["desires"] = goals
    icp["summary"] = summary or icp.get("summary") or ""
    icp["source"] = "onboarding_quiz"

    products = dict(client.get("products") or {}) if isinstance(client.get("products"), dict) else {}
    seeds_raw = quiz.get("competitor_hints") or []
    if isinstance(seeds_raw, list):
        seeds = [str(s).strip().lstrip("@") for s in seeds_raw if str(s).strip()][:15]
        if seeds:
            products["competitor_seeds"] = seeds

    lang = str(quiz.get("language") or client.get("language") or language_fallback).strip()
    if lang not in ("de", "en"):
        lang = language_fallback

    supabase.table("clients").update(
        {
            "niche_config": niche_config,
            "icp": icp,
            "products": products,
            "language": lang,
        }
    ).eq("id", client_id).execute()
