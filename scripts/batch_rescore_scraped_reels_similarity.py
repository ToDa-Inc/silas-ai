#!/usr/bin/env python3
"""Batch DNA similarity for existing scraped_reels — enqueue for worker or run inline.

**Enqueue (recommended)** — inserts ``background_jobs`` and returns; run ``python worker.py``
(or your Railway worker) to process. Progress lives in ``background_jobs.result``.

  cd silas-content-system/backend && .venv/bin/python ../scripts/batch_rescore_scraped_reels_similarity.py \\
    --enqueue --client-slug SLUG --posted-after 2026-05-09 --posted-before 2026-05-11

**Inline sync** — same logic without the queue (blocks until done; optional ``--output`` JSON file):

  ../scripts/batch_rescore_scraped_reels_similarity.py --client-slug SLUG \\
    --posted-after 2026-05-09 --posted-before 2026-05-11 --output /tmp/report.json

See ``jobs/batch_rescore_scraped_reels_similarity.py`` for payload fields.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from core.config import get_settings
from core.database import get_supabase_for_settings
from core.id_generator import generate_job_id
from jobs.batch_rescore_scraped_reels_similarity import (
    enqueue_batch_rescore_job,
    run_batch_rescore_scraped_reels_similarity,
)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--enqueue", action="store_true", help="Insert queued job only (worker runs it)")
    ap.add_argument("--client-slug", required=True)
    ap.add_argument("--posted-after", required=True, metavar="YYYY-MM-DD")
    ap.add_argument("--posted-before", required=True, metavar="YYYY-MM-DD")
    ap.add_argument("--threshold", type=int, default=80)
    ap.add_argument("--sources", default="")
    ap.add_argument("--only-missing-score", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--enrich-chunk-size", type=int, default=40)
    ap.add_argument("--progress-flush-every", type=int, default=5)
    ap.add_argument("--priority", type=int, default=15)
    ap.add_argument("--output", type=Path, default=None, help="Inline sync only: write full JSON report")
    ap.add_argument("--apify-token", default=None)
    args = ap.parse_args()

    if args.apify_token:
        os.environ["APIFY_API_TOKEN"] = args.apify_token.strip()
        get_settings.cache_clear()

    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise SystemExit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing")

    supabase = get_supabase_for_settings(settings)
    r = (
        supabase.table("clients")
        .select("id, org_id, slug, name")
        .eq("slug", args.client_slug.strip())
        .limit(1)
        .execute()
    )
    if not r.data:
        raise SystemExit(f"No client with slug {args.client_slug!r}")
    row = r.data[0]
    org_id = row.get("org_id") or ""
    if not org_id:
        raise SystemExit("client has no org_id")

    payload: dict = {
        "posted_after": args.posted_after,
        "posted_before": args.posted_before,
        "threshold": args.threshold,
        "only_missing_score": args.only_missing_score,
        "dry_run": args.dry_run,
        "enrich_chunk_size": args.enrich_chunk_size,
        "progress_flush_every": args.progress_flush_every,
    }
    if args.limit > 0:
        payload["limit"] = args.limit
    if args.sources.strip():
        payload["sources"] = [s.strip() for s in args.sources.split(",") if s.strip()]

    if args.enqueue:
        job_id = enqueue_batch_rescore_job(
            supabase,
            org_id=str(org_id),
            client_id=str(row["id"]),
            payload=payload,
            priority=args.priority,
        )
        print(
            json.dumps(
                {
                    "job_id": job_id,
                    "job_type": "batch_rescore_scraped_reels_similarity",
                    "hint": "Poll background_jobs.result for progress; worker logs batch_rescore lines.",
                },
                indent=2,
            )
        )
        return

    if not settings.apify_api_token or not settings.openrouter_api_key:
        raise SystemExit("APIFY_API_TOKEN and OPENROUTER_API_KEY required for inline sync")

    out_path = args.output
    if out_path:
        payload["write_report_path"] = str(out_path.resolve())

    job_id = generate_job_id()
    job = {"id": job_id, "client_id": row["id"], "payload": payload}
    run_batch_rescore_scraped_reels_similarity(settings, job)
    print(json.dumps({"job_id": job_id, "inline_sync": True, "output": str(out_path) if out_path else None}, indent=2))


if __name__ == "__main__":
    main()
