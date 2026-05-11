"""Background job: re-enrich + DNA similarity for existing scraped_reels in a posted_at window.

``job_type`` = ``batch_rescore_scraped_reels_similarity``. Progress is written to
``background_jobs.result`` during enrich and score phases; logs go to the standard logger.

Payload (JSON):
  posted_after, posted_before — required ``YYYY-MM-DD`` (UTC inclusive day bounds)
  threshold — default 80
  sources — optional list of strings, e.g. ``["profile","keyword_similarity"]``
  only_missing_score — optional bool; skip rows with ``similarity_score`` already set
  dry_run — optional bool; no writes to scraped_reels / reel_analyses
  enrich_chunk_size — default 40 (Apify directUrls batch size)
  progress_flush_every — default 5 (update ``background_jobs.result`` every N scored reels)
  limit — optional max reels after filters
  write_report_path — optional filesystem path (local sync only; worker usually omits)
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set

from core.config import Settings
from core.database import get_supabase_for_settings
from core.id_generator import generate_job_id
from jobs.keyword_reel_similarity import (
    _caption,
    _cv_ratio,
    _duration_seconds,
    _owner_username,
    _post_url,
    _upsert_keyword_similarity_analysis,
    _views,
    score_reel_dict_for_keyword_similarity,
)
from services.apify import enrich_reel_urls_direct
from services.apify_posted_at import apify_instagram_item_posted_at_iso
from services.instagram_post_url import (
    canonical_instagram_post_url,
    canonical_reel_url_from_short_code,
    instagram_post_short_code,
    instagram_post_url_lookup_variants,
)
from services.reel_thumbnail_url import reel_thumbnail_url_from_apify_item

logger = logging.getLogger(__name__)

_PAGE = 500


def _iso_day_start(day: str) -> str:
    d = datetime.strptime(day.strip(), "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return d.isoformat()


def _iso_day_end_inclusive(day: str) -> str:
    d = datetime.strptime(day.strip(), "%Y-%m-%d").replace(
        hour=23, minute=59, second=59, microsecond=999000, tzinfo=timezone.utc
    )
    return d.isoformat()


def _short_code(item: dict) -> str:
    sc = (str(item.get("shortCode") or "")).strip()
    if sc:
        return sc
    return instagram_post_short_code(_post_url(item)) or ""


def _reel_dict_from_item(item: dict, *, keywords: Sequence[str]) -> Dict[str, Any]:
    sc = _short_code(item)
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


def _fetch_scraped_page(
    supabase: Any,
    *,
    client_id: str,
    posted_after: str,
    posted_before: str,
    sources: Optional[Set[str]],
    offset: int,
) -> List[Dict[str, Any]]:
    q = (
        supabase.table("scraped_reels")
        .select("id, post_url, account_username, caption, source, posted_at, similarity_score")
        .eq("client_id", client_id)
        .gte("posted_at", posted_after)
        .lte("posted_at", posted_before)
        .order("posted_at", desc=False)
        .range(offset, offset + _PAGE - 1)
    )
    rows = q.execute().data or []
    if sources is not None:
        rows = [r for r in rows if str(r.get("source") or "") in sources]
    return rows


def _flush_progress(supabase: Any, job_id: str, progress: Dict[str, Any]) -> None:
    supabase.table("background_jobs").update({"result": dict(progress)}).eq("id", job_id).execute()


def enqueue_batch_rescore_job(
    supabase: Any,
    *,
    org_id: str,
    client_id: str,
    payload: Dict[str, Any],
    priority: int = 15,
) -> str:
    """Insert a queued ``batch_rescore_scraped_reels_similarity`` job. Returns ``job_id``."""
    job_id = generate_job_id()
    row: Dict[str, Any] = {
        "id": job_id,
        "org_id": org_id,
        "client_id": client_id,
        "job_type": "batch_rescore_scraped_reels_similarity",
        "payload": payload,
        "status": "queued",
        "priority": priority,
    }
    supabase.table("background_jobs").insert(row).execute()
    return job_id


def run_batch_rescore_scraped_reels_similarity(settings: Settings, job: Dict[str, Any]) -> None:
    if not settings.apify_api_token or not settings.openrouter_api_key:
        raise RuntimeError("APIFY_API_TOKEN and OPENROUTER_API_KEY required")

    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=logging.INFO,
            format="%(levelname)s %(name)s %(message)s",
        )

    supabase = get_supabase_for_settings(settings)
    job_id = str(job["id"])
    client_id = job.get("client_id")
    if not client_id:
        raise RuntimeError("batch_rescore_scraped_reels_similarity job missing client_id")

    payload = job.get("payload") or {}
    posted_after_raw = str(payload.get("posted_after") or "").strip()
    posted_before_raw = str(payload.get("posted_before") or "").strip()
    if not posted_after_raw or not posted_before_raw:
        raise RuntimeError("payload.posted_after and payload.posted_before are required (YYYY-MM-DD)")

    threshold = int(payload.get("threshold") or 80)
    dry_run = bool(payload.get("dry_run"))
    only_missing = bool(payload.get("only_missing_score"))
    limit = int(payload.get("limit") or 0)
    enrich_chunk = max(5, min(int(payload.get("enrich_chunk_size") or 40), 80))
    flush_every = max(1, min(int(payload.get("progress_flush_every") or 5), 50))
    write_report_path = str(payload.get("write_report_path") or "").strip()

    sources: Optional[Set[str]] = None
    raw_sources = payload.get("sources")
    if isinstance(raw_sources, list) and raw_sources:
        sources = {str(s).strip() for s in raw_sources if str(s).strip()}
    elif isinstance(raw_sources, str) and raw_sources.strip():
        sources = {s.strip() for s in raw_sources.split(",") if s.strip()}

    posted_after = _iso_day_start(posted_after_raw)
    posted_before = _iso_day_end_inclusive(posted_before_raw)

    cr = (
        supabase.table("clients")
        .select("id, name, slug, client_dna")
        .eq("id", str(client_id))
        .limit(1)
        .execute()
    )
    if not cr.data:
        raise RuntimeError("Client not found")
    client = cr.data[0]
    dna = client.get("client_dna") if isinstance(client.get("client_dna"), dict) else {}
    analysis_brief = str(dna.get("analysis_brief") or "").strip()
    if not analysis_brief:
        raise RuntimeError("client_dna.analysis_brief is empty")

    model = settings.openrouter_reel_analyze_model
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("background_jobs").update({"status": "running", "started_at": now}).eq(
        "id", job_id
    ).execute()

    progress: Dict[str, Any] = {
        "pipeline": "batch_rescore_scraped_reels_similarity",
        "phase": "loading_rows",
        "client_slug": client.get("slug"),
        "posted_after": posted_after,
        "posted_before": posted_before,
        "threshold": threshold,
        "dry_run": dry_run,
        "enrich_chunk_size": enrich_chunk,
        "progress_flush_every": flush_every,
        "selected_count": 0,
        "enrich_batches_total": 0,
        "enrich_batches_done": 0,
        "scored_done": 0,
        "meets_bar": 0,
        "below_bar": 0,
        "enrich_missing": 0,
        "errors": 0,
        "last_post_url": None,
        "last_log": None,
        "rows": [],
    }
    _flush_progress(supabase, job_id, progress)

    all_rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        batch = _fetch_scraped_page(
            supabase,
            client_id=str(client_id),
            posted_after=posted_after,
            posted_before=posted_before,
            sources=sources,
            offset=offset,
        )
        if not batch:
            break
        all_rows.extend(batch)
        offset += _PAGE
        progress["selected_count"] = len(all_rows)
        progress["phase"] = "loading_rows"
        progress["last_log"] = f"loaded page offset={offset - _PAGE} cumulative={len(all_rows)}"
        _flush_progress(supabase, job_id, progress)
        logger.info("batch_rescore %s: %s", job_id, progress["last_log"])
        if len(batch) < _PAGE:
            break

    if only_missing:
        all_rows = [r for r in all_rows if r.get("similarity_score") is None]

    if limit > 0:
        all_rows = all_rows[:limit]

    progress["selected_count"] = len(all_rows)
    progress["phase"] = "enriching"
    _flush_progress(supabase, job_id, progress)
    logger.info(
        "batch_rescore %s: selected %s reels between %s and %s (threshold=%s dry_run=%s)",
        job_id,
        len(all_rows),
        posted_after_raw,
        posted_before_raw,
        threshold,
        dry_run,
    )

    by_url: Dict[str, Dict[str, Any]] = {}
    urls: List[str] = []
    for r in all_rows:
        u = canonical_instagram_post_url(str(r.get("post_url") or ""))
        if not u:
            continue
        by_url[u] = r
        urls.append(u)

    enriched_by_url: Dict[str, dict] = {}
    enrich_errors: List[str] = []
    n_chunks = (len(urls) + enrich_chunk - 1) // enrich_chunk if urls else 0
    progress["enrich_batches_total"] = n_chunks
    _flush_progress(supabase, job_id, progress)

    for ci in range(0, len(urls), enrich_chunk):
        chunk = urls[ci : ci + enrich_chunk]
        logger.info(
            "batch_rescore %s: enrich batch %s/%s urls=%s",
            job_id,
            ci // enrich_chunk + 1,
            n_chunks,
            len(chunk),
        )
        items, errs = enrich_reel_urls_direct(settings.apify_api_token, chunk)
        enrich_errors.extend(errs or [])
        for item in items or []:
            raw = _post_url(item) or ""
            if not raw.strip():
                raw = canonical_reel_url_from_short_code(_short_code(item))
            for v in instagram_post_url_lookup_variants(raw):
                enriched_by_url[v] = item
        progress["enrich_batches_done"] = ci // enrich_chunk + 1
        progress["last_log"] = f"enriched chunk {progress['enrich_batches_done']}/{n_chunks}"
        _flush_progress(supabase, job_id, progress)
        if ci + enrich_chunk < len(urls):
            time.sleep(2.0)

    progress["enrich_errors"] = enrich_errors
    progress["phase"] = "scoring"
    _flush_progress(supabase, job_id, progress)

    rows_out: List[Dict[str, Any]] = []
    scored_since_flush = 0

    for u in urls:
        sr = by_url[u]
        scraped_id = str(sr["id"])
        item = enriched_by_url.get(u)
        rec: Dict[str, Any] = {
            "post_url": u,
            "scraped_reel_id": scraped_id,
            "source": sr.get("source"),
            "posted_at": sr.get("posted_at"),
        }
        progress["last_post_url"] = u

        if not item:
            progress["enrich_missing"] += 1
            rec["error"] = "not_in_enrich_response"
            rows_out.append(rec)
            logger.warning("batch_rescore %s: enrich missing %s", job_id, u)
        else:
            try:
                reel = _reel_dict_from_item(item, keywords=[])
                reel["scraped_reel_id"] = scraped_id
                scored = score_reel_dict_for_keyword_similarity(
                    settings,
                    analysis_brief=analysis_brief,
                    reel=reel,
                    threshold=threshold,
                    model=model,
                )
                score = int(scored.get("similarity_score") or 0)
                meets = score >= threshold
                rec.update(
                    {
                        "similarity_score": score,
                        "verdict": scored.get("verdict"),
                        "meets_bar": meets,
                        "media_type": scored.get("media_type"),
                        "slides_analyzed": scored.get("slides_analyzed"),
                        "video_analyzed": scored.get("video_analyzed"),
                        "username": scored.get("username"),
                    }
                )
                progress["scored_done"] += 1
                if meets:
                    progress["meets_bar"] += 1
                else:
                    progress["below_bar"] += 1

                if not dry_run:
                    fmt = str(reel.get("_enriched_format") or "reel")
                    thumb = scored.get("thumbnail_url")
                    upd: Dict[str, Any] = {"similarity_score": score, "format": fmt}
                    if thumb:
                        upd["thumbnail_url"] = thumb
                    supabase.table("scraped_reels").update(upd).eq("id", scraped_id).execute()

                    gp = scored.get("gemini_parsed") if isinstance(scored.get("gemini_parsed"), dict) else {}
                    _upsert_keyword_similarity_analysis(
                        supabase,
                        client_id=str(client_id),
                        reel_id=scraped_id,
                        job_id=job_id,
                        post_url=u,
                        owner=str(scored.get("username") or sr.get("account_username") or "unknown"),
                        model=model,
                        parsed=gp,
                        video_analyzed=bool(scored.get("video_analyzed")),
                        matched_keywords=[],
                    )
                logger.info(
                    "batch_rescore %s: scored score=%s meets_bar=%s media=%s url=%s",
                    job_id,
                    score,
                    meets,
                    rec.get("media_type"),
                    u[:60],
                )
            except Exception as e:
                progress["errors"] += 1
                rec["error"] = f"{type(e).__name__}: {e}"[:500]
                logger.exception("batch_rescore %s: score failed %s", job_id, u)

        rows_out.append(rec)
        scored_since_flush += 1
        if scored_since_flush >= flush_every:
            scored_since_flush = 0
            progress["rows"] = rows_out
            progress["last_log"] = (
                f"checkpoint scored_done={progress['scored_done']} "
                f"meets_bar={progress['meets_bar']} below_bar={progress['below_bar']} "
                f"errors={progress['errors']} enrich_missing={progress['enrich_missing']}"
            )
            _flush_progress(supabase, job_id, progress)

        time.sleep(0.5)

    progress["phase"] = "completed"
    progress["rows"] = rows_out
    progress["last_log"] = (
        f"done scored_done={progress['scored_done']} meets_bar={progress['meets_bar']} "
        f"below_bar={progress['below_bar']} errors={progress['errors']} "
        f"enrich_missing={progress['enrich_missing']}"
    )
    done = datetime.now(timezone.utc).isoformat()
    supabase.table("background_jobs").update(
        {
            "status": "completed",
            "completed_at": done,
            "result": dict(progress),
        }
    ).eq("id", job_id).execute()
    logger.info("batch_rescore %s: %s", job_id, progress["last_log"])

    if write_report_path:
        try:
            Path(write_report_path).write_text(
                json.dumps(progress, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            logger.info("batch_rescore %s: wrote report %s", job_id, write_report_path)
        except OSError as e:
            logger.warning("batch_rescore %s: could not write report path: %s", job_id, e)
