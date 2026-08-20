"""LLM: quick Instagram read (bio + recent captions) → draft guesses for onboarding
quiz/source answers, so the user edits instead of typing from a blank page."""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List

from services.openrouter import openrouter_post_chat_completions

PREFILL_KEYS = (
    "target_audience",
    "content_goals",
    "brand_voice",
    "offer",
    "icp",
    "story",
    "positioning",
    "tone",
)

_SYSTEM = """You are a sharp content strategist skimming a creator's Instagram to save them typing during onboarding. From the bio and recent captions below, draft SHORT, concrete first-guesses for each field below — not guarantees, just a solid starting point the creator will edit. Write in the same language as the bio/captions.

Output MUST be a single JSON object with exactly these string keys (no markdown fences):
- target_audience — 1-2 sentences: who this creator seems to serve.
- content_goals — a short comma-separated list of 2-4 likely content goals (e.g. "leads, brand authority").
- brand_voice — 1 short sentence describing the tone you observe.
- offer — 1-2 sentences: what they likely sell or promote, if inferable.
- icp — 1-2 sentences: their audience's likely pains and desires.
- story — 1 sentence: any origin/story hint visible in the bio or captions.
- positioning — 1 sentence: what seems to differentiate them, if visible.
- tone — 1 sentence: words/phrases/style they seem to use, plus anything to avoid if obvious.

Be honest and modest — this is a first guess the creator will edit, not a final answer. If a field truly has no signal in the bio/captions, write a short honest note like "Not clear from Instagram — add manually" for that field rather than inventing detail."""


def draft_onboarding_prefill_from_instagram(
    *,
    openrouter_key: str,
    model: str,
    name: str,
    ig: str,
    language: str,
    bio: str,
    captions: List[str],
) -> Dict[str, str]:
    """Returns dict with the PREFILL_KEYS; missing keys become empty strings."""
    if not openrouter_key:
        raise RuntimeError("OPENROUTER_API_KEY not configured")

    cap_block = "\n".join(f'{i + 1}. "{c}"' for i, c in enumerate(captions[:20]))
    user_msg = (
        f"CREATOR: {name or ig}\n"
        f"Instagram: @{ig}\n"
        f"Language setting: {language}\n"
        f'Bio: "{bio}"\n\n'
        f"RECENT CAPTIONS:\n{cap_block or '(none found)'}"
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": user_msg[:20_000]},
        ],
        "max_tokens": 1200,
        "temperature": 0.3,
    }
    r = openrouter_post_chat_completions(
        openrouter_key,
        payload,
        timeout=90.0,
        enable_model_fallback=True,
    )
    data = r.json()
    if data.get("error"):
        raise RuntimeError(data["error"].get("message", str(data["error"])))
    content = data["choices"][0]["message"]["content"]
    cleaned = re.sub(r"^```json\s*", "", content.strip())
    cleaned = re.sub(r"^```\s*", "", cleaned).strip()
    cleaned = re.sub(r"```\s*$", "", cleaned).strip()
    parsed: Any = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise RuntimeError("Prefill draft returned non-object JSON")

    out: Dict[str, str] = {}
    for key in PREFILL_KEYS:
        v = parsed.get(key)
        out[key] = str(v).strip() if v is not None else ""
    return out
