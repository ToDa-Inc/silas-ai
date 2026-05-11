"""Build reel dicts for Gemini niche gate from Apify instagram-scraper enrich output.

Used by ``profile_scrape`` (competitor path) before upserting ``scraped_reels``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from jobs.keyword_reel_similarity import (
    _caption,
    _cv_ratio,
    _duration_seconds,
    _owner_username,
    _post_url,
    _views,
)
from services.apify_posted_at import apify_instagram_item_posted_at_iso
from services.instagram_post_url import (
    canonical_instagram_post_url,
    canonical_reel_url_from_short_code,
    instagram_post_short_code,
    instagram_post_url_lookup_variants,
)
from services.reel_thumbnail_url import reel_thumbnail_url_from_apify_item

DEFAULT_PROFILE_SIMILARITY_THRESHOLD = 80
REJECTED_EXAMPLES_CAP = 10


def short_code_from_enriched_item(item: dict) -> str:
    sc = (str(item.get("shortCode") or "")).strip()
    if sc:
        return sc
    return instagram_post_short_code(_post_url(item)) or ""


def enriched_item_to_similarity_reel_dict(
    item: dict, *, keywords: Sequence[str]
) -> Dict[str, Any]:
    """Same shape as ``scripts/batch_rescore_scraped_reels_similarity._reel_dict_from_item``."""
    sc = short_code_from_enriched_item(item)
    if not sc:
        raise ValueError("enriched item missing shortCode")
    views = _views(item)
    comments = int(item.get("commentsCount") or 0)
    username = _owner_username(item) or "unknown"
    ig_t = str(item.get("type") or "").strip()
    if ig_t in ("Sidecar", "GraphSidecar"):
        fmt = "carousel"
    elif ig_t in ("Image", "GraphImage"):
        fmt = "image"
    else:
        fmt = "reel"
    return {
        "url": canonical_instagram_post_url(canonical_reel_url_from_short_code(sc)),
        "username": username,
        "caption": _caption(item),
        "views": views,
        "likes": max(0, int(item.get("likesCount") or 0)),
        "comments": comments,
        "cv_ratio": _cv_ratio(views, comments),
        "video_url": item.get("videoUrl") or "",
        "video_duration": _duration_seconds(item.get("videoDuration") or item.get("duration")),
        "posted_at": apify_instagram_item_posted_at_iso(item) or "",
        "keywords": list(keywords),
        "thumbnail_url": reel_thumbnail_url_from_apify_item(item) or None,
        "ig_type": ig_t,
        "display_url": str(item.get("displayUrl") or item.get("display_url") or "").strip(),
        "child_posts": item.get("childPosts") if isinstance(item.get("childPosts"), list) else [],
        "_enriched_format": fmt,
    }


def index_enriched_items_by_lookup_url(items: List[dict]) -> Dict[str, dict]:
    """Map every URL variant from enrich output to the item (last wins on collision)."""
    out: Dict[str, dict] = {}
    for item in items or []:
        raw = _post_url(item) or ""
        if not raw.strip():
            raw = canonical_reel_url_from_short_code(short_code_from_enriched_item(item))
        for v in instagram_post_url_lookup_variants(raw):
            out[v] = item
    return out


def lookup_enriched_for_url(
    enriched_index: Dict[str, dict], canonical_post_url: str
) -> Optional[dict]:
    """Resolve enriched item using the same variant keys as batch rescoring."""
    u = canonical_instagram_post_url(canonical_post_url)
    if not u:
        return None
    for v in instagram_post_url_lookup_variants(u):
        hit = enriched_index.get(v)
        if hit is not None:
            return hit
    return None
