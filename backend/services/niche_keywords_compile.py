"""Generate client_dna.similarity_keywords.auto — short caption-style search phrases (one LLM call)."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List

from services.openrouter import openrouter_post_chat_completions

logger = logging.getLogger(__name__)

_SYSTEM = """You output ONLY valid JSON (no markdown). Generate short Instagram reel search phrases.
Rules:
- 2–6 words each, lowercase, no hashtags, no questions, no first-person sentences.
- Phrases someone would type to find reels in this niche (not bio keywords).
- 6–12 phrases in "phrases", matching the client's primary language (language_hint).
- JSON shape: {"phrases": ["phrase one", "phrase two", ...]}"""

# language_hint != "en": also ask for a secondary English set in the SAME call (cheaper than a
# second request). Used only as a fallback net when the native-language pool comes up empty —
# see ONBOARDING_KEYWORD_PAYLOAD_RETRY in jobs/onboarding_pipeline.py. Idiomatic phrasing, not a
# literal translation of "phrases": a mechanically translated German phrase is not how an English
# speaker would actually caption or search for the same content.
_SYSTEM_BILINGUAL = """You output ONLY valid JSON (no markdown). Generate short Instagram reel search phrases.
Rules:
- 2–6 words each, lowercase, no hashtags, no questions, no first-person sentences.
- Phrases someone would type to find reels in this niche (not bio keywords).
- 6–12 phrases in "phrases", matching the client's primary language (language_hint).
- Also generate 4–8 phrases in "phrases_en": natural, idiomatic ENGLISH search terms for the
  SAME niche — how an English-speaking Instagram user would actually search/caption this content,
  NOT literal translations of the "phrases" list.
- JSON shape: {"phrases": ["phrase one", ...], "phrases_en": ["phrase one", ...]}"""


def generate_similarity_keywords_auto(
    *,
    openrouter_key: str,
    model: str,
    client_row: Dict[str, Any],
    analysis_brief: str,
) -> Dict[str, List[Dict[str, str]]]:
    """Return {"auto": [{"text","lang"},...], "auto_en": [...]} for client_dna.similarity_keywords.

    "auto_en" is empty when language_hint is already "en" (no secondary set needed).
    """
    if not openrouter_key:
        raise RuntimeError("OPENROUTER_API_KEY not configured")

    lang = (client_row.get("language") or "en").strip().lower()[:8]
    bilingual = lang != "en"
    nc = client_row.get("niche_config") or []
    icp = client_row.get("icp") if isinstance(client_row.get("icp"), dict) else {}
    user = (
        f"language_hint: {lang}\n\n"
        f"niche_config (json):\n{json.dumps(nc, ensure_ascii=False)[:12000]}\n\n"
        f"icp (json):\n{json.dumps(icp, ensure_ascii=False)[:8000]}\n\n"
        f"analysis_brief:\n{(analysis_brief or '')[:8000]}"
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_BILINGUAL if bilingual else _SYSTEM},
            {"role": "user", "content": user},
        ],
        "max_tokens": 1024,
        "temperature": 0.2,
    }
    r = openrouter_post_chat_completions(
        openrouter_key,
        payload,
        timeout=120.0,
        enable_model_fallback=True,
    )
    data = r.json()
    if data.get("error"):
        raise RuntimeError(data["error"].get("message", str(data["error"])))
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    if isinstance(content, list):
        content = "".join(
            x.get("text", "") if isinstance(x, dict) else str(x) for x in content
        )
    cleaned = re.sub(r"^```json\s*", "", str(content).strip())
    cleaned = re.sub(r"^```\s*", "", cleaned).strip()
    cleaned = re.sub(r"```\s*$", "", cleaned).strip()
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise RuntimeError("similarity keyword compile returned non-object JSON")

    def _clean_phrases(raw: Any, *, phrase_lang: str, cap: int) -> List[Dict[str, str]]:
        if not isinstance(raw, list):
            return []
        cleaned_out: List[Dict[str, str]] = []
        seen_local: set[str] = set()
        for p in raw:
            s = " ".join(str(p).strip().split())
            if len(s) < 3 or len(s) > 120:
                continue
            k = s.lower()
            if k in seen_local:
                continue
            seen_local.add(k)
            cleaned_out.append({"text": s, "lang": phrase_lang})
            if len(cleaned_out) >= cap:
                break
        return cleaned_out

    out = _clean_phrases(parsed.get("phrases"), phrase_lang=lang, cap=12)
    out_en = _clean_phrases(parsed.get("phrases_en"), phrase_lang="en", cap=8) if bilingual else []
    if len(out) < 3:
        logger.warning("similarity keyword compile returned only %s phrases", len(out))
    return {"auto": out, "auto_en": out_en}


def merge_similarity_keywords_into_dna(
    existing_dna: Dict[str, Any],
    *,
    auto_phrases: Dict[str, List[Dict[str, str]]],
) -> Dict[str, Any]:
    """Merge auto + auto_en phrases into client_dna; preserves manual buckets under similarity_keywords if any."""
    dna = dict(existing_dna) if isinstance(existing_dna, dict) else {}
    old_sk = dna.get("similarity_keywords")
    sk: Dict[str, Any] = dict(old_sk) if isinstance(old_sk, dict) else {}
    sk["auto"] = auto_phrases.get("auto") or []
    sk["auto_en"] = auto_phrases.get("auto_en") or []
    sk["compiled_at"] = datetime.now(timezone.utc).isoformat()
    dna["similarity_keywords"] = sk
    return dna
