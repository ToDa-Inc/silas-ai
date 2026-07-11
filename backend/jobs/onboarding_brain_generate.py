"""onboarding_brain_generate — confirmed transcript → four real prompts → client_context."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from core.config import Settings
from core.database import get_supabase_for_settings
from services.client_dna_compile import maybe_recompile_client_dna
from services.client_context_real_prompts import generate_sections_from_real_prompts
from services.onboarding_questions import build_transcript_from_answers, normalize_lang
from services.onboarding_state import apply_quiz_to_client, update_onboarding_state

logger = logging.getLogger(__name__)

SECTION_KEYS = (
    "icp",
    "brand_map",
    "story_board",
    "communication_guideline",
    "offer_documentation",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _quiz_from_answers(answers: Dict[str, str]) -> Dict[str, Any]:
    def g(qid: str) -> str:
        return (answers.get(qid) or "").strip()

    goals_raw = g("9")
    goals = [s.strip() for s in goals_raw.replace(";", ",").split(",") if s.strip()]
    return {
        "niche_summary": g("1"),
        "target_audience": g("8"),
        "content_goals": goals,
        "brand_voice": g("10"),
        "offers": g("4"),
        "competitor_hints": [],
    }


def run_onboarding_brain_generate(settings: Settings, job: Dict[str, Any]) -> None:
    supabase = get_supabase_for_settings(settings)
    job_id = job["id"]
    client_id = job.get("client_id")
    payload = job.get("payload") or {}
    if not client_id:
        raise RuntimeError("onboarding_brain_generate job missing client_id")

    answers = payload.get("answers")
    if not isinstance(answers, dict):
        raise RuntimeError("onboarding_brain_generate missing answers payload")

    crow = supabase.table("clients").select("name,language,client_context").eq("id", client_id).limit(1).execute()
    if not crow.data:
        raise RuntimeError("Client not found")
    client = crow.data[0]
    client_name = str(client.get("name") or "")
    lang = normalize_lang(str(client.get("language") or payload.get("language") or "de"))

    def _fail(msg: str) -> None:
        update_onboarding_state(
            supabase,
            client_id,
            voice_transcript_patch={
                "status": "generate_failed",
                "generate_error": msg[:500],
                "at": _now(),
            },
        )
        supabase.table("background_jobs").update(
            {
                "status": "failed",
                "completed_at": _now(),
                "error_message": msg[:8000],
            }
        ).eq("id", job_id).execute()

    if not settings.openrouter_api_key:
        _fail("OPENROUTER_API_KEY not configured")
        return

    try:
        update_onboarding_state(
            supabase,
            client_id,
            voice_transcript_patch={"status": "generating", "at": _now()},
        )
        str_answers = {str(k): str(v) for k, v in answers.items()}
        transcript = build_transcript_from_answers(str_answers, lang=lang)
        if len(transcript) < 40:
            raise ValueError("Combined transcript too short after review")

        model = settings.openrouter_onboarding_model or settings.openrouter_model
        sections = generate_sections_from_real_prompts(
            openrouter_key=settings.openrouter_api_key,
            model=model,
            transcript=transcript,
            client_name=client_name,
            lang=lang,
        )

        now = _now()
        ctx = dict(client.get("client_context") or {}) if isinstance(client.get("client_context"), dict) else {}
        ctx["onboarding_transcript"] = {
            "text": transcript,
            "source": "voice",
            "file": None,
            "updated_at": now,
        }
        for key in SECTION_KEYS:
            text = str(sections.get(key) or "").strip()
            if text:
                ctx[key] = {"text": text, "source": "generated", "file": None, "updated_at": now}

        supabase.table("clients").update({"client_context": ctx}).eq("id", client_id).execute()

        quiz = _quiz_from_answers(str_answers)
        quiz["language"] = lang
        apply_quiz_to_client(supabase, client_id, quiz)
        maybe_recompile_client_dna(settings, supabase, client_id, force=True)

        update_onboarding_state(
            supabase,
            client_id,
            voice_transcript_patch={
                "status": "ready",
                "edited_answers": str_answers,
                "edited_transcript": transcript,
                "at": now,
            },
            complete_step="quiz",
            current_step="strategy_docs",
        )
        update_onboarding_state(
            supabase,
            client_id,
            complete_step="source",
        )

        supabase.table("background_jobs").update(
            {
                "status": "completed",
                "completed_at": now,
                "result": {"pipeline": "onboarding_brain_generate", "sections": list(sections.keys())},
            }
        ).eq("id", job_id).execute()
    except Exception as e:
        logger.exception("onboarding_brain_generate failed for %s", client_id)
        _fail(str(e))
