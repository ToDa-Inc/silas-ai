#!/usr/bin/env python3
"""Fast curated-reel importer: Apify metadata only -> competitors + scraped_reels.

No API endpoint. No video download. No LLM. Uses repo .env, Apify, Supabase service role.
"""
from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Allow importing backend modules when run from repo root.
REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from core.config import get_settings
from core.database import get_supabase_for_settings
from core.id_generator import generate_competitor_id, generate_job_id, generate_reel_id
from services.apify import enrich_reel_urls_direct
from services.apify_posted_at import apify_instagram_item_posted_at_iso
from services.apify_reel_fields import saves_and_shares_from_item, video_duration_seconds_from_item
from services.instagram_post_url import canonical_instagram_post_url, canonical_reel_url_from_short_code, instagram_post_short_code
from services.reel_snapshots import insert_snapshots_for_scrape_job
from services.reel_thumbnail_url import reel_thumbnail_url_from_apify_item

URL_RE = re.compile(r"https://www\.instagram\.com/(?:reel|reels|p|tv)/[^\s)\]\"'<>]+", re.I)


def extract_urls(path: Path) -> List[str]:
    text = path.read_text(encoding="utf-8", errors="replace")
    seen: dict[str, None] = {}
    out: List[str] = []
    for m in URL_RE.finditer(text):
        raw = m.group(0).rstrip(".,;)")
        key = canonical_instagram_post_url(raw)
        if key and key not in seen:
            seen[key] = None
            out.append(raw)
    return out


def caption_text(item: dict) -> str:
    c = item.get("caption")
    if isinstance(c, dict):
        return str(c.get("text") or "")[:8000]
    if isinstance(c, str):
        return c[:8000]
    return ""


def post_url(item: dict, fallback: str = "") -> str:
    u = item.get("url") or item.get("inputUrl") or fallback
    sc = instagram_post_short_code(str(u or "")) or str(item.get("shortCode") or "").strip()
    if sc:
        return canonical_reel_url_from_short_code(sc)
    if u:
        return canonical_instagram_post_url(str(u))
    return ""


def owner_username(item: dict) -> str:
    owner = item.get("owner") if isinstance(item.get("owner"), dict) else {}
    return str(
        item.get("ownerUsername")
        or item.get("owner_username")
        or item.get("username")
        or owner.get("username")
        or ""
    ).strip().lstrip("@").lower()


def views_int(item: dict) -> int:
    try:
        return int(item.get("videoViewCount") or item.get("videoPlayCount") or item.get("playsCount") or 0)
    except Exception:
        return 0


def hashtags(item: dict, caption: str) -> list[str]:
    raw = item.get("hashtags")
    if isinstance(raw, list) and raw:
        return [str(x).strip() for x in raw if x][:50]
    return re.findall(r"#[\w\u00C0-\u024F]+", caption)[:50]


def media_format(item: dict) -> str:
    t = str(item.get("type") or "")
    if t in ("Sidecar", "GraphSidecar"):
        return "carousel"
    return "reel"


def ensure_competitors(supabase, client_id: str, usernames: list[str], *, added_by: str, dry_run: bool) -> dict[str, str]:
    if not usernames:
        return {}
    existing = supabase.table("competitors").select("id, username").eq("client_id", client_id).execute().data or []
    by_user = {str(r.get("username") or "").lower(): str(r["id"]) for r in existing if r.get("username")}
    new_rows = []
    now = datetime.now(timezone.utc).isoformat()
    for u in usernames:
        if not u or u in by_user:
            continue
        cid = generate_competitor_id()
        by_user[u] = cid
        new_rows.append({
            "id": cid,
            "client_id": client_id,
            "username": u,
            "profile_url": f"https://www.instagram.com/{u}/",
            "followers": None,
            "avg_views": None,
            "avg_likes": None,
            "avg_comments": None,
            "language": None,
            "content_style": None,
            "topics": [],
            "reasoning": "Imported from curated management reel list.",
            "relevance_score": None,
            "performance_score": None,
            "language_bonus": 0,
            "composite_score": None,
            "tier": None,
            "tier_label": None,
            "discovery_job_id": None,
            "last_scraped_at": now,
        })
    if new_rows and not dry_run:
        # inserted in small chunks to keep payloads safe
        for i in range(0, len(new_rows), 100):
            supabase.table("competitors").insert(new_rows[i:i+100]).execute()
    return by_user


def rows_from_items(items: list[dict], *, client_id: str, job_id: str, own: str, comp_by_user: dict[str, str], id_by_url: dict[str, str]) -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    by_url: dict[str, dict] = {}
    for item in items:
        pu = post_url(item, str(item.get("inputUrl") or ""))
        if pu and pu not in by_url:
            by_url[pu] = item

    rows: list[dict] = []
    for pu, item in by_url.items():
        user = owner_username(item)
        if not user or user == own:
            continue
        cid = comp_by_user.get(user)
        if not cid:
            continue
        cap = caption_text(item)
        likes = int(item.get("likesCount") or item.get("likes") or 0)
        comments = int(item.get("commentsCount") or item.get("comments") or 0)
        saves, shares = saves_and_shares_from_item(item)
        rows.append({
            "id": id_by_url.get(pu) or generate_reel_id(),
            "client_id": client_id,
            "competitor_id": cid,
            "scrape_job_id": job_id,
            "post_url": pu,
            "thumbnail_url": reel_thumbnail_url_from_apify_item(item),
            "account_username": user,
            "account_avg_views": None,
            "account_avg_likes": None,
            "account_avg_comments": None,
            "views": views_int(item),
            "likes": max(0, likes),
            "comments": max(0, comments),
            "saves": saves,
            "shares": shares,
            "outlier_ratio": None,
            "is_outlier": False,
            "hook_text": (cap.split("\n")[0][:500] if cap else None),
            "caption": cap or None,
            "hashtags": hashtags(item, cap),
            "posted_at": apify_instagram_item_posted_at_iso(item),
            "format": media_format(item),
            "source": "curated_reel_list",
            "video_duration": video_duration_seconds_from_item(item),
            "first_seen_at": now,
            "last_updated_at": now,
        })
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", type=Path, default=REPO_ROOT / "competitor_list.md")
    ap.add_argument("--client-slug", default="conny-gfrerer")
    ap.add_argument("--org-slug", default="test")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--skip", type=int, default=0)
    ap.add_argument("--chunk-size", type=int, default=100)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    settings = get_settings()
    if not settings.apify_api_token:
        raise SystemExit("APIFY_API_TOKEN missing")
    supabase = get_supabase_for_settings(settings)

    org = supabase.table("organizations").select("id").eq("slug", args.org_slug).limit(1).execute().data
    if not org:
        raise SystemExit(f"Org not found: {args.org_slug}")
    org_id = org[0]["id"]
    client_rows = supabase.table("clients").select("id, instagram_handle").eq("org_id", org_id).eq("slug", args.client_slug).limit(1).execute().data
    if not client_rows:
        raise SystemExit(f"Client not found: {args.client_slug} in org {args.org_slug}")
    client_id = client_rows[0]["id"]
    own = str(client_rows[0].get("instagram_handle") or "").lstrip("@").lower()

    all_urls = extract_urls(args.file)
    urls = all_urls[args.skip:]
    if args.limit:
        urls = urls[: args.limit]
    total = len(urls)
    print(f"urls={total} skipped={args.skip} client_id={client_id} dry_run={args.dry_run} chunk_size={args.chunk_size}", flush=True)
    if not urls:
        return

    job_id = generate_job_id()
    if not args.dry_run:
        supabase.table("background_jobs").insert({
            "id": job_id,
            "org_id": org_id,
            "client_id": client_id,
            "job_type": "curated_reel_import_fast",
            "payload": {"file": str(args.file), "url_count": total, "chunk_size": args.chunk_size},
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "result": {"phase": "started", "processed_urls": 0, "reels_upserted": 0, "competitors": 0},
        }).execute()

    all_errors: list[str] = []
    totals = {"apify_items": 0, "unique_items": 0, "competitors": 0, "reels_upserted": 0, "snapshots": 0}
    known_comp_by_user: dict[str, str] = {}

    for start in range(0, total, args.chunk_size):
        chunk = urls[start:start + args.chunk_size]
        chunk_no = start // args.chunk_size + 1
        chunk_total = (total + args.chunk_size - 1) // args.chunk_size
        print(f"chunk {chunk_no}/{chunk_total}: urls {start + 1}-{start + len(chunk)}", flush=True)
        if not args.dry_run:
            supabase.table("background_jobs").update({"result": {**totals, "phase": "apify", "processed_urls": start, "current_chunk": chunk_no}}).eq("id", job_id).execute()

        items, errors = enrich_reel_urls_direct(settings.apify_api_token, chunk)
        all_errors.extend(errors)
        totals["apify_items"] += len(items)
        print(f"chunk {chunk_no}: apify_items={len(items)} errors={len(errors)}", flush=True)

        by_url = {}
        for item in items:
            pu = post_url(item, str(item.get("inputUrl") or ""))
            if pu and pu not in by_url:
                by_url[pu] = item
        totals["unique_items"] += len(by_url)

        usernames = sorted({owner_username(i) for i in by_url.values() if owner_username(i) and owner_username(i) != own})
        comp_by_user = ensure_competitors(supabase, client_id, usernames, added_by="competitor_list.md", dry_run=args.dry_run)
        known_comp_by_user.update(comp_by_user)
        totals["competitors"] = len({u for u in known_comp_by_user if u})

        # Preserve existing scraped_reels.id for any Instagram shortcode variant so rows
        # already referenced by reel_analyses are updated in-place, not re-keyed.
        existing_reels = supabase.table("scraped_reels").select("id, post_url").eq("client_id", client_id).execute().data or []
        id_by_url = {}
        id_by_shortcode = {}
        for r in existing_reels:
            raw_url = str(r.get("post_url") or "")
            rid = str(r["id"])
            canon = canonical_instagram_post_url(raw_url)
            if canon:
                id_by_url[canon] = rid
            sc = instagram_post_short_code(raw_url)
            if sc and sc not in id_by_shortcode:
                id_by_shortcode[sc] = rid
        for item in items:
            pu = post_url(item, str(item.get("inputUrl") or ""))
            sc = instagram_post_short_code(pu)
            if pu and sc and sc in id_by_shortcode and pu not in id_by_url:
                id_by_url[pu] = id_by_shortcode[sc]
        rows = rows_from_items(items, client_id=client_id, job_id=job_id, own=own, comp_by_user=comp_by_user, id_by_url=id_by_url)

        if rows and not args.dry_run:
            existing_rows = [r for r in rows if r.get("post_url") in id_by_url]
            new_rows = [r for r in rows if r.get("post_url") not in id_by_url]
            # Never upsert existing rows with a primary key change: reel_analyses may reference id.
            for r in existing_rows:
                rid = r.pop("id")
                supabase.table("scraped_reels").update(r).eq("id", rid).execute()
            for r in new_rows:
                try:
                    supabase.table("scraped_reels").insert(r).execute()
                except Exception as e:
                    # If another variant/retry created it, update by unique key instead of failing the run.
                    if "23505" not in str(e) and "duplicate key" not in str(e).lower():
                        raise
                    rid = r.pop("id", None)
                    supabase.table("scraped_reels").update(r).eq("client_id", client_id).eq("post_url", r["post_url"]).execute()
            snapshots = insert_snapshots_for_scrape_job(supabase, client_id=client_id, scrape_job_id=job_id)
        else:
            snapshots = 0

        totals["reels_upserted"] += len(rows)
        totals["snapshots"] += snapshots
        print(f"chunk {chunk_no}: owners={len(usernames)} reels_upserted={len(rows)} total_reels={totals['reels_upserted']}", flush=True)
        if not args.dry_run:
            supabase.table("background_jobs").update({"result": {**totals, "phase": "chunk_done", "processed_urls": start + len(chunk), "current_chunk": chunk_no, "errors": all_errors[:20]}}).eq("id", job_id).execute()

    result = {"urls_input": total, **totals, "errors": all_errors[:20]}
    print("RESULT", result, flush=True)
    if not args.dry_run:
        supabase.table("background_jobs").update({
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "result": result,
        }).eq("id", job_id).execute()


if __name__ == "__main__":
    main()
