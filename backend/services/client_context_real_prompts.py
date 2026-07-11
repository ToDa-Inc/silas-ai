"""Load onboarding brain prompts and run the four real document generators."""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, Optional

from services.onboarding_questions import format_questions_for_prompt, normalize_lang
from services.openrouter import chat_text_completion

_PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"

_WATERMARK_RE = re.compile(
    r"Dieses Dokument ist ausschließlich.*?(?:\n|$)",
    re.IGNORECASE,
)
_BROKEN_PLACEHOLDER_RE = re.compile(r"\{\{ONBOARDING\s*_\s*(?:QUIZ|QUESTIONS)\}\}", re.IGNORECASE)

PROMPT_FILES: Dict[str, str] = {
    "icp": "icp.md",
    "brand_map": "brand_map.md",
    "story_board": "storyboard.md",
    "communication_guideline": "communication_guideline.md",
}


def _clean_prompt_text(raw: str) -> str:
    text = _WATERMARK_RE.sub("", raw)
    text = text.replace("{{ONBOARDING\n_\nQUIZ}}", "{{ONBOARDING_QUIZ}}")
    text = text.replace("{{ONBOARDING\n_\nQUESTIONS}}", "{{ONBOARDING_QUESTIONS}}")
    text = _BROKEN_PLACEHOLDER_RE.sub("{{ONBOARDING_QUIZ}}", text)
    text = re.sub(r"<brand\s*_\s*map\s*_\s*analysis>", "<brand_map_analysis>", text)
    text = re.sub(r"</brand\s*_\s*map>", "</brand_map>", text)
    text = re.sub(r"<communication\s*_\s*guideline>", "<communication_guideline>", text)
    text = re.sub(r"</communication\s*_\s*guideline>", "</communication_guideline>", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def load_prompt(section: str) -> str:
    fname = PROMPT_FILES.get(section)
    if not fname:
        raise ValueError(f"Unknown prompt section: {section}")
    path = _PROMPTS_DIR / fname
    if not path.is_file():
        raise FileNotFoundError(f"Prompt file missing: {path}")
    return _clean_prompt_text(path.read_text(encoding="utf-8"))


def _render_prompt(
    *,
    section: str,
    transcript: str,
    client_name: str,
    questions_text: str,
) -> str:
    prompt = load_prompt(section)
    prompt = prompt.replace("{{TRANSCRIPT}}", transcript)
    prompt = prompt.replace("{{ONBOARDING_QUIZ}}", questions_text)
    prompt = prompt.replace("{{ONBOARDING_QUESTIONS}}", questions_text)
    # Order matters: resolve the more specific wrapped-tag form first, then the
    # bare split-placeholder form, then the clean form — each pattern's a subset
    # of the previous one, so a single ordering avoids leaving partial tags behind.
    prompt = prompt.replace("<client\n_\nname>{{CLIENT\n_\nNAME}}</client\n_\nname>", client_name or "Client")
    prompt = prompt.replace("{{CLIENT\n_\nNAME}}", client_name or "Client")
    prompt = prompt.replace("{{CLIENT_NAME}}", client_name or "Client")
    lang_note = (
        "\n\nIMPORTANT: Write the final document in the same language as the transcript. "
        "If the transcript is German, output German. If English, output English."
    )
    return prompt + lang_note


def _generate_one_section(
    *,
    openrouter_key: str,
    model: str,
    section: str,
    transcript: str,
    client_name: str,
    questions_text: str,
) -> tuple[str, str]:
    user_prompt = _render_prompt(
        section=section,
        transcript=transcript,
        client_name=client_name,
        questions_text=questions_text,
    )
    text = chat_text_completion(
        openrouter_key,
        model,
        system="You are a senior content strategist. Follow the instructions exactly.",
        user=user_prompt,
        max_tokens=12_288,
        temperature=0.25,
    )
    return section, text.strip()


def _extract_offer_from_brand_map(brand_map: str) -> str:
    if not brand_map.strip():
        return ""
    m = re.search(
        r"(?:^|\n)\s*2\.\s*Offers?:?\s*\n([\s\S]*?)(?=\n\s*3\.\s|\Z)",
        brand_map,
        re.IGNORECASE,
    )
    if m:
        return m.group(1).strip()
    return ""


def generate_sections_from_real_prompts(
    *,
    openrouter_key: str,
    model: str,
    transcript: str,
    client_name: str = "",
    lang: str = "de",
    max_workers: int = 4,
) -> Dict[str, str]:
    """Run the four real onboarding prompts in parallel; derive offer_documentation from brand_map."""
    t = transcript.strip()
    if len(t) < 40:
        raise ValueError("Transcript is too short to generate meaningful sections.")

    locale = normalize_lang(lang)
    questions_text = format_questions_for_prompt(lang=locale)
    sections = list(PROMPT_FILES.keys())
    out: Dict[str, str] = {k: "" for k in sections}

    with ThreadPoolExecutor(max_workers=min(max_workers, len(sections))) as pool:
        futures = {
            pool.submit(
                _generate_one_section,
                openrouter_key=openrouter_key,
                model=model,
                section=sec,
                transcript=t[:120_000],
                client_name=client_name,
                questions_text=questions_text,
            ): sec
            for sec in sections
        }
        for fut in as_completed(futures):
            sec, text = fut.result()
            out[sec] = text

    offer = _extract_offer_from_brand_map(out.get("brand_map", ""))
    out["offer_documentation"] = offer
    return out
