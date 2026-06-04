"""Select 5–10 explainable onboarding reel candidates."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from supabase import Client

CANDIDATE_SOURCES = frozenset(
    {
        "keyword_similarity",
        "competitor_profile",
        "profile_scrape",
        "niche_reel_scrape",
    }
)


def _engagement_score(row: Dict[str, Any]) -> float:
    likes = float(row.get("likes") or 0)
    comments = float(row.get("comments") or 0)
    views = float(row.get("views") or 0)
    ratio = float(row.get("outlier_likes_ratio") or 0)
    sim = float(row.get("similarity_score") or 0)
    score = sim * 2.0 + ratio * 0.5
    if views > 0:
        score += min(comments / views, 0.05) * 100.0
    score += min(likes / max(views, 1), 0.2) * 10.0
    if row.get("is_outlier"):
        score += 3.0
    return score


def _load_feedback_map(supabase: Client, client_id: str) -> Dict[str, str]:
    res = (
        supabase.table("onboarding_reel_feedback")
        .select("scraped_reel_id, verdict")
        .eq("client_id", client_id)
        .execute()
    )
    out: Dict[str, str] = {}
    for row in res.data or []:
        rid = row.get("scraped_reel_id")
        if rid:
            out[str(rid)] = str(row.get("verdict") or "")
    return out


def _load_analyses_for_reels(
    supabase: Client, client_id: str, reel_ids: List[str]
) -> Dict[str, Dict[str, Any]]:
    if not reel_ids:
        return {}
    res = (
        supabase.table("reel_analyses")
        .select("*")
        .eq("client_id", client_id)
        .in_("reel_id", reel_ids)
        .order("created_at", desc=True)
        .execute()
    )
    by_reel: Dict[str, Dict[str, Any]] = {}
    for row in res.data or []:
        rid = row.get("reel_id")
        if rid and str(rid) not in by_reel:
            by_reel[str(rid)] = row
    return by_reel


def list_onboarding_reel_candidates(
    supabase: Client,
    client_id: str,
    *,
    limit: int = 10,
    min_with_analysis: int = 5,
) -> List[Dict[str, Any]]:
    """Rank scraped reels; prefer analyzed outliers with similarity scores."""
    limit = max(5, min(limit, 10))
    feedback = _load_feedback_map(supabase, client_id)

    res = (
        supabase.table("scraped_reels")
        .select(
            "id, shortcode, post_url, caption, likes, comments, views, posted_at, "
            "source, similarity_score, is_outlier, outlier_likes_ratio, competitor_id, "
            "thumbnail_url, video_url, format_guess"
        )
        .eq("client_id", client_id)
        .order("similarity_score", desc=True)
        .limit(200)
        .execute()
    )
    rows = [dict(r) for r in (res.data or [])]

    no_ids = [rid for rid, v in feedback.items() if v == "no"]
    filtered: List[Dict[str, Any]] = []
    for row in rows:
        rid = str(row.get("id") or "")
        if rid in no_ids:
            continue
        src = str(row.get("source") or "")
        if src and src not in CANDIDATE_SOURCES and row.get("competitor_id"):
            filtered.append(row)
        elif src in CANDIDATE_SOURCES or row.get("competitor_id"):
            filtered.append(row)
        elif float(row.get("similarity_score") or 0) > 0:
            filtered.append(row)

    reel_ids = [str(r["id"]) for r in filtered if r.get("id")]
    analyses = _load_analyses_for_reels(supabase, client_id, reel_ids)

    scored: List[Tuple[float, Dict[str, Any], Optional[Dict[str, Any]]]] = []
    for row in filtered:
        rid = str(row.get("id") or "")
        analysis = analyses.get(rid)
        bonus = 5.0 if analysis else 0.0
        scored.append((_engagement_score(row) + bonus, row, analysis))

    scored.sort(key=lambda x: x[0], reverse=True)

    with_analysis = [s for s in scored if s[2] is not None]
    without = [s for s in scored if s[2] is None]
    ordered = with_analysis + without

    out: List[Dict[str, Any]] = []
    for score, reel, analysis in ordered:
        if len(out) >= limit:
            break
        rid = str(reel.get("id") or "")
        out.append(
            {
                "reel": reel,
                "analysis": analysis,
                "score": round(score, 3),
                "already_voted": feedback.get(rid),
            }
        )

    if len([c for c in out if c.get("analysis")]) < min_with_analysis and len(out) < limit:
        return out
    return out
