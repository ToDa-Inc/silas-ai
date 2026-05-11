#!/usr/bin/env python3
"""Delete scraped_reels (and matching reel_analyses) below a similarity_score threshold in a posted_at window.

``reel_snapshots`` CASCADE-delete with scraped_reels. ``reel_analyses`` uses ON DELETE SET NULL on
``reel_id`` — this script deletes analysis rows explicitly so you do not keep orphan keyword rows.

Usage (from repo root, with backend venv + env loaded):

  cd silas-content-system/backend && .venv/bin/python ../scripts/delete_scraped_reels_below_similarity.py \\
    --client-slug conny-gfrerer --posted-after 2026-05-09 --posted-before 2026-05-11 --min-keep-score 80

Default is **dry-run** (counts only). Pass ``--execute`` to perform deletes.

Optional ``--repair-relations`` after deletes: for reels still in the window with a non-null
``similarity_score``, set ``reel_analyses.reel_id`` and align
``full_analysis_json.keyword_similarity.similarity_score`` with the column when they drift.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from core.config import get_settings
from core.database import get_supabase_for_settings
from jobs.batch_rescore_scraped_reels_similarity import _iso_day_end_inclusive, _iso_day_start
from services.instagram_post_url import canonical_instagram_post_url

_PAGE = 500
_CHUNK = 120


def _parse_sources(raw: str) -> Optional[Set[str]]:
    if not raw.strip():
        return None
    return {s.strip() for s in raw.split(",") if s.strip()}


def _fetch_candidates(
    supabase: Any,
    *,
    client_id: str,
    posted_after: str,
    posted_before: str,
    min_keep_score: int,
    sources: Optional[Set[str]],
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    offset = 0
    while True:
        q = (
            supabase.table("scraped_reels")
            .select("id, post_url, source, posted_at, similarity_score")
            .eq("client_id", client_id)
            .gte("posted_at", posted_after)
            .lte("posted_at", posted_before)
            .not_.is_("similarity_score", "null")
            .lt("similarity_score", min_keep_score)
            .order("posted_at", desc=False)
            .range(offset, offset + _PAGE - 1)
        )
        if sources is not None:
            q = q.in_("source", sorted(sources))
        rows = q.execute().data or []
        out.extend(rows)
        if len(rows) < _PAGE:
            break
        offset += _PAGE
    return out


def _delete_analyses_for_urls(
    supabase: Any, *, client_id: str, urls: List[str], execute: bool
) -> int:
    deleted = 0
    for i in range(0, len(urls), _CHUNK):
        chunk = urls[i : i + _CHUNK]
        if not execute:
            deleted += len(chunk)
            continue
        r = (
            supabase.table("reel_analyses")
            .delete()
            .eq("client_id", client_id)
            .in_("post_url", chunk)
            .execute()
        )
        # postgrest may not return count; assume chunk size when no error
        deleted += len(chunk) if r.data is None else len(r.data)
    return deleted


def _delete_scraped_by_ids(supabase: Any, *, client_id: str, ids: List[str], execute: bool) -> int:
    n = 0
    for i in range(0, len(ids), _CHUNK):
        chunk = ids[i : i + _CHUNK]
        if not execute:
            n += len(chunk)
            continue
        r = (
            supabase.table("scraped_reels")
            .delete()
            .eq("client_id", client_id)
            .in_("id", chunk)
            .execute()
        )
        n += len(chunk) if r.data is None else len(r.data)
    return n


def _repair_window(
    supabase: Any,
    *,
    client_id: str,
    posted_after: str,
    posted_before: str,
    sources: Optional[Set[str]],
    execute: bool,
) -> Dict[str, Any]:
    """Align reel_analyses.reel_id and JSON keyword_similarity.similarity_score with scraped_reels."""
    stats = {"rows_checked": 0, "reel_id_patched": 0, "json_score_patched": 0}
    offset = 0
    while True:
        q = (
            supabase.table("scraped_reels")
            .select("id, post_url, source, similarity_score")
            .eq("client_id", client_id)
            .gte("posted_at", posted_after)
            .lte("posted_at", posted_before)
            .not_.is_("similarity_score", "null")
            .order("posted_at", desc=False)
            .range(offset, offset + _PAGE - 1)
        )
        if sources is not None:
            q = q.in_("source", sorted(sources))
        rows = q.execute().data or []
        if not rows:
            break
        for r in rows:
            stats["rows_checked"] += 1
            rid = str(r["id"])
            canon = canonical_instagram_post_url(str(r.get("post_url") or ""))
            col_score = r.get("similarity_score")
            if not canon:
                continue
            ar = (
                supabase.table("reel_analyses")
                .select("id, reel_id, full_analysis_json")
                .eq("client_id", client_id)
                .eq("post_url", canon)
                .limit(1)
                .execute()
            )
            if not ar.data:
                continue
            row = ar.data[0]
            aid = str(row["id"])
            cur_reel = row.get("reel_id")
            fa = row.get("full_analysis_json") if isinstance(row.get("full_analysis_json"), dict) else {}
            ks = fa.get("keyword_similarity") if isinstance(fa.get("keyword_similarity"), dict) else {}
            js_score = ks.get("similarity_score")
            patch: Dict[str, Any] = {}
            if cur_reel != rid:
                patch["reel_id"] = rid
                stats["reel_id_patched"] += 1
            try:
                col_int = int(col_score) if col_score is not None else None
            except (TypeError, ValueError):
                col_int = None
            if col_int is not None:
                try:
                    js_int = int(js_score) if js_score is not None else None
                except (TypeError, ValueError):
                    js_int = None
                if js_int != col_int:
                    new_fa = dict(fa)
                    new_ks = dict(ks)
                    new_ks["similarity_score"] = col_int
                    new_fa["keyword_similarity"] = new_ks
                    patch["full_analysis_json"] = new_fa
                    stats["json_score_patched"] += 1
            if patch and execute:
                supabase.table("reel_analyses").update(patch).eq("id", aid).execute()
        if len(rows) < _PAGE:
            break
        offset += _PAGE
    return stats


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--client-slug", required=True)
    ap.add_argument("--posted-after", required=True, metavar="YYYY-MM-DD")
    ap.add_argument("--posted-before", required=True, metavar="YYYY-MM-DD")
    ap.add_argument(
        "--min-keep-score",
        type=int,
        default=80,
        help="Delete rows with similarity_score strictly below this (and not NULL). Default 80.",
    )
    ap.add_argument("--sources", default="", help="Comma-separated scraped_reels.source filter; default all")
    ap.add_argument(
        "--execute",
        action="store_true",
        help="Actually delete; without this flag only prints JSON summary (dry-run).",
    )
    ap.add_argument(
        "--repair-relations",
        action="store_true",
        help="After deletes (or alone with --execute), patch reel_id / JSON score for remaining scored reels in the window.",
    )
    args = ap.parse_args()

    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing")

    posted_after = _iso_day_start(args.posted_after)
    posted_before = _iso_day_end_inclusive(args.posted_before)
    sources = _parse_sources(args.sources)
    min_keep = int(args.min_keep_score)

    supabase = get_supabase_for_settings(settings)
    cr = (
        supabase.table("clients")
        .select("id, slug")
        .eq("slug", args.client_slug.strip())
        .limit(1)
        .execute()
    )
    if not cr.data:
        raise SystemExit(f"No client with slug {args.client_slug!r}")
    client_id = str(cr.data[0]["id"])

    candidates = _fetch_candidates(
        supabase,
        client_id=client_id,
        posted_after=posted_after,
        posted_before=posted_before,
        min_keep_score=min_keep,
        sources=sources,
    )

    canon_urls = []
    ids: List[str] = []
    for r in candidates:
        u = canonical_instagram_post_url(str(r.get("post_url") or ""))
        if u:
            canon_urls.append(u)
        ids.append(str(r["id"]))

    summary: Dict[str, Any] = {
        "client_id": client_id,
        "client_slug": args.client_slug.strip(),
        "posted_after": posted_after,
        "posted_before": posted_before,
        "min_keep_score": min_keep,
        "sources_filter": sorted(sources) if sources else None,
        "dry_run": not args.execute,
        "scraped_reels_to_delete": len(ids),
        "distinct_post_urls": len(set(canon_urls)),
    }

    if args.execute:
        summary["reel_analyses_deleted_chunks"] = _delete_analyses_for_urls(
            supabase, client_id=client_id, urls=canon_urls, execute=True
        )
        summary["scraped_reels_deleted_chunks"] = _delete_scraped_by_ids(
            supabase, client_id=client_id, ids=ids, execute=True
        )
    else:
        summary["hint"] = "Re-run with --execute to delete; analyses first, then scraped_reels."

    if args.repair_relations:
        summary["repair"] = _repair_window(
            supabase,
            client_id=client_id,
            posted_after=posted_after,
            posted_before=posted_before,
            sources=sources,
            execute=args.execute,
        )
        if not args.execute:
            summary["repair"]["note"] = "repair counts are preview-only without --execute (no DB writes)"

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
