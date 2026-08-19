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


def onboarding_keyword_similarity_payload() -> Dict[str, Any]:
    """Job payload for first-paint profile embedding during onboarding."""
    return {
        "search_window": ONBOARDING_SEARCH_WINDOW,
        "days": ONBOARDING_DAYS,
        "split_by_keyword": True,
        "source": "onboarding",
    }
