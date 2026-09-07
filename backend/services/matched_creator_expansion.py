"""Expand a thin keyword batch using the back catalogue of creators that already matched.

Keyword search is a lottery: it returns whichever reels happen to rank for a
phrase. Once a reel scores above the similarity bar we know its author is
on-brand, so their other recent reels are a far denser source of candidates than
another keyword query — and only the ones that beat the creator's *own* average
are worth showing, because those are the posts that actually popped off.
"""

from __future__ import annotations

from statistics import median
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set

# A reel must beat its own account's typical view count by this much to count as
# an outlier. 1.5x is deliberately lenient: on small accounts the median is noisy.
DEFAULT_OUTLIER_MULTIPLIER = 1.5
DEFAULT_MAX_HANDLES = 3
DEFAULT_POSTS_PER_HANDLE = 12
DEFAULT_OUTLIERS_PER_HANDLE = 4
# Apify ``onlyPostsNewerThan`` relative string — matches the Google lookback.
DEFAULT_ONLY_NEWER_THAN = "3 months"


def _views(row: Any) -> int:
    try:
        return max(0, int((row or {}).get("views") or 0))
    except (TypeError, ValueError):
        return 0


def _handle(value: Any) -> str:
    return str(value or "").strip().lstrip("@").lower()


def select_matched_creator_handles(
    scored: Sequence[Dict[str, Any]],
    *,
    threshold: int,
    max_handles: int = DEFAULT_MAX_HANDLES,
    exclude: Optional[Iterable[str]] = None,
) -> List[str]:
    """Handles of creators whose reel cleared the bar, best score first.

    Only real matches count. Filling this from near-misses would expand the
    catalogue of accounts we already decided were off-brand.
    """
    blocked = {_handle(x) for x in (exclude or []) if _handle(x)}
    ranked = sorted(
        (r for r in scored if int((r or {}).get("similarity_score") or 0) >= threshold),
        key=lambda r: int(r.get("similarity_score") or 0),
        reverse=True,
    )
    out: List[str] = []
    seen: Set[str] = set()
    for row in ranked:
        h = _handle(row.get("username"))
        if not h or h in seen or h in blocked:
            continue
        seen.add(h)
        out.append(h)
        if len(out) >= max(1, max_handles):
            break
    return out


def creator_baseline_views(posts: Sequence[Dict[str, Any]]) -> float:
    """Typical view count for one account. Median, so a single viral reel can't
    inflate the bar and hide everything else on the profile."""
    values = [_views(p) for p in posts if _views(p) > 0]
    if not values:
        return 0.0
    return float(median(values))


def select_creator_outliers(
    posts: Sequence[Dict[str, Any]],
    *,
    multiplier: float = DEFAULT_OUTLIER_MULTIPLIER,
    limit: int = DEFAULT_OUTLIERS_PER_HANDLE,
    exclude_urls: Optional[Iterable[str]] = None,
    baseline: Optional[float] = None,
) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Posts that outperformed this account's own median, most-viewed first.

    Returns ``(outliers, meta)``. When no post beats the bar the account simply
    contributes nothing — a flat profile has no winners to learn from.
    """
    seen = {str(u).strip() for u in (exclude_urls or []) if str(u).strip()}
    pool = [p for p in posts if str(p.get("url") or "").strip() not in seen]
    base = creator_baseline_views(pool) if baseline is None else float(baseline)
    meta: Dict[str, Any] = {
        "baseline_views": round(base),
        "multiplier": multiplier,
        "considered": len(pool),
        "outliers": 0,
    }
    if base <= 0 or not pool:
        return [], meta
    bar = base * max(1.0, float(multiplier))
    hits = [p for p in pool if _views(p) >= bar]
    hits.sort(key=_views, reverse=True)
    hits = hits[: max(1, limit)]
    meta["outliers"] = len(hits)
    meta["bar_views"] = round(bar)
    return hits, meta


def expansion_budget(
    *,
    saved: int,
    min_save: int,
    max_handles: int = DEFAULT_MAX_HANDLES,
) -> int:
    """How many creator profiles to mine. Zero once the batch is already full."""
    if saved <= 0 or saved >= max(1, min_save):
        return 0
    return max(1, min(max_handles, min_save - saved))
