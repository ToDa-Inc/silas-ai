"""Sasky keyword URL discovery for keyword_reel_similarity — reel actor + posts URL fallback."""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Set, Tuple

from services.apify import (
    ApifyUsageLimitError,
    KEYWORD_POSTS_ACTOR,
    KEYWORD_REEL_ACTOR,
    run_keyword_post_search_batch,
    run_keyword_reel_search_batch,
)
from services.instagram_post_url import instagram_post_short_code


def merge_keyword_discovery_items_into_raw_by_sc(
    items: List[Dict[str, Any]],
    raw_by_sc: Dict[str, Dict[str, Any]],
    *,
    client_handle: str,
    banned_handles: Set[str],
    banned_scs: Set[str],
    dismissed_scs: Set[str],
    keywords: List[str],
) -> None:
    """Accumulate Sasky reel-keyword or posts-keyword rows into raw_by_sc by shortcode."""
    for it in items:
        reel_url = (it.get("reel_url") or it.get("post_url") or "").strip()
        uname = (it.get("user_name") or it.get("username") or "").lower().strip()
        if not reel_url or not uname:
            continue
        if uname == client_handle or uname in banned_handles:
            continue
        sc = instagram_post_short_code(reel_url)
        if not sc:
            continue
        if sc in banned_scs or sc in dismissed_scs:
            continue
        kw_tag = (it.get("keyword") or it.get("query") or "").strip()
        if sc not in raw_by_sc:
            raw_by_sc[sc] = {"username": uname, "keywords": []}
        if kw_tag and kw_tag not in raw_by_sc[sc]["keywords"]:
            raw_by_sc[sc]["keywords"].append(kw_tag)
        elif not raw_by_sc[sc]["keywords"] and keywords:
            raw_by_sc[sc]["keywords"].append(keywords[0])


def discover_keyword_urls_with_fallback(
    apify_token: str,
    keywords: List[str],
    *,
    total_limit: int,
    search_window: str,
    client_handle: str,
    banned_handles: Set[str],
    banned_scs: Set[str],
    dismissed_scs: Set[str],
    reel_batch: Callable[..., List[Any]] = run_keyword_reel_search_batch,
    post_batch: Callable[..., List[Any]] = run_keyword_post_search_batch,
) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
    """Sasky reel-keyword search, then posts-keyword fallback if no usable URLs.

    Returns ``(raw_by_sc, discovery_meta)`` where ``discovery_meta`` includes ``keywords_run``,
    counts, and optional ``keyword_search_fallback_error``.

    Raises ``ApifyUsageLimitError`` from batch calls unchanged. On fallback failure
    (non-limit), returns empty ``raw_by_sc`` and sets ``keyword_search_fallback_error``.
    """
    meta: Dict[str, Any] = {
        "keyword_search_primary_items": 0,
        "keyword_search_fallback_used": False,
        "keyword_search_fallback_reason": None,
        "keyword_search_fallback_items": 0,
        "keyword_search_fallback_error": None,
        "total_keyword_actor_items": 0,
        "keyword_discovery_impl": "posts_fallback_v1",
        "discovery_log": [],
        "keywords_run": [],
    }

    items_primary = reel_batch(
        apify_token, keywords, max_items_total=total_limit, date=search_window
    )
    meta["keyword_search_primary_items"] = len(items_primary)
    meta["total_keyword_actor_items"] = len(items_primary)

    raw_by_sc: Dict[str, Dict[str, Any]] = {}
    merge_keyword_discovery_items_into_raw_by_sc(
        items_primary,
        raw_by_sc,
        client_handle=client_handle,
        banned_handles=banned_handles,
        banned_scs=banned_scs,
        dismissed_scs=dismissed_scs,
        keywords=keywords,
    )
    meta["discovery_log"].append(
        {
            "stage": "primary_keyword_reels_completed",
            "actor": KEYWORD_REEL_ACTOR,
            "items": len(items_primary),
            "usable_short_codes": len(raw_by_sc),
        }
    )

    if raw_by_sc:
        meta["keywords_run"] = [
            {
                "batch": True,
                "source_actor": KEYWORD_REEL_ACTOR,
                "primary_items": len(items_primary),
                "fallback_used": False,
                "fallback_items": 0,
                "unique_short_codes": len(raw_by_sc),
            }
        ]
        return raw_by_sc, meta

    meta["keyword_search_fallback_reason"] = (
        "primary_returned_empty_dataset"
        if not items_primary
        else "primary_returned_no_usable_urls_after_filter"
    )
    meta["discovery_log"].append(
        {
            "stage": "fallback_decision",
            "fallback_used": True,
            "reason": meta["keyword_search_fallback_reason"],
            "actor": KEYWORD_POSTS_ACTOR,
        }
    )

    try:
        items_fallback = post_batch(
            apify_token, keywords, max_items_total=total_limit, date=search_window
        )
        meta["keyword_search_fallback_used"] = True
        meta["keyword_search_fallback_items"] = len(items_fallback)
        meta["total_keyword_actor_items"] = len(items_primary) + len(items_fallback)
        merge_keyword_discovery_items_into_raw_by_sc(
            items_fallback,
            raw_by_sc,
            client_handle=client_handle,
            banned_handles=banned_handles,
            banned_scs=banned_scs,
            dismissed_scs=dismissed_scs,
            keywords=keywords,
        )
        meta["discovery_log"].append(
            {
                "stage": "fallback_keyword_posts_completed",
                "actor": KEYWORD_POSTS_ACTOR,
                "items": len(items_fallback),
                "usable_short_codes": len(raw_by_sc),
            }
        )
    except ApifyUsageLimitError:
        raise
    except Exception as e:
        meta["keyword_search_fallback_error"] = str(e)[:200]
        meta["discovery_log"].append(
            {
                "stage": "fallback_keyword_posts_failed",
                "actor": KEYWORD_POSTS_ACTOR,
                "error": meta["keyword_search_fallback_error"],
            }
        )
        meta["keywords_run"] = [
            {
                "batch": True,
                "source_actor": KEYWORD_POSTS_ACTOR,
                "primary_items": len(items_primary),
                "fallback_used": True,
                "fallback_items": 0,
                "fallback_error": meta["keyword_search_fallback_error"],
                "unique_short_codes": 0,
            }
        ]
        return {}, meta

    kr_entry: Dict[str, Any] = {
        "batch": True,
        "source_actor": KEYWORD_POSTS_ACTOR,
        "primary_actor": KEYWORD_REEL_ACTOR,
        "primary_items": len(items_primary),
        "fallback_used": True,
        "fallback_items": meta["keyword_search_fallback_items"],
        "unique_short_codes": len(raw_by_sc),
        "fallback_reason": meta["keyword_search_fallback_reason"],
    }
    meta["keywords_run"] = [kr_entry]
    return raw_by_sc, meta
