"""Merge auto-profile LLM output with quiz / context-owned client fields."""

from __future__ import annotations

from typing import Any, Dict, List


def _is_quiz_owned_icp(icp: Any) -> bool:
    if not isinstance(icp, dict):
        return False
    return icp.get("source") in ("onboarding_quiz", "onboarding")


def merge_auto_profile_into_client(
    *,
    existing_niche_config: Any,
    existing_icp: Any,
    existing_products: Any,
    inferred_niches: List[Dict[str, Any]],
    inferred_icp: Dict[str, Any],
    inferred_seeds: List[str],
    inferred_lang: str,
    content_style: Any = None,
    confidence: Any = None,
    job_id: str = "",
) -> Dict[str, Any]:
    """Return patch dict for clients table — never wipe quiz-owned icp wholesale."""
    products = dict(existing_products) if isinstance(existing_products, dict) else {}
    quiz_owned = _is_quiz_owned_icp(existing_icp)

    existing_seeds = products.get("competitor_seeds")
    if not isinstance(existing_seeds, list):
        existing_seeds = []
    merged_seeds = list(dict.fromkeys([str(s).strip().lstrip("@") for s in existing_seeds if str(s).strip()]))
    for s in inferred_seeds:
        t = str(s).strip().lstrip("@")
        if t and t not in merged_seeds:
            merged_seeds.append(t)
    products["competitor_seeds"] = merged_seeds[:20]
    products["auto_profile"] = {
        "content_style": content_style,
        "confidence": confidence,
        "job_id": job_id,
        "merged_with_quiz": quiz_owned,
    }

    niche_config = existing_niche_config
    if not quiz_owned or not isinstance(existing_niche_config, list) or len(existing_niche_config) < 1:
        niche_config = inferred_niches

    icp: Dict[str, Any]
    if quiz_owned and isinstance(existing_icp, dict):
        icp = dict(existing_icp)
        for key in ("pain_points", "desires", "age_range"):
            inf_val = inferred_icp.get(key)
            if key not in icp or not icp.get(key):
                if inf_val:
                    icp[key] = inf_val
        if not icp.get("target") and inferred_icp.get("target"):
            icp["target"] = inferred_icp["target"]
    else:
        icp = dict(inferred_icp) if isinstance(inferred_icp, dict) else {}
        if quiz_owned and isinstance(existing_icp, dict) and existing_icp.get("summary"):
            icp["summary"] = existing_icp["summary"]
            icp["source"] = existing_icp.get("source") or "onboarding_quiz"

    return {
        "niche_config": niche_config,
        "icp": icp,
        "products": products,
        "language": inferred_lang,
    }
