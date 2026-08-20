"""Daily home-feed opportunity snapshot — compute, store, and hydrate picks."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from core.config import Settings
from core.id_generator import generate_key
from services.reel_metrics import (
    _int_metric_val,
    enrich_engagement_metrics,
    normalize_scraped_reel_row_for_api,
)
from services.daily_post_draft import DRAFT_STATUS_PENDING, pick_primary_reel_id
from supabase import Client

logger = logging.getLogger(__name__)

DASHBOARD_LOOKBACK_DAYS = 3
DASHBOARD_LIMIT = 12
COMPETITOR_WIN_MIN_RATIO = 1.5


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


def _since_iso(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def select_fresh_niche_reel_ids(
    supabase: Client,
    client_id: str,
    *,
    days: int = DASHBOARD_LOOKBACK_DAYS,
    limit: int = DASHBOARD_LIMIT,
) -> List[str]:
    try:
        res = (
            supabase.table("scraped_reels")
            .select("id")
            .eq("client_id", client_id)
            .eq("source", "keyword_similarity")
            .gte("posted_at", _since_iso(days))
            .order("views", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as e:
        logger.warning("select_fresh_niche_reel_ids failed: %s", e)
        return []
    return [str(r["id"]) for r in (res.data or []) if r.get("id")]


def select_competitor_win_reel_ids(
    supabase: Client,
    client_id: str,
    *,
    days: int = DASHBOARD_LOOKBACK_DAYS,
    limit: int = DASHBOARD_LIMIT,
    min_ratio: float = COMPETITOR_WIN_MIN_RATIO,
) -> List[str]:
    try:
        res = (
            supabase.table("scraped_reels")
            .select("id, views, account_avg_views")
            .eq("client_id", client_id)
            .not_.is_("competitor_id", "null")
            .gte("posted_at", _since_iso(days))
            .execute()
        )
    except Exception as e:
        logger.warning("select_competitor_win_reel_ids failed: %s", e)
        return []

    enriched: List[Tuple[float, str]] = []
    for row in res.data or []:
        avg = _int_metric_val(row.get("account_avg_views"))
        views = _int_metric_val(row.get("views"))
        if avg <= 0 or views <= 0:
            continue
        ratio = views / float(avg)
        if ratio < min_ratio:
            continue
        rid = str(row.get("id") or "")
        if rid:
            enriched.append((ratio, rid))

    enriched.sort(key=lambda x: x[0], reverse=True)
    return [rid for _, rid in enriched[:limit]]


def hydrate_reels_by_ids(
    supabase: Client,
    client_id: str,
    reel_ids: List[str],
) -> List[Dict[str, Any]]:
    if not reel_ids:
        return []
    try:
        res = (
            supabase.table("scraped_reels")
            .select("*")
            .eq("client_id", client_id)
            .in_("id", reel_ids)
            .execute()
        )
    except Exception as e:
        logger.warning("hydrate_reels_by_ids failed: %s", e)
        return []

    by_id = {str(r["id"]): dict(r) for r in (res.data or []) if r.get("id")}
    out: List[Dict[str, Any]] = []
    for rid in reel_ids:
        row = by_id.get(rid)
        if not row:
            continue
        enrich_engagement_metrics(row)
        normalize_scraped_reel_row_for_api(row)
        out.append(row)
    return out


def today_snapshot_priority_reel_ids(supabase: Client, client_id: str) -> List[str]:
    """Today's dashboard pick IDs — primary first, then wins and fresh niche."""
    snap = _load_snapshot_row(supabase, client_id, _today_utc())
    if not snap:
        return []

    ids: List[str] = []
    seen: set[str] = set()
    primary = str(snap.get("primary_reel_id") or "").strip()
    if primary:
        ids.append(primary)
        seen.add(primary)

    for key in ("competitor_win_reel_ids", "fresh_niche_reel_ids"):
        raw = snap.get(key)
        if not isinstance(raw, list):
            continue
        for rid in raw:
            s = str(rid).strip()
            if s and s not in seen:
                ids.append(s)
                seen.add(s)
    return ids


def compute_and_store_daily_opportunities(
    supabase: Client,
    client_id: str,
    *,
    source: str = "cron",
    pick_date: Optional[date] = None,
) -> Dict[str, Any]:
    """Compute today's picks and insert once per (client, date). First writer wins."""
    day = pick_date or _today_utc()
    fresh_ids = select_fresh_niche_reel_ids(supabase, client_id)
    win_ids = select_competitor_win_reel_ids(supabase, client_id)
    primary_id = pick_primary_reel_id(win_ids, fresh_ids)
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": generate_key(8, prefix="dop_"),
        "client_id": client_id,
        "pick_date": day.isoformat(),
        "fresh_niche_reel_ids": fresh_ids,
        "competitor_win_reel_ids": win_ids,
        "primary_reel_id": primary_id,
        "draft_status": "pending",
        "computed_at": now,
        "source": source,
    }
    existing = _load_snapshot_row(supabase, client_id, day)
    if existing:
        return {
            "stored": False,
            "already_exists": True,
            "pick_date": day.isoformat(),
            "source": existing.get("source"),
        }

    try:
        supabase.table("client_daily_opportunities").insert(row).execute()
    except Exception as e:
        err = str(e)
        if "draft_status" in err or "primary_reel_id" in err:
            legacy_row = {
                k: v
                for k, v in row.items()
                if k not in ("primary_reel_id", "draft_status", "daily_session_id", "draft_error", "draft_attempted_at")
            }
            try:
                supabase.table("client_daily_opportunities").insert(legacy_row).execute()
            except Exception as e2:
                logger.warning("compute_and_store_daily_opportunities legacy insert failed: %s", e2)
                err = str(e2)
            else:
                return {
                    "stored": True,
                    "pick_date": day.isoformat(),
                    "fresh_count": len(fresh_ids),
                    "wins_count": len(win_ids),
                    "source": source,
                    "migration_hint": "Run backend/sql/phase34_daily_post_draft.sql for daily post drafts",
                }
        else:
            logger.warning("compute_and_store_daily_opportunities insert failed: %s", e)
        # Race: another writer may have inserted between check and insert.
        again = _load_snapshot_row(supabase, client_id, day)
        if again:
            return {
                "stored": False,
                "already_exists": True,
                "pick_date": day.isoformat(),
                "source": again.get("source"),
            }
        return {"stored": False, "error": err[:500]}

    return {
        "stored": True,
        "pick_date": day.isoformat(),
        "fresh_count": len(fresh_ids),
        "wins_count": len(win_ids),
        "source": source,
    }


def compute_daily_opportunities_all_clients(
    supabase: Client,
    settings: Optional[Settings] = None,
) -> Dict[str, Any]:
    try:
        res = supabase.table("clients").select("id").eq("is_active", True).execute()
    except Exception as e:
        logger.warning("compute_daily_opportunities_all_clients: %s", e)
        return {"clients_checked": 0, "stored": 0, "errors": [str(e)[:200]]}

    stored = 0
    errors: List[str] = []
    for c in res.data or []:
        cid = str(c.get("id") or "")
        if not cid:
            continue
        try:
            out = compute_and_store_daily_opportunities(supabase, cid, source="cron")
            if out.get("stored"):
                stored += 1
        except Exception as e:
            errors.append(f"{cid}: {type(e).__name__}")
    draft_summary: Dict[str, Any] = {}
    if settings is not None:
        from services.daily_post_draft import ensure_daily_post_drafts_all_clients

        draft_summary = ensure_daily_post_drafts_all_clients(supabase, settings)
    return {
        "clients_checked": len(res.data or []),
        "stored": stored,
        "errors": errors[:20],
        "drafts": draft_summary,
    }


def _load_snapshot_row(
    supabase: Client,
    client_id: str,
    pick_date: date,
) -> Optional[Dict[str, Any]]:
    try:
        res = (
            supabase.table("client_daily_opportunities")
            .select("*")
            .eq("client_id", client_id)
            .eq("pick_date", pick_date.isoformat())
            .limit(1)
            .execute()
        )
    except Exception:
        return None
    if not res.data:
        return None
    return dict(res.data[0])


def enrich_daily_post_from_snap(snap: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Normalize daily-post fields; derive primary + pending when phase34 columns are missing."""
    if not snap:
        return {
            "primary_reel_id": None,
            "daily_session_id": None,
            "draft_status": None,
            "draft_error": None,
            "draft_attempted_at": None,
        }
    fresh = (
        snap.get("fresh_niche_reel_ids")
        if isinstance(snap.get("fresh_niche_reel_ids"), list)
        else []
    )
    wins = (
        snap.get("competitor_win_reel_ids")
        if isinstance(snap.get("competitor_win_reel_ids"), list)
        else []
    )
    primary = str(snap.get("primary_reel_id") or "").strip() or pick_primary_reel_id(
        [str(x) for x in wins if str(x).strip()],
        [str(x) for x in fresh if str(x).strip()],
    )
    session_id = str(snap.get("daily_session_id") or "").strip() or None
    draft_status = str(snap.get("draft_status") or "").strip() or None
    if not draft_status and primary and not session_id:
        draft_status = DRAFT_STATUS_PENDING
    return {
        "primary_reel_id": primary or None,
        "daily_session_id": session_id,
        "draft_status": draft_status,
        "draft_error": str(snap.get("draft_error") or "") or None,
        "draft_attempted_at": snap.get("draft_attempted_at"),
    }


def reconcile_daily_post_fields(
    supabase: Client,
    client_id: str,
    snap: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Align snapshot draft fields with the live generation session (fast path to ready)."""
    from services.daily_post_draft import DRAFT_STATUS_READY, _patch_snapshot_draft

    daily = enrich_daily_post_from_snap(snap)
    if not snap or not daily.get("daily_session_id"):
        return daily

    session_id = str(daily["daily_session_id"])
    try:
        res = (
            supabase.table("generation_sessions")
            .select("id, status")
            .eq("client_id", client_id)
            .eq("id", session_id)
            .limit(1)
            .execute()
        )
    except Exception:
        return daily

    if not res.data:
        return daily

    session_status = str(res.data[0].get("status") or "")
    if session_status != "content_ready":
        return daily

    if daily.get("draft_status") == DRAFT_STATUS_READY:
        return daily

    pick_date_raw = snap.get("pick_date")
    if isinstance(pick_date_raw, str) and pick_date_raw.strip():
        pick_date = date.fromisoformat(pick_date_raw.strip()[:10])
    else:
        pick_date = _today_utc()

    _patch_snapshot_draft(
        supabase,
        client_id=client_id,
        pick_date=pick_date,
        daily_session_id=session_id,
        draft_status=DRAFT_STATUS_READY,
    )
    if isinstance(snap, dict):
        snap["draft_status"] = DRAFT_STATUS_READY
        snap["daily_session_id"] = session_id
    daily["draft_status"] = DRAFT_STATUS_READY
    return daily


def _backfill_primary_reel_id(
    supabase: Client,
    client_id: str,
    row: Dict[str, Any],
) -> Dict[str, Any]:
    if str(row.get("primary_reel_id") or "").strip():
        return row
    fresh = row.get("fresh_niche_reel_ids") if isinstance(row.get("fresh_niche_reel_ids"), list) else []
    wins = row.get("competitor_win_reel_ids") if isinstance(row.get("competitor_win_reel_ids"), list) else []
    primary = pick_primary_reel_id(
        [str(x) for x in wins if str(x).strip()],
        [str(x) for x in fresh if str(x).strip()],
    )
    if not primary:
        return row
    try:
        supabase.table("client_daily_opportunities").update({"primary_reel_id": primary}).eq(
            "client_id", client_id
        ).eq("pick_date", str(row.get("pick_date") or "")).execute()
    except Exception:
        pass
    row = dict(row)
    row["primary_reel_id"] = primary
    return row


def trigger_today_post_for_client(
    supabase: Client,
    settings: Settings,
    client_id: str,
) -> Optional[Dict[str, Any]]:
    """User- or lazy-triggered: ensure today's snapshot exists and run the draft now."""
    from services.daily_post_draft import DRAFT_STATUS_READY, ensure_daily_post_draft

    day = _today_utc()
    row = _load_snapshot_row(supabase, client_id, day)
    if not row:
        compute_and_store_daily_opportunities(
            supabase, client_id, source="manual", pick_date=day
        )
        row = _load_snapshot_row(supabase, client_id, day)
    if row:
        row = _backfill_primary_reel_id(supabase, client_id, row)

    if not row:
        return None

    if (
        str(row.get("draft_status") or "") == DRAFT_STATUS_READY
        and str(row.get("daily_session_id") or "").strip()
    ):
        return row

    if row.get("primary_reel_id"):
        ensure_daily_post_draft(supabase, settings, client_id, row)
        row = _load_snapshot_row(supabase, client_id, day) or row
    return row


def get_today_snapshot_meta(
    supabase: Client,
    client_id: str,
    *,
    pick_date: Optional[date] = None,
    settings: Optional[Settings] = None,
    ensure_draft: bool = True,
) -> Optional[Dict[str, Any]]:
    """Return snapshot row for today, computing inline if missing."""
    day = pick_date or _today_utc()
    row = _load_snapshot_row(supabase, client_id, day)
    if row:
        row = _backfill_primary_reel_id(supabase, client_id, row)
        if ensure_draft and settings is not None:
            from services.daily_post_draft import ensure_daily_post_draft

            st = str(row.get("draft_status") or "")
            if st in ("pending", "failed") and row.get("primary_reel_id"):
                ensure_daily_post_draft(supabase, settings, client_id, row)
                row = _load_snapshot_row(supabase, client_id, day) or row
        return row
    compute_and_store_daily_opportunities(supabase, client_id, source="fallback", pick_date=day)
    row = _load_snapshot_row(supabase, client_id, day)
    if row:
        row = _backfill_primary_reel_id(supabase, client_id, row)
    if row and ensure_draft and settings is not None and row.get("primary_reel_id"):
        from services.daily_post_draft import ensure_daily_post_draft

        ensure_daily_post_draft(supabase, settings, client_id, row)
        row = _load_snapshot_row(supabase, client_id, day) or row
    return row
