"""Merge onboarding output into an existing client_context without destroying user-provided docs.

Onboarding (voice or typed answers) drafts strategy docs from a short transcript. It must never
replace docs the client uploaded or wrote by hand: running onboarding again on an established
client once replaced a full uploaded brain with a 30-second test recording.

Rule: a section is protected when it has non-empty text and its source is ``upload`` or
``manual``. Protected sections are kept as-is; every other section may be filled or refreshed.
The onboarding transcript itself is only protected when it came from an upload, so onboarding
can still refresh its own earlier transcript.
"""

from __future__ import annotations

from typing import Any, Dict, Mapping, Tuple

PROTECTED_SOURCES = frozenset({"upload", "manual"})
TRANSCRIPT_KEY = "onboarding_transcript"


def _is_protected(entry: Any, *, protected_sources: frozenset[str]) -> bool:
    if not isinstance(entry, Mapping):
        return False
    text = str(entry.get("text") or "").strip()
    return bool(text) and str(entry.get("source") or "") in protected_sources


def merge_onboarding_context(
    existing: Any,
    incoming: Mapping[str, Any],
) -> Tuple[Dict[str, Any], list[str]]:
    """Return (merged client_context, keys kept because they are protected)."""
    merged: Dict[str, Any] = dict(existing) if isinstance(existing, Mapping) else {}
    kept: list[str] = []
    for key, entry in incoming.items():
        sources = frozenset({"upload"}) if key == TRANSCRIPT_KEY else PROTECTED_SOURCES
        if _is_protected(merged.get(key), protected_sources=sources):
            kept.append(key)
            continue
        merged[key] = entry
    return merged, kept
