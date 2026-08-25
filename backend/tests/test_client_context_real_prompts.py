"""Language instructions for onboarding strategy-doc generation."""

from services.client_context_real_prompts import (
    _extract_offer_from_brand_map,
    output_language_instruction,
)


def test_german_instruction_requires_translated_headings():
    note = output_language_instruction("de")
    assert "German" in note or "Deutsch" in note
    assert "Additional Observations" in note
    assert "Weitere Beobachtungen" in note
    assert "headings" in note.lower()


def test_english_instruction_keeps_english_headings():
    note = output_language_instruction("en")
    assert "English" in note
    assert "Weitere Beobachtungen" not in note


def test_extract_offer_from_german_brand_map():
    brand_map = """1. Geschäftsinformationen:
Firma X

2. Angebote:
12-Wochen-Programm, 497€

3. Vision und Ziele:
Mehr Reichweite
"""
    assert "12-Wochen-Programm" in _extract_offer_from_brand_map(brand_map)
