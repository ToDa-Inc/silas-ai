from services.onboarding_context_merge import merge_onboarding_context


def _e(text, source):
    return {"text": text, "source": source, "file": None, "updated_at": "t"}


def test_uploaded_and_manual_docs_survive_onboarding():
    existing = {
        "icp": _e("Uploaded ICP", "upload"),
        "brand_map": _e("Hand-written brand map", "manual"),
        "story_board": _e("Old draft", "generated"),
    }
    incoming = {
        "icp": _e("Sports ICP", "generated"),
        "brand_map": _e("Sports brand", "generated"),
        "story_board": _e("New draft", "generated"),
        "offer_documentation": _e("New offer", "generated"),
    }
    merged, kept = merge_onboarding_context(existing, incoming)
    assert merged["icp"]["text"] == "Uploaded ICP"
    assert merged["brand_map"]["text"] == "Hand-written brand map"
    assert merged["story_board"]["text"] == "New draft"
    assert merged["offer_documentation"]["text"] == "New offer"
    assert sorted(kept) == ["brand_map", "icp"]


def test_empty_protected_entry_can_be_filled():
    merged, kept = merge_onboarding_context({"icp": _e("  ", "upload")}, {"icp": _e("Draft", "generated")})
    assert merged["icp"]["text"] == "Draft"
    assert kept == []


def test_transcript_only_protected_when_uploaded():
    incoming = {"onboarding_transcript": _e("New answers", "voice")}
    merged, _ = merge_onboarding_context({"onboarding_transcript": _e("Old answers", "manual")}, incoming)
    assert merged["onboarding_transcript"]["text"] == "New answers"
    merged, kept = merge_onboarding_context({"onboarding_transcript": _e("Uploaded", "upload")}, incoming)
    assert merged["onboarding_transcript"]["text"] == "Uploaded"
    assert kept == ["onboarding_transcript"]


def test_sections_not_in_incoming_are_kept():
    merged, _ = merge_onboarding_context(
        {"communication_guideline": _e("Guide", "generated")}, {"icp": _e("Draft", "generated")}
    )
    assert merged["communication_guideline"]["text"] == "Guide"


def test_non_dict_existing_context():
    merged, kept = merge_onboarding_context(None, {"icp": _e("Draft", "generated")})
    assert merged == {"icp": _e("Draft", "generated")}
    assert kept == []
