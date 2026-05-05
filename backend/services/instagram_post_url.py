"""Canonical Instagram post/reel URLs for UNIQUE(client_id, post_url) deduplication."""

from __future__ import annotations

import re

# Matches reel, reels, /p/, and /tv/ paths; short code is the first path segment after the type.
_IG_SHORT_CODE_RE = re.compile(
    r"instagram\.com/(?:reels|reel|p|tv)/([^/?#]+)",
    re.IGNORECASE,
)


def instagram_post_short_code(url: str) -> str:
    """Extract media short code from an Instagram reel, post, or tv URL. Empty if not parseable."""
    if not url:
        return ""
    m = _IG_SHORT_CODE_RE.search(str(url))
    return (m.group(1) or "").strip() if m else ""


def canonical_reel_url_from_short_code(short_code: str) -> str:
    """Stable /reel/{shortCode} URL for storage — same media as /p/{shortCode}."""
    sc = (short_code or "").strip()
    if not sc:
        return ""
    return canonical_instagram_post_url(f"https://www.instagram.com/reel/{sc}")


def canonical_instagram_post_url(url: str) -> str:
    """Strip whitespace, query, fragment, and trailing slash so upserts match one row per post."""
    if not url:
        return ""
    return str(url).strip().split("?")[0].split("#")[0].rstrip("/")


def instagram_post_url_lookup_variants(url: str) -> list[str]:
    """Canonical ``post_url`` strings that may exist in ``scraped_reels`` for the same IG media.

    Rows may store ``/reel/{code}`` while the user pastes ``/p/{code}`` (or the reverse).
    """
    seen: dict[str, None] = {}
    base = canonical_instagram_post_url(url)
    if base:
        seen[base] = None
    sc = instagram_post_short_code(url)
    if sc:
        for path in (
            f"https://www.instagram.com/reel/{sc}",
            f"https://www.instagram.com/reels/{sc}",
            f"https://www.instagram.com/p/{sc}",
            f"https://www.instagram.com/tv/{sc}",
        ):
            c = canonical_instagram_post_url(path)
            if c:
                seen[c] = None
    return list(seen.keys())
