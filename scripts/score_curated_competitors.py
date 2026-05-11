#!/usr/bin/env python3
"""Score curated imported competitors with Gemini text relevance.

Uses imported curated_reel_list captions/hook_text as account evidence.
Updates competitors with relevance fields. Writes keep/review/remove JSON report.
No deletes.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from core.config import get_settings
from core.database import get_supabase_for_settings
from core.id_generator import generate_job_id
from jobs.competitor_discovery import _build_niche_profile, _build_relevance_prompt
from services.competitor_scoring import evaluate_competitor
from services.openrouter import analyze_relevance


def latest_baseline(db, client_id: str) -> dict[str, Any]:
    rows = db.table("client_baselines").select("*").eq("client_id", client_id).order("scraped_at", desc=True).limit(1).execute().data or []
    if not rows:
        return {"p90_views": 0, "median_views": 0, "p10_views": 0}
    return rows[0]


def account_evidence(db, client_id: str, username: str, limit: int) -> list[dict[str, Any]]:
    rows = (
        db.table("scraped_reels")
        .select("caption, hook_text, views, likes, comments, post_url, source")
        .eq("client_id", client_id)
        .ilike("account_username", username)
        .order("views", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    out = []
    for r in rows:
        cap = (r.get("caption") or r.get("hook_text") or "").strip()
        if not cap:
            continue
        out.append({
            "caption": cap,
            "views": int(r.get("views") or 0),
            "likes": int(r.get("likes") or 0),
            "comments": int(r.get("comments") or 0),
            "url": r.get("post_url"),
        })
    return out


def extract_json_object(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```json\s*", "", text.strip())
    cleaned = re.sub(r"```\s*$", "", cleaned).strip()
    match = re.search(r"\{.*\}", cleaned, flags=re.S)
    if match:
        cleaned = match.group(0)
    return json.loads(cleaned)


def analyze_relevance_lenient(openrouter_key: str, prompt: str, model: str) -> dict[str, Any]:
    try:
        return analyze_relevance(openrouter_key, prompt, model)
    except json.JSONDecodeError:
        from services.openrouter import _post_chat_completions_with_optional_fallback

        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                    + "\n\nReturn ONLY valid minified JSON. No markdown, no comments, no trailing commas.",
                }
            ],
            "max_tokens": 512,
            "temperature": 0,
        }
        response = _post_chat_completions_with_optional_fallback(
            openrouter_key,
            payload,
            timeout=120.0,
            primary_model=model,
            enable_model_fallback=True,
        )
        data = response.json()
        if data.get("error"):
            raise RuntimeError(data["error"].get("message", str(data["error"])))
        return extract_json_object(data["choices"][0]["message"]["content"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--client-slug", default="conny-gfrerer")
    ap.add_argument("--org-slug", default="test")
    ap.add_argument("--threshold", type=int, default=80)
    ap.add_argument("--limit", type=int, default=0, help="score at most N competitors")
    ap.add_argument("--evidence-limit", type=int, default=8)
    ap.add_argument("--usernames", default="", help="comma-separated usernames to score")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    settings = get_settings()
    if not settings.openrouter_api_key:
        raise SystemExit("OPENROUTER_API_KEY missing")
    db = get_supabase_for_settings(settings)

    org = db.table("organizations").select("id").eq("slug", args.org_slug).limit(1).execute().data
    if not org:
        raise SystemExit(f"Org not found: {args.org_slug}")
    org_id = org[0]["id"]
    clients = db.table("clients").select("*").eq("org_id", org_id).eq("slug", args.client_slug).limit(1).execute().data
    if not clients:
        raise SystemExit(f"Client not found: {args.client_slug}")
    client = clients[0]
    client_id = client["id"]
    cfg = {
        "name": client.get("name") or "",
        "instagram": (client.get("instagram_handle") or "").replace("@", ""),
        "language": client.get("language") or "de",
        "niches": client.get("niche_config") or [],
        "icp": client.get("icp") or {},
    }
    niche_profile = _build_niche_profile(cfg)
    baseline = latest_baseline(db, client_id)

    comps = db.table("competitors").select("*").eq("client_id", client_id).order("username").execute().data or []
    # Score likely imported candidates first: empty relevance_score or low metadata from import.
    candidates = [c for c in comps if c.get("username")]
    wanted = {u.strip().lower().lstrip("@") for u in args.usernames.split(",") if u.strip()}
    if wanted:
        candidates = [c for c in candidates if str(c.get("username") or "").strip().lower().lstrip("@") in wanted]
    if args.limit:
        candidates = candidates[: args.limit]

    job_id = generate_job_id()
    if not args.dry_run:
        db.table("background_jobs").insert({
            "id": job_id,
            "org_id": org_id,
            "client_id": client_id,
            "job_type": "curated_competitor_relevance_score",
            "payload": {"threshold": args.threshold, "candidate_count": len(candidates), "model": settings.openrouter_model},
            "status": "running",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "result": {"phase": "started", "scored": 0, "kept": 0, "remove": 0},
        }).execute()

    report = {"threshold": args.threshold, "model": settings.openrouter_model, "keep": [], "review": [], "remove": [], "no_evidence": [], "errors": []}
    print(f"scoring candidates={len(candidates)} threshold={args.threshold} model={settings.openrouter_model}", flush=True)

    for idx, comp in enumerate(candidates, 1):
        username = str(comp.get("username") or "").strip().lower()
        ev = account_evidence(db, client_id, username, args.evidence_limit)
        if not ev:
            row = {"id": comp["id"], "username": username, "reason": "No imported reel captions/hook text available"}
            report["no_evidence"].append(row)
            print(f"[{idx}/{len(candidates)}] @{username}: no evidence", flush=True)
            continue

        account_data = {
            "username": username,
            "bio": comp.get("reasoning") or "",
            "followers": comp.get("followers") or 0,
            "_client_lang": cfg["language"],
        }
        prompt = _build_relevance_prompt(niche_profile, account_data, ev)
        try:
            analysis = analyze_relevance_lenient(settings.openrouter_api_key, prompt, settings.openrouter_model)
            score = max(0, min(100, int(analysis.get("relevance_score") or 0)))
            avg_views = round(sum(int(x.get("views") or 0) for x in ev) / max(1, len(ev)))
            avg_likes = round(sum(int(x.get("likes") or 0) for x in ev) / max(1, len(ev)))
            avg_comments = round(sum(int(x.get("comments") or 0) for x in ev) / max(1, len(ev)))
            disc = {
                "username": username,
                "profileUrl": comp.get("profile_url") or f"https://www.instagram.com/{username}/",
                "followers": comp.get("followers"),
                "avgViews": avg_views,
                "avgLikes": avg_likes,
                "avgComments": avg_comments,
                "relevance": analysis,
            }
            scored = evaluate_competitor(disc, baseline, cfg["language"])
            if score < args.threshold:
                # Keep the row non-active for scrape_cycle/sync-all consumers: tier 4 + score populated.
                scored["tier"] = 4
                scored["tier_label"] = "REJECT — below curated competitor relevance threshold"
            update = {
                "profile_url": comp.get("profile_url") or f"https://www.instagram.com/{username}/",
                "avg_views": avg_views,
                "avg_likes": avg_likes,
                "avg_comments": avg_comments,
                "language": analysis.get("language"),
                "content_style": analysis.get("content_style"),
                "topics": analysis.get("primary_topics") or [],
                "reasoning": analysis.get("reasoning"),
                "relevance_score": score,
                "performance_score": scored.get("performance_score"),
                "language_bonus": scored.get("language_bonus"),
                "composite_score": scored.get("composite_score"),
                "tier": scored.get("tier"),
                "tier_label": scored.get("tier_label"),
                "discovery_job_id": job_id,
            }
            if not args.dry_run:
                db.table("competitors").update(update).eq("id", comp["id"]).execute()
            rec = {"id": comp["id"], "username": username, "score": score, "reasoning": analysis.get("reasoning"), "evidence_count": len(ev)}
            if score >= args.threshold:
                report["keep"].append(rec)
                bucket = "KEEP"
            elif score >= 60:
                report["review"].append(rec)
                bucket = "REVIEW"
            else:
                report["remove"].append(rec)
                bucket = "REMOVE"
            print(f"[{idx}/{len(candidates)}] @{username}: {score} {bucket}", flush=True)
            time.sleep(0.3)
        except Exception as e:
            err = {"id": comp.get("id"), "username": username, "error": str(e)[:500]}
            report["errors"].append(err)
            print(f"[{idx}/{len(candidates)}] @{username}: ERROR {err['error']}", flush=True)

        if not args.dry_run and idx % 10 == 0:
            db.table("background_jobs").update({"result": {"phase": "scoring", "scored": idx, "kept": len(report["keep"]), "review": len(report["review"]), "remove": len(report["remove"]), "errors": len(report["errors"])}}).eq("id", job_id).execute()

    out = REPO_ROOT / "data" / "curated_competitor_relevance_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"REPORT {out}", flush=True)
    print(json.dumps({k: len(v) if isinstance(v, list) else v for k, v in report.items()}, indent=2), flush=True)
    if not args.dry_run:
        db.table("background_jobs").update({
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "result": {"report_path": str(out), "keep": len(report["keep"]), "review": len(report["review"]), "remove": len(report["remove"]), "no_evidence": len(report["no_evidence"]), "errors": len(report["errors"])},
        }).eq("id", job_id).execute()


if __name__ == "__main__":
    main()
