"""Refresh expired Instagram CDN thumbnail_url values on scraped_reels rows.

IG displayUrl tokens expire in ~24h. We re-fetch via Apify only for rows we are
about to render (or priority daily picks in scraped_reels_refresh).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from core.config import Settings
from services.apify import enrich_reel_urls_direct
from services.daily_opportunities import today_snapshot_priority_reel_ids
from services.instagram_post_url import canonical_instagram_post_url
from services.reel_thumbnail_url import reel_thumbnail_url_from_apify_item
from supabase import Client

logger = logging.getLogger(__name__)

# Align with scraped_reels_refresh skip window — URLs are rewritten on each enrich.
THUMBNAIL_STALE_HOURS = 20


def _parse_ts_iso(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def is_thumbnail_stale(
    row: Dict[str, Any],
    *,
    now_utc: datetime,
    max_age_hours: int = THUMBNAIL_STALE_HOURS,
) -> bool:
    if not str(row.get("thumbnail_url") or "").strip():
        return True
    parsed = _parse_ts_iso(row.get("last_updated_at"))
    if parsed is None:
        return True
    return (now_utc - parsed) >= timedelta(hours=max_age_hours)


def _item_canonical_url(item: Dict[str, Any]) -> str:
    raw = item.get("url") or item.get("inputUrl") or ""
    if raw:
        return canonical_instagram_post_url(str(raw).strip())
    short = str(item.get("shortCode") or "").strip()
    if short:
        return canonical_instagram_post_url(f"https://www.instagram.com/reel/{short}/")
    return ""


def load_priority_refresh_rows(supabase: Client, client_id: str) -> List[Dict[str, Any]]:
    ids = today_snapshot_priority_reel_ids(supabase, client_id)
    if not ids:
        return []
    try:
        res = (
            supabase.table("scraped_reels")
            .select("id, post_url, views, likes, comments, last_updated_at, thumbnail_url")
            .eq("client_id", client_id)
            .in_("id", ids)
            .execute()
        )
    except Exception as e:
        logger.warning("load_priority_refresh_rows failed: %s", e)
        return []
    by_id = {str(r["id"]): dict(r) for r in (res.data or []) if r.get("id")}
    return [by_id[i] for i in ids if i in by_id]


def merge_priority_into_refresh_pool(
    priority_rows: List[Dict[str, Any]],
    pool: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    if not priority_rows:
        return pool
    seen = {str(r["id"]) for r in priority_rows if r.get("id")}
    tail = [r for r in pool if str(r.get("id") or "") not in seen]
    return list(priority_rows) + tail


def refresh_stale_reel_thumbnails(
    supabase: Client,
    settings: Settings,
    rows: List[Dict[str, Any]],
    *,
    max_refresh: int = 50,
) -> None:
    """Apify-enrich stale rows and patch thumbnail_url (+ last_updated_at). Mutates ``rows``."""
    if not rows or max_refresh <= 0 or not settings.apify_api_token:
        return

    now = datetime.now(timezone.utc)
    stale = [r for r in rows if is_thumbnail_stale(r, now_utc=now)][:max_refresh]
    if not stale:
        return

    url_to_row: Dict[str, Dict[str, Any]] = {}
    for row in stale:
        canon = canonical_instagram_post_url(str(row.get("post_url") or "").strip())
        if canon:
            url_to_row[canon] = row

    if not url_to_row:
        return

    items, errors, _usage_hit = enrich_reel_urls_direct(
        settings.apify_api_token, list(url_to_row.keys())
    )
    if errors:
        logger.warning(
            "refresh_stale_reel_thumbnails: %d error(s), first=%s",
            len(errors),
            errors[0][:120] if errors else "",
        )

    now_iso = now.isoformat()
    for item in items:
        canon = _item_canonical_url(item)
        if not canon:
            continue
        row = url_to_row.get(canon)
        if not row:
            continue
        thumb = reel_thumbnail_url_from_apify_item(item)
        if not thumb:
            continue
        reel_id = str(row.get("id") or "")
        if not reel_id:
            continue
        try:
            supabase.table("scraped_reels").update(
                {"thumbnail_url": thumb, "last_updated_at": now_iso}
            ).eq("id", reel_id).execute()
        except Exception as e:
            logger.warning("thumbnail patch failed reel=%s: %s", reel_id, e)
            continue
        row["thumbnail_url"] = thumb
        row["last_updated_at"] = now_iso
