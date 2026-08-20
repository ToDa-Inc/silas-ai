"""Canonical onboarding voice questions (bilingual DE/EN)."""

from __future__ import annotations

from typing import Any, Dict, List, Literal

OnboardingLang = Literal["de", "en"]

ONBOARDING_VOICE_QUESTIONS: List[Dict[str, Any]] = [
    {
        "id": "1",
        "text_de": (
            "Wer bist du und was ist deine Geschichte – beruflich und persönlich? "
            "Was ist die Mission deines Business, und welches Problem am Markt hat dich zur Gründung bewegt?"
        ),
        "text_en": (
            "Who are you and what is your story — professionally and personally? "
            "What is your business mission, and what market problem drove you to start?"
        ),
        "feeds": ["icp", "brand_map", "story_board", "communication_guideline"],
    },
    {
        "id": "2",
        "text_de": "Wie hoch ist dein aktueller Jahresumsatz, und wo liegt momentan dein größter Engpass?",
        "text_en": "What is your current annual revenue, and where is your biggest bottleneck right now?",
        "feeds": ["brand_map"],
    },
    {
        "id": "3",
        "text_de": "Was unterscheidet dich klar von anderen Anbietern in deiner Branche?",
        "text_en": "What clearly differentiates you from other providers in your industry?",
        "feeds": ["brand_map"],
    },
    {
        "id": "4",
        "text_de": (
            "Liste deine Angebote auf (Name, Inhalt, Preis, Zielgruppe) – welches ist dein Hauptfokus?"
        ),
        "text_en": (
            "List your offers (name, content, price, target audience) — which is your main focus?"
        ),
        "feeds": ["brand_map", "offer_documentation"],
    },
    {
        "id": "5",
        "text_de": (
            "Welche Transformation durchlaufen deine Kunden bei dir, und hast du eine eigene "
            "Methode oder ein System dafür?"
        ),
        "text_en": (
            "What transformation do your clients go through with you, and do you have your own "
            "method or system for it?"
        ),
        "feeds": ["brand_map", "story_board"],
    },
    {
        "id": "6",
        "text_de": "Wie kommen aktuell neue Leads zu dir, und wie läuft ein Verkaufsgespräch bei dir ab?",
        "text_en": "How do new leads currently find you, and how does a sales conversation work for you?",
        "feeds": ["brand_map", "icp"],
    },
    {
        "id": "7",
        "text_de": "Was ist dein bisher erfolgreichster Kundenfall (mit konkretem Ergebnis)?",
        "text_en": "What is your most successful client case so far (with a concrete result)?",
        "feeds": ["story_board"],
    },
    {
        "id": "8",
        "text_de": (
            "Wer genau ist dein idealer Kunde – demografisch und psychografisch – "
            "und was ist sein größtes Problem?"
        ),
        "text_en": (
            "Who exactly is your ideal customer — demographically and psychographically — "
            "and what is their biggest problem?"
        ),
        "feeds": ["icp"],
    },
    {
        "id": "9",
        "text_de": (
            "Was sind deine wichtigsten Ziele für dein Business und deine Content-Strategie "
            "in den nächsten 6–12 Monaten?"
        ),
        "text_en": (
            "What are your most important goals for your business and content strategy "
            "in the next 6–12 months?"
        ),
        "feeds": ["brand_map"],
    },
    {
        "id": "10",
        "text_de": (
            "Wie soll sich deine Marke anfühlen und aussehen – "
            "und was möchtest du auf keinen Fall sehen?"
        ),
        "text_en": (
            "How should your brand feel and look — and what do you never want to see?"
        ),
        "feeds": ["brand_map", "communication_guideline"],
    },
]


def normalize_lang(lang: str | None) -> OnboardingLang:
    l = (lang or "de").strip().lower()
    return "en" if l == "en" else "de"


def stt_language_hint(lang: str | None) -> str | None:
    """Chirp language hint. None = auto-detect (omit language param)."""
    l = (lang or "auto").strip().lower()
    if l in ("auto", ""):
        return None
    return "en" if l == "en" else "de"


def detect_lang_from_text(text: str, *, fallback: OnboardingLang = "de") -> OnboardingLang:
    """Lightweight DE/EN guess from transcript text (post-STT)."""
    t = f" {text.lower()} "
    de_markers = (
        " ich ", " und ", " der ", " die ", " das ", " ist ", " nicht ", " wir ", " für ",
        " geschäft ", " kunden ", " umsatz ", " marke ",
    )
    en_markers = (
        " the ", " and ", " is ", " my ", " i ", " we ", " our ", " business ", " customer ",
        " revenue ", " brand ", " you ",
    )
    de_score = sum(t.count(m) for m in de_markers) + sum(text.count(c) for c in "äöüßÄÖÜ")
    en_score = sum(t.count(m) for m in en_markers)
    if en_score > de_score * 1.15:
        return "en"
    if de_score > en_score * 1.15:
        return "de"
    return fallback


def format_questions_bilingual_for_prompt() -> str:
    lines: list[str] = []
    for q in ONBOARDING_VOICE_QUESTIONS:
        lines.append(
            f"{q['id']}.\n"
            f"  DE: {q.get('text_de', '')}\n"
            f"  EN: {q.get('text_en', '')}"
        )
    return "\n\n".join(lines)


def question_text(q: Dict[str, Any], lang: OnboardingLang) -> str:
    key = f"text_{lang}"
    alt = "text_en" if lang == "de" else "text_de"
    return str(q.get(key) or q.get(alt) or "").strip()


def format_questions_for_prompt(*, lang: OnboardingLang = "de") -> str:
    lines: list[str] = []
    for q in ONBOARDING_VOICE_QUESTIONS:
        lines.append(f"{q['id']}. {question_text(q, lang)}")
    return "\n".join(lines)


def build_transcript_from_answers(answers: Dict[str, str], *, lang: OnboardingLang = "de") -> str:
    """Join per-question answers into the transcript shape used by brain generation."""
    parts: list[str] = []
    for q in ONBOARDING_VOICE_QUESTIONS:
        qid = str(q["id"])
        ans = (answers.get(qid) or "").strip()
        if not ans:
            continue
        parts.append(f"# Question {qid}: {question_text(q, lang)}\n{ans}")
    return "\n\n".join(parts).strip()
