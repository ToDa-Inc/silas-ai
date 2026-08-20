"""onboarding_ig_prefill job — quick IG read to draft quiz/source answers before
the user reaches those steps, so onboarding feels pre-filled instead of blank."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from core.config import Settings
from core.database import get_supabase_for_settings
from services.apify import instagram_reel_scraper_input, run_actor
from services.instagram_account_lookup import fetch_instagram_user_by_username
from services.onboarding_ig_prefill import draft_onboarding_prefill_from_instagram
from services.onboarding_state import update_onboarding_state

logger = logging.getLogger(__name__)

CAPTIONS_TO_FETCH = 15
CAPTIONS_TO_USE = 20


def _captions_from_apify_items(items: List[dict], cap: int = CAPTIONS_TO_USE) -> List[str]:
    out: List[str] = []
    for item in items:
        if item.get("type") not in ("Video", "GraphVideo"):
            continue
        c = item.get("caption")
        if isinstance(c, dict):
            t = str(c.get("text") or "").strip()
        elif isinstance(c, str):
            t = c.strip()
        else:
            t = ""
        if t:
            out.append(t[:400])
        if len(out) >= cap:
            break
    return out


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_onboarding_ig_prefill(settings: Settings, job: Dict[str, Any]) -> None:
    supabase = get_supabase_for_settings(settings)
    job_id = job["id"]
    client_id = job.get("client_id")
    if not client_id:
        raise RuntimeError("onboarding_ig_prefill job missing client_id")

    crow = supabase.table("clients").select("*").eq("id", client_id).limit(1).execute()
    if not crow.data:
        raise RuntimeError("Client not found")
    client = crow.data[0]
    ig = (client.get("instagram_handle") or "").replace("@", "").strip()

    def _complete(result: Dict[str, Any]) -> None:
        supabase.table("background_jobs").update(
            {
                "status": "completed",
                "completed_at": _now(),
                "result": {"pipeline": "onboarding_ig_prefill", **result},
            }
        ).eq("id", job_id).execute()

    if not ig or not settings.apify_api_token or not settings.openrouter_api_key:
        update_onboarding_state(
            supabase,
            client_id,
            ig_prefill_patch={"status": "skipped", "at": _now()},
        )
        _complete({"skipped": True})
        return

    try:
        snap = fetch_instagram_user_by_username(
            settings.apify_api_token,
            ig,
            exclude_username="",
            reel_actor=settings.apify_reel_actor,
            include_shares_count=settings.apify_include_shares_count,
        )
        bio = (snap.get("bio") if snap else "") or ""

        items = run_actor(
            settings.apify_api_token,
            settings.apify_reel_actor,
            instagram_reel_scraper_input(
                [ig],
                CAPTIONS_TO_FETCH,
                include_shares_count=settings.apify_include_shares_count,
            ),
        )
        captions = _captions_from_apify_items(items or [])

        if not bio and len(captions) < 2:
            update_onboarding_state(
                supabase,
                client_id,
                ig_prefill_patch={"status": "skipped", "at": _now(), "reason": "no_signal"},
            )
            _complete({"skipped": True, "reason": "no_signal"})
            return

        draft = draft_onboarding_prefill_from_instagram(
            openrouter_key=settings.openrouter_api_key,
            model=settings.openrouter_model,
            name=str(client.get("name") or ""),
            ig=ig,
            language=str(client.get("language") or "de"),
            bio=bio,
            captions=captions,
        )
        update_onboarding_state(
            supabase,
            client_id,
            ig_prefill_patch={"status": "ready", "data": draft, "at": _now()},
        )
        _complete({"captions_used": len(captions), "had_bio": bool(bio)})
    except Exception as e:
        logger.exception("onboarding_ig_prefill failed for %s", client_id)
        try:
            update_onboarding_state(
                supabase,
                client_id,
                ig_prefill_patch={"status": "failed", "error": str(e)[:500], "at": _now()},
            )
        except Exception:
            # Best-effort only — e.g. the ig_prefill column migration hasn't
            # been applied yet. Don't let that mask the original failure.
            logger.exception("onboarding_ig_prefill: also failed to record failure state")
        supabase.table("background_jobs").update(
            {
                "status": "failed",
                "completed_at": _now(),
                "error_message": str(e)[:8000],
            }
        ).eq("id", job_id).execute()
