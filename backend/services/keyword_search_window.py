"""Sasky search-window + recency-day pairing for keyword_reel_similarity.

Daily discovery stays on a 2-day window. Onboarding needs a month of inventory
and must not let niche ``recency_days`` collapse that window back to 2 days.
"""

from __future__ import annotations

from typing import Any, Dict, Mapping, Optional, Tuple

DEFAULT_SEARCH_WINDOW = "last-2-days"
DEFAULT_DAYS = 2

# Sasky ``date`` enum → post-enrich recency cutoff used by the similarity job.
SEARCH_WINDOW_DAYS: Dict[str, int] = {
    "last-1-day": 1,
    "last-2-days": 2,
    "last-1-week": 7,
    "last-1-month": 30,
}

ONBOARDING_SEARCH_WINDOW = "last-1-month"
ONBOARDING_DAYS = 30
DEFAULT_MIN_VIEWS_PER_DAY = 2000.0
ONBOARDING_MIN_VIEWS_PER_DAY = 500.0
ONBOARDING_URL_SOURCES = ["sasky", "google_cse"]

# ``last-1-month`` is the widest value the Sasky ``date`` enum accepts, so the
# keyword lane cannot look back further than 30 days. Google has no such ceiling:
# it ranks by relevance over its whole index. Giving the Google lane its own
# cutoff lets a 2-3 month old reel through while Sasky stays at 30 days.
GOOGLE_LOOKBACK_DAYS = 90
# Google Custom Search ``dateRestrict`` / google-search ``tbs=qdr:`` unit.
GOOGLE_DATE_RESTRICT = "m3"
GOOGLE_DISCOVERY_TAGS = ("google_cse", "google_search", "google")


def resolve_google_lookback_days(
    *,
    niche_settings: Optional[Mapping[str, Any]] = None,
    payload: Optional[Mapping[str, Any]] = None,
    default_days: int = GOOGLE_LOOKBACK_DAYS,
) -> int:
    """Recency cutoff for Google-discovered reels (independent of the Sasky window)."""
    pl = dict(payload or {})
    nset = dict(niche_settings or {})
    for src in (pl.get("google_lookback_days"), nset.get("google_lookback_days")):
        if src is not None:
            return max(1, int(src))
    return max(1, int(default_days))


def resolve_google_date_restrict(
    *,
    niche_settings: Optional[Mapping[str, Any]] = None,
    payload: Optional[Mapping[str, Any]] = None,
) -> str:
    """``dateRestrict`` value handed to Google so it stops returning years-old reels."""
    pl = dict(payload or {})
    nset = dict(niche_settings or {})
    for src in (pl.get("google_date_restrict"), nset.get("google_date_restrict")):
        if src:
            return str(src).strip()
    return GOOGLE_DATE_RESTRICT


def is_google_discovery(discovery: Any) -> bool:
    return str(discovery or "").strip().lower() in GOOGLE_DISCOVERY_TAGS


def recency_days_for_discovery(
    discovery: Any,
    *,
    days: int,
    google_days: int,
) -> int:
    """Per-source cutoff: Google reels may be older than the Sasky search window."""
    if is_google_discovery(discovery):
        return max(days, google_days)
    return days


def resolve_search_window_and_days(
    *,
    niche_settings: Optional[Mapping[str, Any]] = None,
    payload: Optional[Mapping[str, Any]] = None,
) -> Tuple[str, int]:
    """Resolve Sasky window + recency days.

    Precedence:
    - ``payload.search_window`` beats niche settings.
    - ``payload.days`` beats niche recency.
    - If the payload sets a window but not days, days follow that window so a
      month-long Sasky search is not immediately filtered back to 2 days.
    """
    nset = dict(niche_settings or {})
    pl = dict(payload or {})

    payload_window = pl.get("search_window")
    if payload_window:
        window = str(payload_window).strip()
    elif nset.get("search_window"):
        window = str(nset.get("search_window")).strip()
    else:
        window = DEFAULT_SEARCH_WINDOW

    if pl.get("days") is not None:
        days = int(pl["days"])
    elif payload_window:
        days = SEARCH_WINDOW_DAYS.get(window, DEFAULT_DAYS)
    elif nset.get("recency_days") is not None:
        days = int(nset["recency_days"])
    else:
        days = SEARCH_WINDOW_DAYS.get(window, DEFAULT_DAYS)

    return window, max(1, days)


def resolve_min_views_per_day(
    *,
    niche_settings: Optional[Mapping[str, Any]] = None,
    payload: Optional[Mapping[str, Any]] = None,
) -> float:
    """Resolve views/day floor.

    ``payload.min_views_per_day`` beats niche settings so onboarding can lower
    the daily 2000 floor without editing niche_config.
    """
    nset = dict(niche_settings or {})
    pl = dict(payload or {})
    if pl.get("min_views_per_day") is not None:
        return max(0.0, float(pl["min_views_per_day"]))
    if nset.get("min_views_per_day") is not None:
        return max(0.0, float(nset["min_views_per_day"]))
    return DEFAULT_MIN_VIEWS_PER_DAY


def payload_includes_google_cse(payload: Optional[Mapping[str, Any]] = None) -> bool:
    """True when the job asked for Google CSE URL fan-in (onboarding only)."""
    sources = (payload or {}).get("url_sources")
    if not isinstance(sources, list):
        return False
    wanted = {"google_cse", "google"}
    return any(str(s).strip().lower() in wanted for s in sources)


def onboarding_keyword_similarity_payload() -> Dict[str, Any]:
    """Job payload for first-paint profile embedding during onboarding."""
    return {
        "search_window": ONBOARDING_SEARCH_WINDOW,
        "days": ONBOARDING_DAYS,
        "split_by_keyword": True,
        "source": "onboarding",
        "url_sources": list(ONBOARDING_URL_SOURCES),
        "min_views_per_day": ONBOARDING_MIN_VIEWS_PER_DAY,
        "google_lookback_days": GOOGLE_LOOKBACK_DAYS,
        "google_date_restrict": GOOGLE_DATE_RESTRICT,
    }
