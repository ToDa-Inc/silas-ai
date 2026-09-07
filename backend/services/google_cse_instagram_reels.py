"""Google Programmable Search -> Instagram reel URLs for onboarding keyword discovery.

Sasky remains the daily finder. This is an extra URL supplier on the onboarding
keyword_reel_similarity path. Missing credentials skip silently.
"""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Mapping, Optional, Set, Tuple

from services.instagram_post_url import instagram_post_short_code
from services.keyword_search_window import (
    payload_includes_google_cse,
    resolve_google_date_restrict,
)
from services.keyword_similarity_discovery import merge_keyword_discovery_items_into_raw_by_sc

logger = logging.getLogger(__name__)

CSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1"
PER_KEYWORD_HITS = 8
MAX_TOTAL_URLS = 40
_HTTP_TIMEOUT_S = 20.0

_HANDLE_REEL_RE = re.compile(
    r"instagram\.com/([^/?#]+)/(?:reel|reels|p)/([^/?#]+)",
    re.IGNORECASE,
)
_RESERVED_HANDLES = {
    "reel",
    "reels",
    "p",
    "tv",
    "stories",
    "explore",
    "accounts",
    "share",
    "direct",
    "about",
    "legal",
}


_DATE_RESTRICT_RE = re.compile(r"^([dwmy])(\d+)$", re.IGNORECASE)


def _tbs_from_date_restrict(date_restrict: str) -> str:
    """Map CSE ``dateRestrict`` (``m3``) to google-search-scraper ``tbs`` (``qdr:m3``)."""
    s = str(date_restrict or "").strip().lower()
    if not _DATE_RESTRICT_RE.match(s):
        return ""
    return f"qdr:{s}"


def google_cse_configured(settings: Any) -> bool:
    key = str(getattr(settings, "google_cse_api_key", "") or "").strip()
    cx = str(getattr(settings, "google_cse_cx", "") or "").strip()
    return bool(key and cx)


def canonical_reel_from_cse_link(link: str) -> Tuple[str, str, str]:
    """Return (canonical /reel/ URL, shortcode, username-or-empty) from a CSE hit."""
    raw = (link or "").strip()
    if not raw:
        return "", "", ""
    sc = instagram_post_short_code(raw)
    uname = ""
    m = _HANDLE_REEL_RE.search(raw)
    if m:
        handle = (m.group(1) or "").lower().strip()
        code = (m.group(2) or "").strip()
        if handle and handle not in _RESERVED_HANDLES:
            uname = handle
        if not sc and code:
            sc = code
    if not sc:
        return "", "", ""
    return f"https://www.instagram.com/reel/{sc}", sc, uname


def cse_items_from_response(
    payload: Mapping[str, Any],
    *,
    keyword: str,
    seen: Set[str],
    max_total: int,
) -> List[Dict[str, Any]]:
    """Parse Custom Search JSON ``items`` into discovery rows (reel_url / username / keyword)."""
    out: List[Dict[str, Any]] = []
    rows = payload.get("items")
    if not isinstance(rows, list):
        return out
    for row in rows:
        if len(seen) >= max_total:
            break
        if not isinstance(row, dict):
            continue
        link = str(row.get("link") or "")
        url, sc, uname = canonical_reel_from_cse_link(link)
        if not sc or sc in seen:
            continue
        seen.add(sc)
        out.append(
            {
                "reel_url": url,
                "username": uname,
                "keyword": keyword,
                "discovery": "google_cse",
            }
        )
    return out


def apify_google_search_instagram_reel_items(
    *,
    apify_token: str,
    keywords: List[str],
    per_keyword: int = PER_KEYWORD_HITS,
    max_total: int = MAX_TOTAL_URLS,
    date_restrict: str = "",
    run_actor_fn: Optional[Callable[..., List[Dict[str, Any]]]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Search Google via Apify google-search-scraper actor for Instagram reels."""
    from services.apify import run_actor

    runner = run_actor_fn or run_actor
    seen: Set[str] = set()
    items: List[Dict[str, Any]] = []
    clean_kws = [k.strip() for k in keywords if (k or "").strip()]
    if not clean_kws or not apify_token:
        return [], {"queries": 0, "items": 0, "unique_short_codes": 0, "provider": "apify_google"}

    queries_str = "\n".join([f"{k} site:instagram.com/reel" for k in clean_kws])
    input_data = {
        "queries": queries_str,
        "maxPagesPerQuery": 1,
        "resultsPerPage": max(1, min(int(per_keyword), 20)),
        "languageCode": "de",
        "countryCode": "de",
        "csvFriendlyOutput": False,
    }
    tbs = _tbs_from_date_restrict(date_restrict)
    if tbs:
        input_data["tbs"] = tbs
    try:
        raw_batches = runner(apify_token, "apify~google-search-scraper", input_data)
    except Exception as e:
        logger.warning("apify google search actor failed: %s", e)
        return [], {
            "queries": len(clean_kws),
            "items": 0,
            "unique_short_codes": 0,
            "provider": "apify_google",
            "error": str(e)[:300],
        }

    for batch in raw_batches or []:
        if not isinstance(batch, dict):
            continue
        q_term = (batch.get("searchQuery") or {}).get("term", "")
        kw = q_term.replace(" site:instagram.com/reel", "").strip() if q_term else clean_kws[0]
        organic = batch.get("organicResults") or []
        for res in organic:
            if len(seen) >= max_total:
                break
            if not isinstance(res, dict):
                continue
            raw_url = str(res.get("url") or "")
            url, sc, uname = canonical_reel_from_cse_link(raw_url)
            if not sc or sc in seen:
                continue
            seen.add(sc)
            items.append(
                {
                    "reel_url": url,
                    "username": uname,
                    "keyword": kw,
                    "discovery": "google_search",
                }
            )

    return items, {
        "queries": len(clean_kws),
        "items": len(items),
        "unique_short_codes": len(seen),
        "provider": "apify_google",
        "date_restrict": str(date_restrict or ""),
        "tbs": tbs,
    }


def _http_get_json(url: str, timeout: float = _HTTP_TIMEOUT_S) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": "SilasAI/keyword-cse"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
    data = json.loads(body)
    if not isinstance(data, dict):
        raise ValueError("CSE response was not a JSON object")
    return data


def google_cse_search_instagram_reel_items(
    *,
    api_key: str,
    cse_cx: str,
    keywords: List[str],
    per_keyword: int = PER_KEYWORD_HITS,
    max_total: int = MAX_TOTAL_URLS,
    date_restrict: str = "",
    http_get_json: Optional[Callable[[str], Dict[str, Any]]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Search ``{phrase} site:instagram.com/reel`` per keyword. Failures skip that phrase.

    ``date_restrict`` (``m3`` = past 3 months) keeps Google from returning reels
    that rank well but are years old, which the recency filter would discard anyway.
    """
    getter = http_get_json or _http_get_json
    seen: Set[str] = set()
    items: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []
    queries = 0
    num = max(1, min(int(per_keyword), 10))
    restrict = str(date_restrict or "").strip()

    for phrase in keywords:
        if len(seen) >= max_total:
            break
        q = (phrase or "").strip()
        if not q:
            continue
        query_params: Dict[str, Any] = {
            "key": api_key,
            "cx": cse_cx,
            "q": f"{q} site:instagram.com/reel",
            "num": num,
        }
        if _DATE_RESTRICT_RE.match(restrict.lower()):
            query_params["dateRestrict"] = restrict
        params = urllib.parse.urlencode(query_params)
        url = f"{CSE_ENDPOINT}?{params}"
        queries += 1
        try:
            payload = getter(url)
        except urllib.error.HTTPError as e:
            snippet = ""
            try:
                snippet = e.read().decode("utf-8", errors="replace")[:240]
            except Exception:
                snippet = str(e)[:240]
            logger.warning("google CSE HTTP %s for %r: %s", e.code, q, snippet)
            errors.append({"keyword": q, "error": f"http_{e.code}"})
            continue
        except Exception as e:
            logger.warning("google CSE failed for %r: %s", q, e)
            errors.append({"keyword": q, "error": type(e).__name__})
            continue
        if payload.get("error"):
            logger.warning("google CSE error object for %r: %s", q, payload.get("error"))
            errors.append({"keyword": q, "error": "cse_error"})
            continue
        batch = cse_items_from_response(payload, keyword=q, seen=seen, max_total=max_total)
        items.extend(batch)

    meta: Dict[str, Any] = {
        "queries": queries,
        "items": len(items),
        "unique_short_codes": len(seen),
        "errors": errors,
        "date_restrict": restrict,
    }
    return items, meta


def merge_google_cse_urls_if_enabled(
    raw_by_sc: Dict[str, Dict[str, Any]],
    *,
    settings: Any,
    payload: Optional[Mapping[str, Any]],
    keywords: List[str],
    client_handle: str,
    banned_handles: Set[str],
    banned_scs: Set[str],
    dismissed_scs: Set[str],
    search_fn: Optional[
        Callable[..., Tuple[List[Dict[str, Any]], Dict[str, Any]]]
    ] = None,
) -> Dict[str, Any]:
    """Fan Google Search/CSE URLs into ``raw_by_sc`` when the payload asks and keys exist."""
    if not payload_includes_google_cse(payload):
        return {"used": False, "skipped": "not_requested"}

    apify_token = str(getattr(settings, "apify_api_token", "") or "").strip()
    cse_configured = google_cse_configured(settings)

    if not cse_configured and not apify_token:
        logger.info("google search skipped — no GOOGLE_CSE or APIFY credentials")
        return {"used": False, "skipped": "missing_credentials"}

    items: List[Dict[str, Any]] = []
    meta: Dict[str, Any] = {}
    date_restrict = resolve_google_date_restrict(payload=payload)

    if cse_configured:
        api_key = str(settings.google_cse_api_key).strip()
        cse_cx = str(settings.google_cse_cx).strip()
        fn = search_fn or google_cse_search_instagram_reel_items
        try:
            items, meta = fn(
                api_key=api_key,
                cse_cx=cse_cx,
                keywords=keywords,
                date_restrict=date_restrict,
            )
        except Exception as e:
            logger.warning("google CSE search failed: %s", e)
            meta = {"error": str(e)[:300]}
    elif search_fn is not None:
        try:
            items, meta = search_fn(
                api_key="", cse_cx="", keywords=keywords, date_restrict=date_restrict
            )
        except Exception as e:
            logger.exception("custom search_fn failed")
            return {"used": False, "error": str(e)[:400]}

    # Fallback to Apify Google Search if Google CSE produced 0 items and Apify token exists
    if not items and apify_token:
        try:
            apify_items, apify_meta = apify_google_search_instagram_reel_items(
                apify_token=apify_token, keywords=keywords, date_restrict=date_restrict
            )
            if apify_items:
                items = apify_items
                meta = apify_meta
        except Exception as e:
            logger.warning("apify google search fallback failed: %s", e)

    if not items:
        return {"used": False, "skipped": "no_results_or_auth_blocked", "meta": meta}

    merge_keyword_discovery_items_into_raw_by_sc(
        items,
        raw_by_sc,
        client_handle=client_handle,
        banned_handles=banned_handles,
        banned_scs=banned_scs,
        dismissed_scs=dismissed_scs,
        keywords=keywords,
    )
    out = dict(meta)
    out["used"] = True
    out["merged_items"] = len(items)
    return out
