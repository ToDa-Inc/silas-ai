from __future__ import annotations

from typing import Any, Dict, Optional

from services.format_classifier import canonicalize_stored_format_key, normalize_format_string


SHORT_TEXT_OVERLAY_SECONDS = 15.0


def _positive_seconds(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    try:
        seconds = float(raw)
    except (TypeError, ValueError):
        return None
    return seconds if seconds > 0 else None


def _first_duration_seconds(*sources: Any) -> Optional[float]:
    for source in sources:
        if not isinstance(source, dict):
            continue
        for key in ("video_duration", "videoDuration", "duration", "length"):
            seconds = _positive_seconds(source.get(key))
            if seconds is not None:
                return seconds
        nested = source.get("video")
        if isinstance(nested, dict):
            seconds = _first_duration_seconds(nested)
            if seconds is not None:
                return seconds
    return None


def _looks_like_carousel(raw: Any) -> bool:
    text = str(raw or "").strip()
    if not text:
        return False
    canonical = canonicalize_stored_format_key(text)
    if canonical == "carousel":
        return True
    normalized = normalize_format_string(text)
    if normalized == "carousel":
        return True
    lowered = text.lower()
    return any(token in lowered for token in ("carousel", "sidecar", "album", "multi_image", "multi-image"))


def _fallback_from_normalized_format(raw: Any) -> str:
    text = str(raw or "").strip()
    canonical = canonicalize_stored_format_key(text) or normalize_format_string(text)
    if canonical in {"text_overlay", "b_roll_reel", "carousel", "talking_head"}:
        return canonical
    return "text_overlay"


def recommend_url_adapt_format(
    analysis: Dict[str, Any],
    *,
    reel_meta: Optional[Dict[str, Any]] = None,
) -> str:
    """Choose the production format for URL adaptation when the user picked Auto.

    Media/container type wins first because carousels do not have a meaningful
    video duration. For video posts, short sources become text overlays and
    longer sources become talking-head scripts.
    """
    meta = reel_meta if isinstance(reel_meta, dict) else {}

    if any(
        _looks_like_carousel(value)
        for value in (
            meta.get("format"),
            meta.get("media_type"),
            meta.get("mediaType"),
            meta.get("type"),
            analysis.get("normalized_format"),
        )
    ):
        return "carousel"

    duration = _first_duration_seconds(meta, analysis)
    if duration is not None:
        return "text_overlay" if duration < SHORT_TEXT_OVERLAY_SECONDS else "talking_head"

    return _fallback_from_normalized_format(analysis.get("normalized_format"))
