"""Tests for verbatim source capture (1:1 reel recreation)."""

from routers.generation import _analysis_video_analyzed, _verbatim_from_analysis_row
from services.content_generation import (
    _VERBATIM_ON_SCREEN_TEXT_MAX,
    _apply_verbatim_hook_blocks_split,
    _enforce_verbatim_text_blocks,
    _verbatim_capture_beats_slice,
    _verbatim_capture_from_patterns,
    build_source_reference_for_patterns,
    compact_analysis_for_prompt,
)
from services.reel_analyze_parse import _extract_verbatim_capture, parse_silas_analysis_text


_VERBATIM_TAIL = """
═══════════════════════════════════════════
VERBATIM SOURCE CAPTURE (for exact recreation — do NOT translate or paraphrase here)
═══════════════════════════════════════════
ON-SCREEN TEXT (verbatim, in display order — one block per line, exactly as shown, original language):
- An HR manager told me why some employees suddenly become "the problem"...
- and I haven't looked at work the same way since.

SPOKEN TRANSCRIPT (verbatim voiceover/dialogue, original language; write "none" if silent):
none
"""


def test_extract_verbatim_capture_on_screen_blocks():
    vc = _extract_verbatim_capture(_VERBATIM_TAIL)
    assert vc is not None
    assert len(vc["on_screen_text"]) == 2
    assert vc["on_screen_text"][0]["is_cta"] is False
    assert "HR manager" in vc["on_screen_text"][0]["text"]
    assert vc["spoken_transcript"] == ""
    assert vc["source_has_on_screen_cta"] is False


def test_extract_verbatim_capture_cta_marker():
    text = """
VERBATIM SOURCE CAPTURE
ON-SCREEN TEXT (verbatim, in display order — one block per line, exactly as shown, original language):
- Comment KEYWORD below  [CTA]

SPOKEN TRANSCRIPT (verbatim voiceover/dialogue, original language; write "none" if silent):
Hello world
"""
    vc = _extract_verbatim_capture(text)
    assert vc is not None
    assert len(vc["on_screen_text"]) == 1
    assert vc["on_screen_text"][0]["is_cta"] is True
    assert vc["source_has_on_screen_cta"] is True
    assert "Hello world" in vc["spoken_transcript"]


def test_parse_silas_includes_verbatim_capture():
    minimal = (
        "1. HOOK STRENGTH\nScore: 6/10\nEvidence: test\n"
        "---\n2. SPECIFICITY\nScore: 6/10\nEvidence: test\n"
        "---\n3. RELATABILITY\nScore: 6/10\nEvidence: test\n"
        "---\n4. COGNITIVE TENSION\nScore: 6/10\nEvidence: test\n"
        "---\n5. CLEAR VALUE\nScore: 6/10\nEvidence: test\n"
        "---\n6. CAPTION & SAVE VALUE\nScore: 6/10\nEvidence: test\n"
        "---\n7. INTERACTION TRIGGER\nScore: 6/10\nEvidence: test\n"
        "TOTAL SCORE: 60/100\n"
        + _VERBATIM_TAIL
    )
    parsed = parse_silas_analysis_text(minimal)
    assert parsed.get("verbatim_capture") is not None
    assert len(parsed["verbatim_capture"]["on_screen_text"]) == 2


def test_compact_and_source_reference_thread_verbatim():
    row = {
        "id": "a1",
        "post_url": "https://www.instagram.com/reel/abc/",
        "full_analysis_json": {
            "full_text": "x",
            "verbatim_capture": {
                "on_screen_text": [{"text": "Hook line", "is_cta": False}],
                "spoken_transcript": "",
                "source_has_on_screen_cta": False,
            },
        },
    }
    packed = compact_analysis_for_prompt(row)
    assert "verbatim_capture" in packed
    patterns = {"hook_patterns": []}
    merged = build_source_reference_for_patterns(packed)
    assert merged is not None
    assert merged["verbatim_capture"]["on_screen_text"][0]["text"] == "Hook line"
    patterns["source_reference"] = merged
    assert _verbatim_capture_from_patterns(patterns) is not None


def test_enforce_verbatim_text_blocks_trims_and_fixes_cta():
    verbatim = {
        "on_screen_text": [
            {"text": "Line one", "is_cta": False},
            {"text": "Line two", "is_cta": False},
        ],
        "source_has_on_screen_cta": False,
    }
    generated = [
        {"text": "Eins", "isCTA": False},
        {"text": "Zwei", "isCTA": False},
        {"text": "Extra invented", "isCTA": True},
    ]
    out = _enforce_verbatim_text_blocks(generated, verbatim)
    assert out is not None
    assert len(out) == 2
    assert out[0]["text"] == "Eins"
    assert out[1]["isCTA"] is False


def test_enforce_verbatim_no_60_char_truncation():
    long_de = (
        "Eine HR-Managerin hat mir mal verraten, warum manche Mitarbeiter "
        "plötzlich zum Problemfall werden und niemand es erklärt"
    )
    assert len(long_de) > 60
    verbatim = {
        "on_screen_text": [{"text": "x", "is_cta": False}],
        "source_has_on_screen_cta": False,
    }
    out = _enforce_verbatim_text_blocks([{"text": long_de, "isCTA": False}], verbatim)
    assert out is not None
    assert len(out[0]["text"]) == len(long_de)
    assert _VERBATIM_ON_SCREEN_TEXT_MAX >= 500


def test_verbatim_beats_slice():
    vc = {
        "on_screen_text": [
            {"text": "Line one", "is_cta": False},
            {"text": "Line two", "is_cta": False},
        ],
        "source_has_on_screen_cta": False,
    }
    beats = _verbatim_capture_beats_slice(vc)
    assert len(beats["on_screen_text"]) == 1
    assert beats["on_screen_text"][0]["text"] == "Line two"


def test_apply_verbatim_hook_blocks_split_two_lines():
    verbatim = {
        "on_screen_text": [
            {"text": "An HR manager told me why some employees suddenly become the problem", "is_cta": False},
            {"text": "and I haven't looked at work the same way since.", "is_cta": False},
        ],
        "source_has_on_screen_cta": False,
    }
    raw_blocks = [
        {"text": "Eine HR-Managerin hat mir verraten, warum manche Mitarbeiter zum Problem werden", "isCTA": False},
        {"text": "und ich sehe die Arbeitswelt seitdem anders.", "isCTA": False},
    ]
    hooks, beats = _apply_verbatim_hook_blocks_split(
        raw_text_blocks=raw_blocks,
        raw_hooks=[{"text": "Eine HR-Managerin hat mir verraten, warum manche Mitarbeiter zum Problem werden"}],
        verbatim_capture=verbatim,
    )
    assert len(hooks) >= 1
    assert hooks[0]["text"] == raw_blocks[0]["text"]
    assert beats is not None
    assert len(beats) == 1
    assert beats[0]["text"] == raw_blocks[1]["text"]
    assert hooks[0]["text"] != beats[0]["text"]


def test_verbatim_from_analysis_row_requires_video():
    """Caption-only analyses may contain bogus verbatim; ignore unless video was watched."""
    row = {
        "full_analysis_json": {
            "video_analyzed": False,
            "media_provenance": {"video_analyzed": False, "media_type": "none"},
            "verbatim_capture": {
                "on_screen_text": [{"text": "Months 1-6: You tell yourself it's not that bad.", "is_cta": False}],
                "spoken_transcript": "",
            },
        }
    }
    assert _verbatim_from_analysis_row(row) is None


def test_verbatim_from_analysis_row_accepts_video_verbatim():
    row = {
        "full_analysis_json": {
            "video_analyzed": True,
            "verbatim_capture": {
                "on_screen_text": [
                    {"text": "It takes 12-18 months for the wrong manager to break someone.", "is_cta": False},
                    {"text": "Here's how it usually happens.", "is_cta": False},
                ],
                "spoken_transcript": "",
            },
        }
    }
    vc = _verbatim_from_analysis_row(row)
    assert vc is not None
    assert len(vc["on_screen_text"]) == 2


def test_analysis_video_analyzed_prefers_media_provenance():
    fa = {"media_provenance": {"video_analyzed": True}, "video_analyzed": False}
    assert _analysis_video_analyzed(fa) is True
    fa2 = {"media_provenance": {"video_analyzed": False}, "video_analyzed": True}
    assert _analysis_video_analyzed(fa2) is False


def test_text_only_analysis_must_not_persist_verbatim():
    """Mirrors _upsert_reel_analysis: verbatim_capture only when video_analyzed."""
    video_analyzed = False
    parsed_vc = {"on_screen_text": [{"text": "caption line", "is_cta": False}], "spoken_transcript": ""}
    full_analysis_json: dict = {}
    if video_analyzed:
        full_analysis_json["verbatim_capture"] = parsed_vc
    assert "verbatim_capture" not in full_analysis_json


def test_apply_verbatim_hook_blocks_split_single_line():
    verbatim = {
        "on_screen_text": [{"text": "Only one line on screen", "is_cta": False}],
        "source_has_on_screen_cta": False,
    }
    hooks, beats = _apply_verbatim_hook_blocks_split(
        raw_text_blocks=[{"text": "Nur eine Zeile", "isCTA": False}],
        raw_hooks=[],
        verbatim_capture=verbatim,
    )
    assert hooks[0]["text"] == "Nur eine Zeile"
    assert beats is None
