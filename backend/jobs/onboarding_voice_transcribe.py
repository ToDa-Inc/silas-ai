"""onboarding_voice_transcribe — upload audio → Chirp STT → per-question structure."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from core.config import Settings
from core.database import get_supabase_for_settings
from services.onboarding_questions import detect_lang_from_text, normalize_lang, stt_language_hint
from services.onboarding_state import update_onboarding_state
from services.onboarding_voice_structure import split_transcript_by_question
from services.openrouter_transcribe import probe_audio_duration_seconds, transcribe_audio

logger = logging.getLogger(__name__)

STORAGE_BUCKET = "client-context"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _structure_transcript(
    settings: Settings,
    *,
    raw: str,
    client_lang: str,
    payload_lang: str,
) -> tuple[str, Dict[str, str]]:
    detected_lang = detect_lang_from_text(raw, fallback=client_lang)
    structure_model = settings.openrouter_onboarding_model or settings.openrouter_model
    structured = split_transcript_by_question(
        openrouter_key=settings.openrouter_api_key,
        model=structure_model,
        transcript=raw,
        lang=detected_lang,
    )
    return detected_lang, structured


def run_onboarding_voice_transcribe(settings: Settings, job: Dict[str, Any]) -> None:
    supabase = get_supabase_for_settings(settings)
    job_id = job["id"]
    client_id = job.get("client_id")
    payload = job.get("payload") or {}
    if not client_id:
        raise RuntimeError("onboarding_voice_transcribe job missing client_id")

    source = str(payload.get("source") or "audio").strip().lower()
    storage_path = str(payload.get("storage_path") or "").strip()
    audio_format = str(payload.get("audio_format") or "webm").strip().lower()
    payload_lang = str(payload.get("language") or "auto").strip().lower()
    pasted_text = str(payload.get("text") or "").strip()

    crow = supabase.table("clients").select("language,name").eq("id", client_id).limit(1).execute()
    if not crow.data:
        raise RuntimeError("Client not found")
    client = crow.data[0]
    client_lang = normalize_lang(str(client.get("language") or "de"))
    stt_lang = stt_language_hint(payload_lang)

    def _fail(msg: str) -> None:
        update_onboarding_state(
            supabase,
            client_id,
            voice_transcript_patch={"status": "failed", "error": msg[:500], "at": _now()},
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
            voice_transcript_patch={"status": "transcribing", "at": _now()},
        )

        duration_s = None
        audio_bytes_len = None

        if source == "text":
            if len(pasted_text) < 40:
                raise RuntimeError("Text too short — add more detail about your business")
            raw = pasted_text
            logger.info(
                "onboarding_voice_transcribe text chars=%s client=%s",
                len(raw),
                client_id,
            )
        else:
            if not storage_path:
                raise RuntimeError("onboarding_voice_transcribe missing storage_path")
            blob = supabase.storage.from_(STORAGE_BUCKET).download(storage_path)
            if not blob:
                raise RuntimeError("Failed to download audio from storage")
            audio_bytes = blob if isinstance(blob, bytes) else bytes(blob)
            duration_s = probe_audio_duration_seconds(audio_bytes, audio_format)
            audio_bytes_len = len(audio_bytes)
            logger.info(
                "onboarding_voice_transcribe audio bytes=%s duration_s=%s client=%s",
                audio_bytes_len,
                duration_s,
                client_id,
            )

            raw = transcribe_audio(
                openrouter_key=settings.openrouter_api_key,
                model=settings.openrouter_transcribe_model,
                audio_bytes=audio_bytes,
                audio_format=audio_format,
                language=stt_lang,
            )

        detected_lang, structured = _structure_transcript(
            settings,
            raw=raw,
            client_lang=client_lang,
            payload_lang=payload_lang,
        )

        voice_patch: Dict[str, Any] = {
            "status": "transcribed",
            "raw_transcript": raw,
            "structured_answers": structured,
            "language": detected_lang,
            "stt_language_hint": payload_lang,
            "input_source": source,
            "at": _now(),
        }
        if source != "text":
            voice_patch.update(
                {
                    "audio_storage_path": storage_path,
                    "audio_format": audio_format,
                    "duration_s": duration_s,
                    "audio_bytes": audio_bytes_len,
                }
            )

        update_onboarding_state(
            supabase,
            client_id,
            voice_transcript_patch=voice_patch,
        )
        result: Dict[str, Any] = {
            "pipeline": "onboarding_voice_transcribe",
            "chars": len(raw),
            "source": source,
        }
        if audio_bytes_len is not None:
            result["audio_bytes"] = audio_bytes_len
        if duration_s is not None:
            result["duration_s"] = duration_s

        supabase.table("background_jobs").update(
            {
                "status": "completed",
                "completed_at": _now(),
                "result": result,
            }
        ).eq("id", job_id).execute()
    except Exception as e:
        logger.exception("onboarding_voice_transcribe failed for %s", client_id)
        _fail(str(e))
