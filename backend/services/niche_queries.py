"""Niche keyword / hashtag lists from clients.niche_config — shared by competitor_discovery and niche_reel_scrape."""

from __future__ import annotations

import re
from typing import Any, Dict, List


def sanitize_apify_search_term(text: str, *, max_len: int = 48, max_words: int = 5) -> str:
    """Apify user search rejects punctuation and long free-text quiz answers."""
    cleaned = re.sub(r"[^\w\s-]", " ", str(text or ""), flags=re.UNICODE)
    words = [w for w in cleaned.split() if len(w) >= 2][:max_words]
    if not words:
        return "content creator"
    return " ".join(words)[:max_len].strip() or "content creator"


def pick_default_keyword(niche_config: List) -> str:
    """Last-resort search term. Only phrase-shaped values — truncating an
    interview answer here is what produced searches like ``Ziele für die nächsten 12``."""
    if not niche_config:
        return "instagram marketing"
    n0 = niche_config[0]
    for candidate in (
        *(n0.get("keywords_de") or []),
        *(n0.get("keywords") or []),
        n0.get("name"),
    ):
        s = str(candidate or "").strip()
        if s and looks_like_search_phrase(s):
            return s
    return "content creator"


def collect_hashtag_queries(niches: List, max_q: int = 6) -> List[str]:
    """Topic hashtags from niche_config (no #). Used as reel-search keywords."""
    out: List[str] = []
    seen: set[str] = set()
    for n in niches or []:
        if not isinstance(n, dict):
            continue
        for key in ("hashtags", "hashtags_de"):
            for h in n.get(key) or []:
                s = str(h).strip().lstrip("#")
                if not s:
                    continue
                low = s.lower()
                if low in seen:
                    continue
                seen.add(low)
                out.append(s)
                if len(out) >= max_q:
                    return out
    return out


def looks_like_search_phrase(text: str) -> bool:
    """Reject dumped interview answers that Instagram user-search cannot use."""
    s = str(text or "").strip()
    if not s or "\n" in s or len(s) > 80:
        return False
    return 1 <= len(s.split()) <= 6


def competitor_search_phrases(
    candidates: List[Any],
    *,
    max_terms: int = 8,
) -> tuple[List[str], List[str]]:
    """Keep only terms Instagram user-search can resolve.

    Returns ``(used, dropped)`` so a run that found no accounts shows *which*
    terms were unusable instead of silently searching on truncated prose.
    """
    used: List[str] = []
    dropped: List[str] = []
    seen: set[str] = set()
    for raw in candidates or []:
        s = " ".join(str(raw or "").split())
        if not s:
            continue
        if not looks_like_search_phrase(s):
            dropped.append(s[:120])
            continue
        term = sanitize_apify_search_term(s)
        low = term.lower()
        if not term or low in seen:
            continue
        seen.add(low)
        used.append(term)
        if len(used) >= max(1, max_terms):
            break
    return used, dropped


def collect_keywords(niches: List, payload: Dict[str, Any]) -> List[str]:
    """Same as scripts competitor-batch-discover (--keywords / --lang)."""
    raw = payload.get("keywords")
    if isinstance(raw, list) and len(raw) > 0:
        out = [
            sanitize_apify_search_term(x)
            for x in raw
            if looks_like_search_phrase(str(x))
        ]
        out = [x for x in out if x]
        if out:
            return out
    one = payload.get("keyword")
    if one and looks_like_search_phrase(str(one)):
        return [sanitize_apify_search_term(one)]
    mode = str(payload.get("keyword_mode") or "all").lower()
    if mode not in ("all", "de", "en"):
        mode = "all"
    seen: set[str] = set()
    ordered: List[str] = []
    for n in niches or []:
        if mode in ("all", "de"):
            for k in n.get("keywords_de") or []:
                s = str(k).strip()
                if looks_like_search_phrase(s) and s not in seen:
                    seen.add(s)
                    ordered.append(s)
        if mode in ("all", "en"):
            for k in n.get("keywords") or []:
                s = str(k).strip()
                if looks_like_search_phrase(s) and s not in seen:
                    seen.add(s)
                    ordered.append(s)
    if not ordered:
        return [sanitize_apify_search_term(pick_default_keyword(niches))]
    return [sanitize_apify_search_term(k) for k in ordered[:12]]


def build_niche_reel_search_queries(
    niches: List,
    payload: Dict[str, Any],
    *,
    include_hashtags: bool = True,
    max_hashtag_queries: int = 6,
) -> List[str]:
    """Ordered unique queries: niche keywords (+ optional hashtags)."""
    kws = collect_keywords(niches, payload)
    if not include_hashtags or max_hashtag_queries <= 0:
        return kws
    seen = {k.lower() for k in kws}
    for h in collect_hashtag_queries(niches, max_q=max_hashtag_queries):
        low = h.lower()
        if low in seen:
            continue
        seen.add(low)
        kws.append(h)
    return kws
