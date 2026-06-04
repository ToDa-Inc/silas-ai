"""Generate persisted 7-day onboarding action plan."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from core.config import Settings
from services.openrouter import analyze_creator_profile

logger = logging.getLogger(__name__)


def _fallback_plan(language: str) -> Dict[str, Any]:
    de = language == "de"
    days: List[Dict[str, Any]] = []
    tasks_de = [
        ("Tag 1", "Analysiere 3 Top-Reels eines Wettbewerbers und notiere Hook + Struktur."),
        ("Tag 2", "Erstelle einen Entwurf aus deinem besten Outlier (Copy + B-Roll Plan)."),
        ("Tag 3", "Finalisiere Caption, Cover und exportiere den ersten Post."),
        ("Tag 4", "Poste und messe Saves/Kommentare in den ersten 24h."),
        ("Tag 5", "Scrape 5 neue ähnliche Reels und markiere 2 als YES."),
        ("Tag 6", "Zweiter Content-Entwurf mit anderem Angle aus DNA."),
        ("Tag 7", "Review: was performte? Passe Nische-Keywords in Settings an."),
    ]
    tasks_en = [
        ("Day 1", "Analyze 3 top competitor reels — note hook + structure."),
        ("Day 2", "Draft from your best outlier (copy + B-roll plan)."),
        ("Day 3", "Finalize caption, cover, export first post."),
        ("Day 4", "Publish and measure saves/comments in the first 24h."),
        ("Day 5", "Scrape 5 similar reels and mark 2 as YES."),
        ("Day 6", "Second draft using a different angle from DNA."),
        ("Day 7", "Review performance; tune niche keywords in settings."),
    ]
    for i, (title, action) in enumerate(tasks_de if de else tasks_en, start=1):
        days.append({"day": i, "title": title, "action": action, "metric": "completion"})
    return {"days": days, "language": language, "source": "fallback"}


def generate_action_plan(
    settings: Settings,
    *,
    client_row: Dict[str, Any],
    onboarding_state: Dict[str, Any],
    yes_reels: List[Dict[str, Any]],
    no_count: int,
) -> Dict[str, Any]:
    lang = str(client_row.get("language") or "de")
    if not settings.openrouter_api_key:
        return _fallback_plan(lang)

    dna = client_row.get("client_dna") or {}
    brief = ""
    if isinstance(dna, dict):
        brief = str(dna.get("analysis_brief") or dna.get("generation_brief") or "")[:4000]

    yes_summary = []
    for item in yes_reels[:5]:
        reel = item.get("reel") or {}
        yes_summary.append(
            {
                "shortcode": reel.get("shortcode"),
                "caption": (reel.get("caption") or "")[:200],
                "score": item.get("score"),
            }
        )

    prompt = f"""Create a 7-day Instagram content action plan for this creator.

Language for output labels: {"German" if lang == "de" else "English"} (use {lang} field codes).

Client DNA brief (excerpt):
{brief[:3000]}

Onboarding quiz:
{json.dumps(onboarding_state.get("quiz_answers") or {}, ensure_ascii=False)[:1500]}

Reels they approved (YES):
{json.dumps(yes_summary, ensure_ascii=False)}

Reels they rejected: {no_count}

First generation session id: {onboarding_state.get("selected_generation_session_id") or "none"}

Return JSON only:
{{
  "days": [
    {{"day": 1, "title": "...", "action": "specific task", "metric": "what to measure"}}
  ],
  "language": "{lang}",
  "source": "llm"
}}
Each day must have one concrete action (analyze, create, post, measure, or iterate)."""

    try:
        out = analyze_creator_profile(
            settings.openrouter_api_key,
            prompt,
            settings.openrouter_model,
        )
        if isinstance(out, dict) and isinstance(out.get("days"), list) and len(out["days"]) >= 7:
            out["language"] = lang
            return out
    except Exception:
        logger.exception("action plan LLM failed")

    return _fallback_plan(lang)
