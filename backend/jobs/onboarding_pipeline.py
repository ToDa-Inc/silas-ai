"""Orchestrate first-run discovery: DNA → niche creators → keyword reels → light analyze.

Every sub-step runs **inline** — synchronously, in the same process/thread that is already
running ``run_onboarding_pipeline`` — instead of being enqueued as a separate
``background_jobs`` row with ``status="queued"``.

Why: ``claim_next_job()`` is a shared, row-locked FIFO queue (``FOR UPDATE SKIP LOCKED``) —
by design, *any* worker process pointed at the same Supabase project can claim a ``queued``
row, including a teammate's local dev worker or the production Railway worker. If onboarding
enqueued competitor_discovery/keyword_reel_similarity as "queued" rows, whichever worker
polled fastest (often a different, differently-configured machine) would grab and immediately
fail them — silently dropping real onboarding work. Writing rows straight into
``status="running"`` (never "queued") means ``claim_next_job()``'s ``WHERE status = 'queued'``
filter never sees them, guaranteeing this pipeline runs start-to-finish on the machine that
started it. Same pattern already used by ``onboarding_voice_transcribe`` /
``onboarding_brain_generate`` in ``routers/onboarding.py``.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set

from core.config import Settings
from core.database import get_supabase_for_settings
from core.id_generator import generate_job_id
from jobs.auto_analyze_scraped import run_auto_analyze_scraped
from jobs.competitor_discovery import run_competitor_discovery
from jobs.format_digest_recompute import run_format_digest_recompute
from jobs.keyword_reel_similarity import run_keyword_reel_similarity
from services.client_dna_compile import force_recompile_client_dna_sync
from services.job_queue import fail_abandoned_queued_jobs, has_active_job
from services.onboarding_state import get_onboarding_state, update_onboarding_state
from services.similarity_discovery_keywords import (
    similarity_keywords_auto_en,
    similarity_scan_keywords,
)

logger = logging.getLogger(__name__)

# Fast onboarding: niche examples for taste training — not a full own-profile sync.
ONBOARDING_COMPETITOR_PAYLOAD: Dict[str, Any] = {
    "onboarding_fast": True,
    "limit": 5,
    "posts_per_account": 5,
    "threshold": 55,
}
# Cold-start clients have zero discovery history, so onboarding needs a much wider net than
# the production daily tick (DEFAULT_SEARCH_WINDOW="last-2-days" in keyword_reel_similarity.py,
# tuned for catching only *new* posts since the last run). "days" is a second, independent
# post-fetch recency filter (see cutoff logic in keyword_reel_similarity.py) — it MUST stay
# in lockstep with search_window, or the wider Apify fetch gets silently discarded again.
# No threshold override: the real 85-point quality bar is fine (verified — 5/7 saved reels in
# a same-niche test scored 92+); the earlier "no candidates" case was caused by the narrow
# window returning too small/stale a raw pool, not by the bar being too strict.
ONBOARDING_KEYWORD_PAYLOAD: Dict[str, Any] = {
    "onboarding_fast": True,
    "max_keywords": 3,
    "search_window": "last-1-month",
    "days": 30,
    "max_score_cap": 12,
    "min_views_per_day": 800,
    "min_onboarding_save": 8,
}
# Retry pass, used only when the first (precise, narrow-keyword) pass saves zero reels: casts
# a much wider keyword net and drops the velocity bar hard. Trades precision for *some* taste
# -training material — an empty reel-review screen is a worse onboarding outcome than a few
# lower-confidence matches the user can reject.
ONBOARDING_KEYWORD_PAYLOAD_RETRY: Dict[str, Any] = {
    "onboarding_fast": True,
    "max_keywords": 10,
    "search_window": "last-1-month",
    "days": 30,
    "max_score_cap": 12,
    "min_views_per_day": 250,
    "min_onboarding_save": 4,
}
# User rejected the first taste batch ("Find more") — skip the narrow pass, use a different
# keyword mix (skip already-tried terms), drop the bar further so we surface *new* candidates.
ONBOARDING_KEYWORD_PAYLOAD_BROADEN: Dict[str, Any] = {
    "onboarding_fast": True,
    "max_keywords": 12,
    "search_window": "last-1-month",
    "days": 30,
    "max_score_cap": 12,
    "min_views_per_day": 150,
    "min_onboarding_save": 3,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tried_keywords_from_state(pipeline_progress: Any) -> List[str]:
    """Collect keywords already used in prior onboarding scans for this client."""
    tried: List[str] = []
    if not isinstance(pipeline_progress, dict):
        return tried
    kw_stats = pipeline_progress.get("kw_stats")
    if not isinstance(kw_stats, dict):
        return tried
    for attempt in kw_stats.get("attempts") or []:
        if not isinstance(attempt, dict):
            continue
        result = attempt.get("result") if isinstance(attempt.get("result"), dict) else {}
        payload = attempt.get("payload") if isinstance(attempt.get("payload"), dict) else {}
        for k in list(result.get("keywords_used") or []) + list(payload.get("keywords") or []):
            if isinstance(k, str) and k.strip():
                tried.append(k.strip())
    final = kw_stats.get("final") if isinstance(kw_stats.get("final"), dict) else {}
    for k in final.get("keywords_used") or []:
        if isinstance(k, str) and k.strip():
            tried.append(k.strip())
    return tried


def _retry_keywords_payload(
    supabase,
    client_id: str,
    first_pass_keywords: List[str],
    *,
    base_payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Widen the keyword net: native pool (skipping already-tried) + auto_en fallback.

    Refetches the client row fresh — DNA compile earlier in this run may have just written
    ``auto_en`` for the first time, and the in-memory ``client`` var in the caller is stale.
    """
    payload = dict(base_payload or ONBOARDING_KEYWORD_PAYLOAD_RETRY)
    try:
        crow = (
            supabase.table("clients")
            .select("client_dna, niche_config, client_context")
            .eq("id", client_id)
            .limit(1)
            .execute()
        )
        fresh_client = crow.data[0] if crow.data else {}
    except Exception:
        logger.exception("retry keyword build: failed to refetch client=%s", client_id)
        return payload

    native_pool, _ = similarity_scan_keywords(
        client=fresh_client, max_keywords=max(int(payload.get("max_keywords") or 10), 16)
    )
    tried = {k.strip().lower() for k in first_pass_keywords if k}
    native_new = [k for k in native_pool if k.strip().lower() not in tried]
    en_phrases = [
        k
        for k in similarity_keywords_auto_en(fresh_client.get("client_dna") or {})
        if k.strip().lower() not in tried
    ]

    combined: List[str] = []
    seen: Set[str] = set()
    for k in native_new + en_phrases:
        lk = k.lower()
        if not k or lk in seen or lk in tried:
            continue
        seen.add(lk)
        combined.append(k)

    # If the unused pool is empty, still send terms so Apify runs (may surface different posts).
    if not combined:
        for k in en_phrases + native_pool:
            lk = k.strip().lower()
            if not k or lk in seen:
                continue
            seen.add(lk)
            combined.append(k.strip())

    if combined:
        cap = int(payload.get("max_keywords") or 12)
        payload["keywords"] = combined[:cap]
        payload["max_keywords"] = max(cap, len(payload["keywords"]))
    return payload


def _progress(supabase, client_id: str, phase: str, **extra: Any) -> None:
    update_onboarding_state(
        supabase,
        client_id,
        pipeline_progress={"phase": phase, "at": _now(), **extra},
    )


def _run_inline_subjob(
    supabase,
    settings: Settings,
    *,
    org_id: str,
    client_id: str,
    job_type: str,
    payload: Dict[str, Any],
    handler: Callable[[Settings, Dict[str, Any]], None],
    priority: int = 10,
) -> Dict[str, Any]:
    """Insert a ``background_jobs`` row straight into ``status="running"`` and run ``handler``
    inline (see module docstring for why "queued" is never used here).

    Returns the row's final ``id``/``status``/``result``/``error_message`` after ``handler``
    returns or raises. Handlers that raise (including :class:`MissingCredentialsError` — this
    is *this* machine's credentials, there is no other worker to hand off to) are caught here
    and recorded as ``status="failed"`` so the pipeline can decide whether to continue.
    """
    jid = generate_job_id()
    now = _now()
    supabase.table("background_jobs").insert(
        {
            "id": jid,
            "org_id": org_id,
            "client_id": client_id,
            "job_type": job_type,
            "payload": payload,
            "status": "running",
            "started_at": now,
            "priority": priority,
        }
    ).execute()

    job = {"id": jid, "org_id": org_id, "client_id": client_id, "payload": payload}
    try:
        handler(settings, job)
    except Exception as e:
        logger.exception(
            "inline onboarding sub-job %s (%s) failed for client=%s", job_type, jid, client_id
        )
        supabase.table("background_jobs").update(
            {
                "status": "failed",
                "completed_at": _now(),
                "error_message": str(e)[:8000],
            }
        ).eq("id", jid).execute()

    row = (
        supabase.table("background_jobs")
        .select("id, status, result, error_message")
        .eq("id", jid)
        .limit(1)
        .execute()
    )
    return row.data[0] if row.data else {"id": jid, "status": "unknown", "result": {}}


def run_onboarding_pipeline(settings: Settings, job: Dict[str, Any]) -> None:
    supabase = get_supabase_for_settings(settings)
    job_id = job["id"]
    client_id = job.get("client_id")
    if not client_id:
        raise RuntimeError("onboarding_pipeline missing client_id")

    crow = supabase.table("clients").select("*").eq("id", client_id).limit(1).execute()
    if not crow.data:
        raise RuntimeError("Client not found")
    client = crow.data[0]
    org_id = str(client.get("org_id") or "")

    job_ids: Dict[str, str] = {}
    errors: List[str] = []
    payload = job.get("payload") if isinstance(job.get("payload"), dict) else {}
    broaden = bool(payload.get("broaden"))
    prior_state = get_onboarding_state(supabase, client_id) or {}
    prior_progress = prior_state.get("pipeline_progress") or {}
    prior_kw = prior_progress.get("kw_stats") if isinstance(prior_progress, dict) else None
    prior_attempts = (
        list(prior_kw.get("attempts") or [])
        if isinstance(prior_kw, dict)
        else []
    )
    kw_stats: Dict[str, Any] = {
        "attempts": list(prior_attempts),
        "broaden": broaden,
    }
    previously_tried = _tried_keywords_from_state(prior_progress)

    try:
        _progress(supabase, client_id, "dna_compile")
        force_recompile_client_dna_sync(settings, supabase, client_id)

        _progress(supabase, client_id, "competitor_discovery")
        fail_abandoned_queued_jobs(supabase, client_id=client_id, job_type="competitor_discovery")
        if not has_active_job(supabase, client_id=client_id, job_type="competitor_discovery"):
            comp_payload = dict(ONBOARDING_COMPETITOR_PAYLOAD)
            if broaden:
                comp_payload["limit"] = max(int(comp_payload.get("limit") or 5), 8)
                comp_payload["posts_per_account"] = max(
                    int(comp_payload.get("posts_per_account") or 5), 8
                )
            comp_row = _run_inline_subjob(
                supabase,
                settings,
                org_id=org_id,
                client_id=client_id,
                job_type="competitor_discovery",
                payload=comp_payload,
                handler=run_competitor_discovery,
            )
            job_ids["competitor_discovery"] = comp_row["id"]
            if comp_row.get("status") != "completed":
                errors.append(
                    f"competitor_discovery failed: "
                    f"{(comp_row.get('error_message') or 'unknown error')[:300]}"
                )

        _progress(supabase, client_id, "keyword_scan")
        fail_abandoned_queued_jobs(
            supabase, client_id=client_id, job_type="keyword_reel_similarity"
        )
        if not has_active_job(supabase, client_id=client_id, job_type="keyword_reel_similarity"):
            if broaden:
                # Taste rescan: skip narrow 3-keyword pass — go straight to a different,
                # wider keyword mix so we don't re-fetch the same disliked posts.
                broaden_payload = _retry_keywords_payload(
                    supabase,
                    client_id,
                    previously_tried,
                    base_payload=ONBOARDING_KEYWORD_PAYLOAD_BROADEN,
                )
                _progress(
                    supabase,
                    client_id,
                    "keyword_scan_broaden",
                    reason="taste rescan — broader keywords, skipping prior terms",
                    retry_keyword_count=len(broaden_payload.get("keywords") or []),
                    skipped_prior_keywords=len(previously_tried),
                )
                kw_row = _run_inline_subjob(
                    supabase,
                    settings,
                    org_id=org_id,
                    client_id=client_id,
                    job_type="keyword_reel_similarity",
                    payload=broaden_payload,
                    handler=run_keyword_reel_similarity,
                )
                job_ids["keyword_similarity_broaden"] = kw_row["id"]
                broaden_result = kw_row.get("result") or {}
                kw_stats["attempts"].append(
                    {"payload": broaden_payload, "result": broaden_result}
                )
                if kw_row.get("status") != "completed":
                    errors.append(
                        f"keyword_reel_similarity broaden failed: "
                        f"{(kw_row.get('error_message') or 'unknown error')[:300]}"
                    )
                elif int(broaden_result.get("upserted") or 0) == 0:
                    errors.append(
                        "broader keyword rescan saved 0 new reels — niche may be thin, "
                        "or Instagram returned the same posts already rejected."
                    )
                kw_stats["final"] = broaden_result
            else:
                kw_row = _run_inline_subjob(
                    supabase,
                    settings,
                    org_id=org_id,
                    client_id=client_id,
                    job_type="keyword_reel_similarity",
                    payload=dict(ONBOARDING_KEYWORD_PAYLOAD),
                    handler=run_keyword_reel_similarity,
                )
                job_ids["keyword_similarity"] = kw_row["id"]
                first_result = kw_row.get("result") or {}
                kw_stats["attempts"].append(
                    {"payload": ONBOARDING_KEYWORD_PAYLOAD, "result": first_result}
                )

                upserted = int(first_result.get("upserted") or 0)
                # Retrying won't help if the first pass never got a real answer from Apify/OpenRouter
                # (credentials missing on this machine, or Apify's account-wide usage cap tripped) —
                # only retry on a *clean* run that legitimately found nothing worth saving.
                hard_blocker = (
                    kw_row.get("status") == "failed"
                    or first_result.get("keyword_search_error_type") == "apify_usage_limit"
                )

                if upserted == 0 and hard_blocker:
                    errors.append(
                        "keyword_reel_similarity blocked (not retried — retry wouldn't help): "
                        f"{(kw_row.get('error_message') or first_result.get('keyword_search_error') or 'unknown error')[:300]}"
                    )
                elif upserted == 0:
                    retry_payload = _retry_keywords_payload(
                        supabase, client_id, first_result.get("keywords_used") or []
                    )
                    _progress(
                        supabase,
                        client_id,
                        "keyword_scan_retry",
                        reason="first pass saved 0 reels — retrying with broader keywords",
                        retry_keyword_count=len(retry_payload.get("keywords") or []),
                    )
                    kw_row = _run_inline_subjob(
                        supabase,
                        settings,
                        org_id=org_id,
                        client_id=client_id,
                        job_type="keyword_reel_similarity",
                        payload=retry_payload,
                        handler=run_keyword_reel_similarity,
                    )
                    job_ids["keyword_similarity_retry"] = kw_row["id"]
                    retry_result = kw_row.get("result") or {}
                    kw_stats["attempts"].append(
                        {"payload": retry_payload, "result": retry_result}
                    )
                    if kw_row.get("status") != "completed":
                        errors.append(
                            f"keyword_reel_similarity retry failed: "
                            f"{(kw_row.get('error_message') or 'unknown error')[:300]}"
                        )
                    elif int(retry_result.get("upserted") or 0) == 0:
                        errors.append(
                            "keyword_reel_similarity found 0 reels on both the precise and the "
                            "broadened retry pass — niche keywords may be too narrow, or there is "
                            "little matching recent Instagram content right now."
                        )
                elif kw_row.get("status") != "completed":
                    errors.append(
                        f"keyword_reel_similarity failed: "
                        f"{(kw_row.get('error_message') or 'unknown error')[:300]}"
                    )
                kw_stats["final"] = kw_row.get("result") or {}

        _progress(supabase, client_id, "auto_analyze")
        aa_row = _run_inline_subjob(
            supabase,
            settings,
            org_id=org_id,
            client_id=client_id,
            job_type="auto_analyze_scraped",
            payload={"batch_limit": 12},
            handler=run_auto_analyze_scraped,
        )
        job_ids["auto_analyze"] = aa_row["id"]

        _run_inline_subjob(
            supabase,
            settings,
            org_id=org_id,
            client_id=client_id,
            job_type="format_digest_recompute",
            payload={},
            handler=run_format_digest_recompute,
        )

        update_onboarding_state(
            supabase,
            client_id,
            pipeline_progress={
                "phase": "complete",
                "at": _now(),
                "kw_stats": kw_stats,
                "errors": errors,
            },
            job_ids_patch=job_ids,
            complete_step="pipeline",
            current_step="reel_review",
            last_error="; ".join(errors) if errors else None,
        )

        supabase.table("background_jobs").update(
            {
                "status": "completed",
                "completed_at": _now(),
                "result": {
                    "pipeline": "onboarding_pipeline",
                    "job_ids": job_ids,
                    "errors": errors,
                    "kw_stats": kw_stats,
                },
            }
        ).eq("id", job_id).execute()
    except Exception as e:
        logger.exception("onboarding_pipeline failed for %s", client_id)
        update_onboarding_state(
            supabase,
            client_id,
            pipeline_progress={"phase": "failed", "error": str(e)},
            last_error=str(e)[:2000],
        )
        supabase.table("background_jobs").update(
            {
                "status": "failed",
                "completed_at": _now(),
                "error_message": str(e)[:8000],
            }
        ).eq("id", job_id).execute()
        raise
