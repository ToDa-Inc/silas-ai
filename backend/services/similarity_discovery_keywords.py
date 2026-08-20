"""Resolve reel search keywords for keyword_reel_similarity — client_dna + client_context.niche."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

# Reel keyword search (Sasky) — ~60 results per keyword, capped at 10 keywords (600 Apify rows max).
DEFAULT_MAX_KEYWORDS = 10
_MIN_LEN = 2
_MAX_PHRASE_LEN = 120
# Instagram keyword search works best with short phrases; long sentences match nothing useful.
_MAX_SEARCH_WORDS = 10


def blacklisted_short_codes(client: Dict[str, Any]) -> Set[str]:
    """Instagram short codes excluded from niche discovery."""
    bl = niche_blacklist(client)
    raw = bl.get("short_codes") or []
    if not isinstance(raw, list):
        return set()
    return {str(x).strip() for x in raw if x}


def niche_blacklist(client: Dict[str, Any]) -> Dict[str, Any]:
    """client_context.niche.blacklist — handles, short_codes, keywords."""
    cc = client.get("client_context") or {}
    if not isinstance(cc, dict):
        return {}
    niche = cc.get("niche")
    if not isinstance(niche, dict):
        return {}
    bl = niche.get("blacklist")
    return bl if isinstance(bl, dict) else {}


def niche_settings(client: Dict[str, Any]) -> Dict[str, Any]:
    """client_context.niche.settings — optional per-client knobs."""
    cc = client.get("client_context") or {}
    if not isinstance(cc, dict):
        return {}
    niche = cc.get("niche")
    if not isinstance(niche, dict):
        return {}
    s = niche.get("settings")
    return s if isinstance(s, dict) else {}


def dismissed_short_codes(client: Dict[str, Any]) -> Set[str]:
    """Short codes dismissed from niche feed (skip re-surfacing)."""
    cc = client.get("client_context") or {}
    if not isinstance(cc, dict):
        return set()
    niche = cc.get("niche")
    if not isinstance(niche, dict):
        return set()
    raw = niche.get("dismissed_short_codes") or []
    if not isinstance(raw, list):
        return set()
    return {str(x).strip() for x in raw if x}


def _from_keywords_manual(cc: Any) -> List[str]:
    if not isinstance(cc, dict):
        return []
    niche = cc.get("niche")
    if not isinstance(niche, dict):
        return []
    km = niche.get("keywords_manual")
    if not isinstance(km, list):
        return []
    out: List[str] = []
    for x in km:
        if isinstance(x, dict):
            t = x.get("text")
            if t:
                out.append(str(t).strip())
        elif x:
            out.append(str(x).strip())
    return out


def _from_similarity_keywords(dna: dict) -> List[str]:
    """Native-language pool only. "auto_en" is deliberately excluded here — it's a fallback net
    consumed explicitly via ``similarity_keywords_auto_en`` / payload override during the
    onboarding zero-results retry, not mixed into the precise first-pass search."""
    sim = dna.get("similarity_keywords") or {}
    out: List[str] = []
    if isinstance(sim, dict):
        auto = sim.get("auto")
        if isinstance(auto, list):
            for x in auto:
                if isinstance(x, dict) and x.get("text"):
                    out.append(str(x["text"]).strip())
                elif x:
                    out.append(str(x).strip())
        for key, bucket in sim.items():
            if key in ("auto", "auto_en", "compiled_at"):
                continue
            if isinstance(bucket, list):
                out.extend(str(x).strip() for x in bucket if x)
    elif isinstance(sim, list):
        out.extend(str(x).strip() for x in sim if x)
    return out


def similarity_keywords_auto_en(dna: dict) -> List[str]:
    """English fallback phrases from client_dna.similarity_keywords.auto_en (onboarding retry only)."""
    sim = dna.get("similarity_keywords") or {}
    if not isinstance(sim, dict):
        return []
    auto_en = sim.get("auto_en")
    if not isinstance(auto_en, list):
        return []
    out: List[str] = []
    for x in auto_en:
        if isinstance(x, dict) and x.get("text"):
            out.append(str(x["text"]).strip())
        elif x:
            out.append(str(x).strip())
    return out


def _from_niche_config_topic_keywords(niche_config: Any) -> List[str]:
    """Reel-caption search terms only (Strategy D) — not bio ``keywords`` (Strategy A)."""
    if not isinstance(niche_config, list):
        return []
    out: List[str] = []
    seen: Set[str] = set()
    for n in niche_config:
        if not isinstance(n, dict):
            continue
        for key in ("topic_keywords", "topic_keywords_de"):
            for x in n.get(key) or []:
                s = str(x).strip()
                if not s:
                    continue
                low = s.lower()
                if low in seen:
                    continue
                seen.add(low)
                out.append(s)
    return out


def _from_niche_config_hashtags(niche_config: Any) -> List[str]:
    """Hashtag chips without ``#`` — supplementary after topic_keywords."""
    if not isinstance(niche_config, list):
        return []
    out: List[str] = []
    seen: Set[str] = set()
    for n in niche_config:
        if not isinstance(n, dict):
            continue
        for hkey in ("hashtags", "hashtags_de"):
            for h in n.get(hkey) or []:
                s = str(h).strip().lstrip("#")
                if not s:
                    continue
                low = s.lower()
                if low in seen:
                    continue
                seen.add(low)
                out.append(s)
    return out


def _instagram_search_phrase(s: str, *, max_words: int = _MAX_SEARCH_WORDS) -> Optional[str]:
    """Drop sentence-like lines (too many words, question prompts) unfit for reel keyword search."""
    s = " ".join(str(s).strip().split())
    if len(s) < _MIN_LEN or len(s) > _MAX_PHRASE_LEN:
        return None
    words = s.split()
    if len(words) > max_words:
        return None
    if s.rstrip().endswith("?"):
        return None
    return s


def _filter_blacklist(phrases: List[str], blacklist: Dict[str, Any]) -> List[str]:
    if not blacklist:
        return phrases
    banned_kw = [str(x).lower().strip() for x in (blacklist.get("keywords") or []) if x]
    out: List[str] = []
    for p in phrases:
        pl = p.lower()
        if any(b and b in pl for b in banned_kw):
            continue
        out.append(p)
    return out


def _take_until_cap(
    buckets: List[Tuple[str, List[str]]],
    max_keywords: int,
) -> Tuple[List[str], List[str]]:
    seen: Set[str] = set()
    out: List[str] = []
    used_tiers: List[str] = []
    cap = max(1, max_keywords)

    for tier_name, phrases in buckets:
        if not phrases or len(out) >= cap:
            continue
        added_any = False
        for raw in phrases:
            if len(out) >= cap:
                break
            s = _instagram_search_phrase(str(raw).strip())
            if not s:
                continue
            key = s.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(s)
            added_any = True
        if added_any:
            used_tiers.append(tier_name)

    return out, used_tiers


def similarity_scan_keywords(
    *,
    client: Dict[str, Any],
    payload_keywords: Optional[List[str]] = None,
    max_keywords: int = DEFAULT_MAX_KEYWORDS,
) -> Tuple[List[str], str]:
    """Resolve keywords; applies niche blacklist (keywords substrings). ICP pain/desires excluded — poor search terms."""
    dna = client.get("client_dna") or {}
    if not isinstance(dna, dict):
        dna = {}
    cc = client.get("client_context") or {}
    if not isinstance(cc, dict):
        cc = {}

    bl = niche_blacklist(client)

    # Order = most reel-relevant first. Bio ``dna.keywords`` and long ``content_angles`` are
    # excluded — they target user search / copy, not Sasky reel keyword discovery (Apify cost).
    buckets: List[Tuple[str, List[str]]] = [
        ("payload", [str(k).strip() for k in (payload_keywords or []) if k]),
        ("client_context.niche.keywords_manual", _from_keywords_manual(cc)),
        ("dna.similarity_keywords", _from_similarity_keywords(dna)),
        ("niche_config.topic_keywords", _from_niche_config_topic_keywords(client.get("niche_config"))),
        ("niche_config.hashtags", _from_niche_config_hashtags(client.get("niche_config"))),
    ]

    keywords, used = _take_until_cap(buckets, max_keywords)
    keywords = _filter_blacklist(keywords, bl)
    provenance = "+".join(used) if used else "none"
    return keywords, provenance
