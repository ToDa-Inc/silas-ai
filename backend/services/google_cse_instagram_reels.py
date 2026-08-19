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
from services.keyword_search_window import payload_includes_google_cse
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
    http_get_json: Optional[Callable[[str], Dict[str, Any]]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Search ``{phrase} site:instagram.com/reel`` per keyword. Failures skip that phrase."""
    getter = http_get_json or _http_get_json
    seen: Set[str] = set()
    items: List[Dict[str, Any]] = []
    errors: List[Dict[str, str]] = []
    queries = 0
    num = max(1, min(int(per_keyword), 10))

    for phrase in keywords:
        if len(seen) >= max_total:
            break
        q = (phrase or "").strip()
        if not q:
            continue
        params = urllib.parse.urlencode(
            {
                "key": api_key,
                "cx": cse_cx,
                "q": f"{q} site:instagram.com/reel",
                "num": num,
            }
        )
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
    """Fan Google CSE URLs into ``raw_by_sc`` when the payload asks and keys exist."""
    if not payload_includes_google_cse(payload):
        return {"used": False, "skipped": "not_requested"}
    if not google_cse_configured(settings):
        logger.info("google CSE skipped — GOOGLE_CSE_API_KEY / GOOGLE_CSE_CX unset")
        return {"used": False, "skipped": "missing_credentials"}

    api_key = str(settings.google_cse_api_key).strip()
    cse_cx = str(settings.google_cse_cx).strip()
    fn = search_fn or google_cse_search_instagram_reel_items
    try:
        items, meta = fn(api_key=api_key, cse_cx=cse_cx, keywords=keywords)
    except Exception as e:
        logger.exception("google CSE keyword fan-in failed")
        return {"used": False, "error": str(e)[:400]}

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
