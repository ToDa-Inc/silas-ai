"""Server-side daily post draft — one content_ready session per client per day."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any, Dict, Optional

from core.config import Settings
from core.id_generator import generate_generation_session_id, generate_job_id
from jobs.reel_analyze_url import (
    ReelAnalyzeTerminalError,
    _execute_reel_analyze_url_core,
    _niche_context_for_reel_analysis,
    instagram_reel_url_is_valid,
)
from services.content_generation import (
    GENERATION_PROMPT_VERSION,
    compact_analysis_for_prompt,
    merge_source_reference_into_patterns,
    run_adaptation_synthesis,
)
from services.format_classifier import canonicalize_stored_format_key
from services.instagram_post_url import canonical_instagram_post_url
from services.url_adapt_format_recommendation import recommend_url_adapt_format
from supabase import Client

logger = logging.getLogger(__name__)

DRAFT_STATUS_PENDING = "pending"
DRAFT_STATUS_READY = "ready"
DRAFT_STATUS_FAILED = "failed"
DRAFT_STATUS_SKIPPED = "skipped"


def pick_primary_reel_id(
    competitor_win_ids: list[str],
    fresh_niche_ids: list[str],
) -> Optional[str]:
    """One hero reel: best competitor win first, else top fresh niche."""
    for rid in competitor_win_ids:
        if str(rid).strip():
            return str(rid).strip()
    for rid in fresh_niche_ids:
        if str(rid).strip():
            return str(rid).strip()
    return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _session_is_ready(row: Dict[str, Any]) -> bool:
    return str(row.get("status") or "") == "content_ready"


def _patch_snapshot_draft(
    supabase: Client,
    *,
    client_id: str,
    pick_date: date,
    daily_session_id: Optional[str],
    draft_status: str,
    draft_error: Optional[str] = None,
) -> None:
    patch: Dict[str, Any] = {
        "daily_session_id": daily_session_id,
        "draft_status": draft_status,
        "draft_error": (str(draft_error)[:2000] if draft_error else None),
        "draft_attempted_at": _now_iso(),
    }
    try:
        supabase.table("client_daily_opportunities").update(patch).eq("client_id", client_id).eq(
            "pick_date", pick_date.isoformat()
        ).execute()
    except Exception as e:
        logger.warning("patch_snapshot_draft failed: %s", e)


def _find_existing_session_for_url(
    supabase: Client,
    client_id: str,
    post_url: str,
) -> Optional[Dict[str, Any]]:
    try:
        res = (
            supabase.table("generation_sessions")
            .select("*")
            .eq("client_id", client_id)
            .eq("source_type", "url_adapt")
            .eq("source_url", post_url)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception:
        return None
    if not res.data:
        return None
    return dict(res.data[0])


def _insert_url_adapt_session(
    supabase: Client,
    settings: Settings,
    *,
    client_id: str,
    raw_url: str,
) -> Dict[str, Any]:
    """Create angles_ready url_adapt session through analysis + synthesis (no packaging yet)."""
    from routers.generation import (
        _load_analysis_with_meta,
        _load_client_for_generation,
        _synthetic_blueprint_angle,
    )

    if not settings.openrouter_api_key:
        raise RuntimeError("OPENROUTER_API_KEY not configured")

    raw_u = raw_url.strip()
    if not raw_u or not instagram_reel_url_is_valid(raw_u):
        raise ValueError("Invalid Instagram reel URL")

    url_key = canonical_instagram_post_url(raw_u)
    client_row = _load_client_for_generation(supabase, client_id)

    one = _load_analysis_with_meta(supabase, client_id, url_key)
    if not one:
        sr = (
            supabase.table("scraped_reels")
            .select("id")
            .eq("client_id", client_id)
            .eq("post_url", url_key)
            .limit(1)
            .execute()
        )
        skip_apify = bool(sr and sr.data)
        if not skip_apify and not settings.apify_api_token:
            raise ValueError("Reel not analyzed yet and Apify is not configured")
        niche_ctx = _niche_context_for_reel_analysis(supabase, client_id)
        try:
            _execute_reel_analyze_url_core(
                settings,
                supabase,
                client_id=client_id,
                analysis_job_id=generate_job_id(),
                reel_url=raw_u,
                analysis_source="daily_post_draft",
                niche_context=niche_ctx,
                skip_apify=skip_apify,
            )
        except ReelAnalyzeTerminalError as e:
            raise ValueError(str(e.code)) from e
        one = _load_analysis_with_meta(supabase, client_id, url_key)

    if not one:
        raise ValueError("Could not load analysis for reel")

    packed = compact_analysis_for_prompt(one, reel_meta=one.get("_reel_meta"))
    patterns = run_adaptation_synthesis(
        settings,
        client_row=client_row,
        packed_analysis=packed,
        target_format_key=None,
    )
    if not isinstance(patterns, dict):
        patterns = {}
    patterns = merge_source_reference_into_patterns(patterns, packed)

    source_format_key = recommend_url_adapt_format(one, reel_meta=one.get("_reel_meta"))
    angles = [_synthetic_blueprint_angle()]
    analysis_ids = [str(one["id"])] if one.get("id") else []
    reel_ids = [str(one["reel_id"])] if one.get("reel_id") else []

    sid = generate_generation_session_id()
    now = _now_iso()
    insert_row: Dict[str, Any] = {
        "id": sid,
        "client_id": client_id,
        "source_type": "url_adapt",
        "source_analysis_ids": analysis_ids or None,
        "source_reel_ids": reel_ids or None,
        "synthesized_patterns": patterns,
        "angles": angles,
        "chosen_angle_index": None,
        "hooks": None,
        "script": None,
        "caption_body": None,
        "hashtags": None,
        "story_variants": None,
        "status": "angles_ready",
        "feedback": None,
        "prompt_version": GENERATION_PROMPT_VERSION,
        "created_at": now,
        "updated_at": now,
        "source_url": url_key,
    }
    if source_format_key:
        ck = canonicalize_stored_format_key(source_format_key)
        insert_row["source_format_key"] = ck or source_format_key.strip()

    ins = supabase.table("generation_sessions").insert(insert_row).execute()
    if not ins.data:
        raise RuntimeError("generation_sessions insert failed")
    return dict(ins.data[0])


def _finalize_url_adapt_session(
    supabase: Client,
    settings: Settings,
    *,
    client_id: str,
    row: Dict[str, Any],
    patterns: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    from routers.generation import (
        _finalize_session_package,
        _load_client_for_generation,
        _synthetic_blueprint_angle,
    )

    client_row = _load_client_for_generation(supabase, client_id)
    angles = row.get("angles") if isinstance(row.get("angles"), list) else []
    chosen = angles[0] if angles else _synthetic_blueprint_angle()
    pats = patterns if isinstance(patterns, dict) else (
        row.get("synthesized_patterns") if isinstance(row.get("synthesized_patterns"), dict) else {}
    )
    return _finalize_session_package(
        supabase,
        settings,
        client_id=client_id,
        session_id=str(row.get("id") or ""),
        row=row,
        client_row=client_row,
        angle_index=0,
        chosen_angle=chosen,
        patterns=pats,
        feedback=None,
    )


def _start_one_to_one_url_adapt(
    supabase: Client,
    settings: Settings,
    *,
    client_id: str,
    raw_url: str,
) -> Dict[str, Any]:
    """Create and package a 1:1 url_adapt session (mirrors /generate/start one_to_one)."""
    inserted = _insert_url_adapt_session(
        supabase, settings, client_id=client_id, raw_url=raw_url
    )
    return _finalize_url_adapt_session(
        supabase, settings, client_id=client_id, row=inserted
    )


def _retry_failed_session(
    supabase: Client,
    settings: Settings,
    *,
    client_id: str,
    session_id: str,
) -> Dict[str, Any]:
    from routers.generation import (
        _finalize_session_package,
        _load_client_for_generation,
        _load_session,
        angles_from_session_row,
    )

    row = _load_session(supabase, client_id, session_id)
    angles = angles_from_session_row(row)
    if not angles:
        raise ValueError("Session has no angles")
    client_row = _load_client_for_generation(supabase, client_id)
    patterns = row.get("synthesized_patterns") if isinstance(row.get("synthesized_patterns"), dict) else {}
    return _finalize_session_package(
        supabase,
        settings,
        client_id=client_id,
        session_id=session_id,
        row=row,
        client_row=client_row,
        angle_index=0,
        chosen_angle=angles[0],
        patterns=patterns,
        feedback=None,
    )


def ensure_daily_post_draft(
    supabase: Client,
    settings: Settings,
    client_id: str,
    snap_row: Dict[str, Any],
) -> Dict[str, Any]:
    """Ensure today's snapshot has a script-ready session for primary_reel_id."""
    pick_date_raw = snap_row.get("pick_date")
    if isinstance(pick_date_raw, str) and pick_date_raw.strip():
        pick_date = date.fromisoformat(pick_date_raw.strip()[:10])
    else:
        pick_date = datetime.now(timezone.utc).date()

    status = str(snap_row.get("draft_status") or DRAFT_STATUS_PENDING)
    session_id = str(snap_row.get("daily_session_id") or "").strip() or None
    primary_reel_id = str(snap_row.get("primary_reel_id") or "").strip() or None

    if status == DRAFT_STATUS_READY and session_id:
        try:
            from routers.generation import _load_session

            row = _load_session(supabase, client_id, session_id)
            if _session_is_ready(row):
                return {"status": DRAFT_STATUS_READY, "session_id": session_id}
        except Exception:
            pass

    if not primary_reel_id:
        _patch_snapshot_draft(
            supabase,
            client_id=client_id,
            pick_date=pick_date,
            daily_session_id=None,
            draft_status=DRAFT_STATUS_SKIPPED,
            draft_error="No reel picked for today",
        )
        return {"status": DRAFT_STATUS_SKIPPED, "session_id": None}

    if not settings.openrouter_api_key:
        _patch_snapshot_draft(
            supabase,
            client_id=client_id,
            pick_date=pick_date,
            daily_session_id=session_id,
            draft_status=DRAFT_STATUS_SKIPPED,
            draft_error="OPENROUTER_API_KEY not configured",
        )
        return {"status": DRAFT_STATUS_SKIPPED, "session_id": None}

    try:
        reel_res = (
            supabase.table("scraped_reels")
            .select("id, post_url")
            .eq("client_id", client_id)
            .eq("id", primary_reel_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        _patch_snapshot_draft(
            supabase,
            client_id=client_id,
            pick_date=pick_date,
            daily_session_id=None,
            draft_status=DRAFT_STATUS_FAILED,
            draft_error=str(e),
        )
        return {"status": DRAFT_STATUS_FAILED, "session_id": None, "error": str(e)}

    if not reel_res.data:
        _patch_snapshot_draft(
            supabase,
            client_id=client_id,
            pick_date=pick_date,
            daily_session_id=None,
            draft_status=DRAFT_STATUS_FAILED,
            draft_error="Primary reel not found",
        )
        return {"status": DRAFT_STATUS_FAILED, "session_id": None}

    post_url = str(reel_res.data[0].get("post_url") or "").strip()
    if not post_url:
        _patch_snapshot_draft(
            supabase,
            client_id=client_id,
            pick_date=pick_date,
            daily_session_id=None,
            draft_status=DRAFT_STATUS_FAILED,
            draft_error="Primary reel has no post_url",
        )
        return {"status": DRAFT_STATUS_FAILED, "session_id": None}

    try:
        if session_id:
            from routers.generation import _load_session

            row = _load_session(supabase, client_id, session_id)
            if _session_is_ready(row):
                _patch_snapshot_draft(
                    supabase,
                    client_id=client_id,
                    pick_date=pick_date,
                    daily_session_id=session_id,
                    draft_status=DRAFT_STATUS_READY,
                )
                return {"status": DRAFT_STATUS_READY, "session_id": session_id}
            if str(row.get("status") or "") == "angles_ready" and row.get("last_error"):
                out = _retry_failed_session(
                    supabase, settings, client_id=client_id, session_id=session_id
                )
                sid = str(out.get("id") or session_id)
                final_status = DRAFT_STATUS_READY if _session_is_ready(out) else DRAFT_STATUS_FAILED
                err = str(out.get("last_error") or "") if final_status == DRAFT_STATUS_FAILED else None
                _patch_snapshot_draft(
                    supabase,
                    client_id=client_id,
                    pick_date=pick_date,
                    daily_session_id=sid,
                    draft_status=final_status,
                    draft_error=err,
                )
                return {"status": final_status, "session_id": sid, "error": err}
            if str(row.get("status") or "") == "angles_ready" and not row.get("last_error"):
                out = _finalize_url_adapt_session(
                    supabase, settings, client_id=client_id, row=row
                )
                sid = str(out.get("id") or session_id)
                final_status = DRAFT_STATUS_READY if _session_is_ready(out) else DRAFT_STATUS_FAILED
                err = str(out.get("last_error") or "") if final_status == DRAFT_STATUS_FAILED else None
                _patch_snapshot_draft(
                    supabase,
                    client_id=client_id,
                    pick_date=pick_date,
                    daily_session_id=sid,
                    draft_status=final_status,
                    draft_error=err,
                )
                return {"status": final_status, "session_id": sid, "error": err}

        existing = _find_existing_session_for_url(supabase, client_id, post_url)
        if existing and _session_is_ready(existing):
            sid = str(existing["id"])
            _patch_snapshot_draft(
                supabase,
                client_id=client_id,
                pick_date=pick_date,
                daily_session_id=sid,
                draft_status=DRAFT_STATUS_READY,
            )
            return {"status": DRAFT_STATUS_READY, "session_id": sid}

        if existing and str(existing.get("status") or "") == "angles_ready":
            out = _retry_failed_session(
                supabase, settings, client_id=client_id, session_id=str(existing["id"])
            )
            sid = str(out.get("id") or existing["id"])
            final_status = DRAFT_STATUS_READY if _session_is_ready(out) else DRAFT_STATUS_FAILED
            err = str(out.get("last_error") or "") if final_status == DRAFT_STATUS_FAILED else None
            _patch_snapshot_draft(
                supabase,
                client_id=client_id,
                pick_date=pick_date,
                daily_session_id=sid,
                draft_status=final_status,
                draft_error=err,
            )
            return {"status": final_status, "session_id": sid, "error": err}

            return {"status": final_status, "session_id": sid, "error": err}

        inserted = _insert_url_adapt_session(
            supabase, settings, client_id=client_id, raw_url=post_url
        )
        sid = str(inserted.get("id") or "")
        _patch_snapshot_draft(
            supabase,
            client_id=client_id,
            pick_date=pick_date,
            daily_session_id=sid or None,
            draft_status=DRAFT_STATUS_PENDING,
        )
        out = _finalize_url_adapt_session(
            supabase, settings, client_id=client_id, row=inserted
        )
        sid = str(out.get("id") or sid)
        final_status = DRAFT_STATUS_READY if _session_is_ready(out) else DRAFT_STATUS_FAILED
        err = str(out.get("last_error") or "") if final_status == DRAFT_STATUS_FAILED else None
        _patch_snapshot_draft(
            supabase,
            client_id=client_id,
            pick_date=pick_date,
            daily_session_id=sid or None,
            draft_status=final_status,
            draft_error=err,
        )
        return {"status": final_status, "session_id": sid or None, "error": err}
    except Exception as e:
        logger.exception("ensure_daily_post_draft failed client=%s", client_id)
        _patch_snapshot_draft(
            supabase,
            client_id=client_id,
            pick_date=pick_date,
            daily_session_id=session_id,
            draft_status=DRAFT_STATUS_FAILED,
            draft_error=str(e),
        )
        return {"status": DRAFT_STATUS_FAILED, "session_id": session_id, "error": str(e)}


def ensure_daily_post_drafts_all_clients(
    supabase: Client,
    settings: Settings,
) -> Dict[str, Any]:
    """Run draft step for every active client that has today's snapshot row."""
    from services.daily_opportunities import _load_snapshot_row, _today_utc

    day = _today_utc()
    try:
        res = supabase.table("clients").select("id").eq("is_active", True).execute()
    except Exception as e:
        return {"clients_checked": 0, "ready": 0, "errors": [str(e)[:200]]}

    ready = 0
    failed = 0
    skipped = 0
    errors: list[str] = []
    for c in res.data or []:
        cid = str(c.get("id") or "")
        if not cid:
            continue
        snap = _load_snapshot_row(supabase, cid, day)
        if not snap:
            continue
        try:
            out = ensure_daily_post_draft(supabase, settings, cid, snap)
            st = str(out.get("status") or "")
            if st == DRAFT_STATUS_READY:
                ready += 1
            elif st == DRAFT_STATUS_SKIPPED:
                skipped += 1
            elif st == DRAFT_STATUS_FAILED:
                failed += 1
                if out.get("error"):
                    errors.append(f"{cid}: {str(out.get('error'))[:80]}")
        except Exception as e:
            failed += 1
            errors.append(f"{cid}: {type(e).__name__}")
    return {
        "clients_checked": len(res.data or []),
        "ready": ready,
        "failed": failed,
        "skipped": skipped,
        "errors": errors[:20],
    }


def run_session_packaging_job(client_id: str, session_id: str) -> None:
    """Background: finalize a url_adapt angles_ready session to content_ready."""
    from core.config import get_settings
    from core.database import get_supabase_for_settings
    from routers.generation import _load_session

    try:
        settings = get_settings()
        supabase = get_supabase_for_settings(settings)
        row = _load_session(supabase, client_id, session_id)
        if _session_is_ready(row):
            return
        if str(row.get("status") or "") != "angles_ready":
            return
        _finalize_url_adapt_session(
            supabase, settings, client_id=client_id, row=row
        )
    except Exception:
        logger.exception(
            "run_session_packaging_job failed client=%s session=%s",
            client_id,
            session_id,
        )


def run_daily_post_draft_job(client_id: str, pick_date_iso: str) -> None:
    """Background worker: package today's daily post without blocking HTTP."""
    from core.config import get_settings
    from core.database import get_supabase_for_settings
    from services.daily_opportunities import _load_snapshot_row

    try:
        settings = get_settings()
        supabase = get_supabase_for_settings(settings)
        day = date.fromisoformat(str(pick_date_iso).strip()[:10])
        row = _load_snapshot_row(supabase, client_id, day)
        if not row:
            return
        ensure_daily_post_draft(supabase, settings, client_id, row)
        from core.cache import cache_delete

        cache_delete(f"home_summary:{client_id}")
    except Exception:
        logger.exception("run_daily_post_draft_job failed client=%s", client_id)
