"""Enqueue ``batch_rescore_scraped_reels_similarity`` for the worker (no inline run).

  cd silas-content-system/backend
  .venv/bin/python enqueue_batch_rescore_scraped_reels_similarity.py conny-gfrerer \\
    --posted-after 2026-05-09 --posted-before 2026-05-11 --threshold 80

Watch progress: Supabase ``background_jobs`` row ``result`` JSON, or worker stdout.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from core.config import get_settings
from core.database import get_supabase_for_settings
from jobs.batch_rescore_scraped_reels_similarity import enqueue_batch_rescore_job


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("slug", help="clients.slug")
    p.add_argument("--posted-after", required=True, metavar="YYYY-MM-DD")
    p.add_argument("--posted-before", required=True, metavar="YYYY-MM-DD")
    p.add_argument("--threshold", type=int, default=80)
    p.add_argument("--sources", default="", help="Comma-separated scraped_reels.source values")
    p.add_argument("--only-missing-score", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--enrich-chunk-size", type=int, default=40)
    p.add_argument("--progress-flush-every", type=int, default=5)
    p.add_argument("--priority", type=int, default=15, help="background_jobs.priority (higher runs sooner)")
    p.add_argument(
        "--apify-token",
        default=None,
        help="Override APIFY_API_TOKEN for enqueue only (optional).",
    )
    args = p.parse_args()

    if args.apify_token:
        os.environ["APIFY_API_TOKEN"] = args.apify_token.strip()
        get_settings.cache_clear()

    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing", file=sys.stderr)
        sys.exit(1)

    supabase = get_supabase_for_settings(settings)
    r = (
        supabase.table("clients")
        .select("id, org_id, slug, name")
        .eq("slug", args.slug.strip())
        .limit(1)
        .execute()
    )
    if not r.data:
        print("ERROR: No client with slug", repr(args.slug), file=sys.stderr)
        sys.exit(1)
    row = r.data[0]
    org_id = row.get("org_id") or ""
    if not org_id:
        print("ERROR: client has no org_id", file=sys.stderr)
        sys.exit(1)

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
                "client_slug": row.get("slug"),
                "client_name": row.get("name"),
                "job_type": "batch_rescore_scraped_reels_similarity",
                "payload": payload,
                "hint": "Run worker.py to process; poll background_jobs.result for progress.",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
