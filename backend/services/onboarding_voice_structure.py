"""Split a flat voice transcript into per-question answers for the review UI."""

from __future__ import annotations

import json
import re
from typing import Any, Dict

from services.onboarding_questions import (
    detect_lang_from_text,
    format_questions_bilingual_for_prompt,
    ONBOARDING_VOICE_QUESTIONS,
)
from services.openrouter import chat_json_completion

_SYSTEM = """You segment a voice onboarding transcript into answers for numbered questions.
The speaker may answer in German, English, or a mix — map content to the matching question by topic.
Return ONLY a JSON object whose keys are question ids ("1", "2", ...) and values are the speaker's answer text for that question.
Use empty string for questions not addressed. Do not invent facts not in the transcript.
Preserve the language the speaker used in each answer."""


def split_transcript_by_question(
    *,
    openrouter_key: str,
    model: str,
    transcript: str,
    lang: str = "de",
) -> Dict[str, str]:
    t = transcript.strip()
    if len(t) < 20:
        raise ValueError("Transcript too short to structure")

    questions = format_questions_bilingual_for_prompt()
    user = f"QUESTIONS (DE + EN labels — same topics):\n{questions}\n\nTRANSCRIPT:\n{t[:80_000]}"
    parsed: Dict[str, Any] = chat_json_completion(
        openrouter_key,
        model,
        system=_SYSTEM,
        user=user,
        max_tokens=8192,
        temperature=0.1,
    )

    out: Dict[str, str] = {}
    for q in ONBOARDING_VOICE_QUESTIONS:
        qid = str(q["id"])
        raw = parsed.get(qid)
        out[qid] = str(raw).strip() if raw is not None else ""
    return out


def answers_to_transcript(answers: Dict[str, str]) -> str:
    from services.onboarding_questions import build_transcript_from_answers

    return build_transcript_from_answers(answers)
