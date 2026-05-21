"""Resolve Instagram post/reel URLs to video or ordered slide images (Apify instagram-scraper).

Used by URL analysis, keyword similarity, and carousel re-analysis paths. Slide bytes are
ephemeral — callers persist only provenance (counts, media_type), not image URLs or blobs.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import Any, List, Literal, Optional, Sequence

import httpx
from PIL import Image

from services.apify import enrich_reel_urls_direct
from services.instagram_post_url import canonical_instagram_post_url

logger = logging.getLogger(__name__)

MediaKind = Literal["video", "carousel", "image", "unknown"]

# Align with keyword_reel_similarity / OpenRouter video cap
_DEFAULT_MAX_TOTAL_BYTES = 15 * 1024 * 1024
_DEFAULT_PER_SLIDE_BYTES = int(1.5 * 1024 * 1024)
_DEFAULT_SLIDE_CAP = 8
_DEFAULT_LONG_EDGE = 1280


@dataclass
class ResolvedPostMedia:
    """Single enriched Instagram post from ``apify~instagram-scraper``."""

    kind: MediaKind
    post_url: str
    item: dict[str, Any]
    video_url: str
    """MP4 URL when ``kind == \"video\"``."""
    slide_urls: List[str]
    """Ordered image URLs for carousel / single image (subset capped by ``slide_cap``)."""


def media_kind_from_apify_item(item: dict[str, Any]) -> MediaKind:
    t = str(item.get("type") or "").strip()
    if t in ("Sidecar", "GraphSidecar"):
        return "carousel"
    if t in ("Image", "GraphImage"):
        return "image"
    if t in ("Video", "GraphVideo"):
        return "video"
    return "unknown"


def slide_urls_from_item(
    item: dict[str, Any],
    *,
    slide_cap: int = _DEFAULT_SLIDE_CAP,
) -> List[str]:
    """Ordered CDN URLs for carousel or single-image posts (no network I/O)."""
    kind = media_kind_from_apify_item(item)
    out: List[str] = []

    if kind == "carousel":
        children = item.get("childPosts")
        if not isinstance(children, list):
            return []
        for child in children[:slide_cap]:
            if not isinstance(child, dict):
                continue
            ct = str(child.get("type") or "").strip()
            url = ""
            if ct in ("Image", "GraphImage"):
                url = str(child.get("displayUrl") or child.get("display_url") or "").strip()
            elif ct in ("Video", "GraphVideo"):
                # Prefer still preview; reel child may have displayUrl without MP4 in payload
                url = str(
                    child.get("displayUrl")
                    or child.get("display_url")
                    or child.get("thumbnailUrl")
                    or child.get("thumbnail_src")
                    or ""
                ).strip()
            if url:
                out.append(url)
        return out

    if kind == "image":
        u = str(item.get("displayUrl") or item.get("display_url") or "").strip()
        if u:
            out.append(u)
    return out


def resolve_post_media(
    token: str,
    url: str,
    *,
    slide_cap: int = _DEFAULT_SLIDE_CAP,
) -> Optional[ResolvedPostMedia]:
    """Fetch one post via ``enrich_reel_urls_direct`` (``apify~instagram-scraper``).

    Returns ``None`` if Apify returns no items.
    """
    canon = canonical_instagram_post_url(url.strip())
    items, errors, _usage_limit_hit = enrich_reel_urls_direct(token, [canon])
    if errors:
        for e in errors:
            logger.warning("resolve_post_media enrich: %s", e)
    if not items:
        return None
    item = items[0]
    kind = media_kind_from_apify_item(item)
    vu = str(item.get("videoUrl") or item.get("video_url") or "").strip()
    slides = slide_urls_from_item(item, slide_cap=slide_cap)

    if kind == "video" and vu:
        return ResolvedPostMedia(
            kind="video",
            post_url=canon,
            item=item,
            video_url=vu,
            slide_urls=[],
        )
    if kind == "carousel" and slides:
        return ResolvedPostMedia(
            kind="carousel",
            post_url=canon,
            item=item,
            video_url="",
            slide_urls=slides,
        )
    if kind == "image" and slides:
        return ResolvedPostMedia(
            kind="image",
            post_url=canon,
            item=item,
            video_url="",
            slide_urls=slides,
        )
    # Video type but missing URL — treat as unknown (caller may fall back to caption-only)
    if kind == "video" and not vu:
        return ResolvedPostMedia(
            kind="unknown",
            post_url=canon,
            item=item,
            video_url="",
            slide_urls=[],
        )
    return ResolvedPostMedia(
        kind="unknown",
        post_url=canon,
        item=item,
        video_url=vu,
        slide_urls=slides,
    )


def _download_url_bytes(url: str, *, max_bytes: int) -> Optional[bytes]:
    if not url:
        return None
    try:
        timeout = httpx.Timeout(connect=15.0, read=30.0, write=10.0, pool=5.0)
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            with client.stream("GET", url) as r:
                if r.status_code == 403:
                    return None
                r.raise_for_status()
                buf = io.BytesIO()
                n = 0
                for chunk in r.iter_bytes(chunk_size=64 * 1024):
                    n += len(chunk)
                    if n > max_bytes:
                        return None
                    buf.write(chunk)
                data = buf.getvalue()
                return data if data else None
    except Exception:
        logger.debug("slide download failed for url prefix=%s", url[:80], exc_info=True)
        return None


def _resize_to_jpeg_bytes(raw: bytes, *, long_edge: int, quality: int = 85) -> Optional[bytes]:
    try:
        im = Image.open(io.BytesIO(raw))
        im = im.convert("RGB")
        w, h = im.size
        if w <= 0 or h <= 0:
            return None
        max_side = max(w, h)
        if max_side > long_edge:
            scale = long_edge / float(max_side)
            im = im.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        im.save(out, format="JPEG", quality=quality, optimize=True)
        return out.getvalue()
    except Exception:
        logger.debug("JPEG resize failed", exc_info=True)
        return None


def download_slide_images(
    urls: Sequence[str],
    *,
    max_total_bytes: int = _DEFAULT_MAX_TOTAL_BYTES,
    per_slide_bytes_max: int = _DEFAULT_PER_SLIDE_BYTES,
    long_edge: int = _DEFAULT_LONG_EDGE,
) -> List[bytes]:
    """Download and resize slide URLs to JPEG bytes; enforce aggregate size budget.

    Stops when adding another slide would exceed ``max_total_bytes``.
    """
    out: List[bytes] = []
    total = 0
    for url in urls:
        if not url:
            continue
        raw = _download_url_bytes(url, max_bytes=per_slide_bytes_max * 2)
        if not raw:
            continue
        jpeg = _resize_to_jpeg_bytes(raw, long_edge=long_edge)
        if not jpeg:
            continue
        if len(jpeg) > per_slide_bytes_max:
            # Second pass: stronger downscale if still too large
            smaller = _resize_to_jpeg_bytes(raw, long_edge=max(480, long_edge // 2), quality=75)
            jpeg = smaller or jpeg
        if len(jpeg) > per_slide_bytes_max:
            continue
        if total + len(jpeg) > max_total_bytes:
            break
        out.append(jpeg)
        total += len(jpeg)
    return out
