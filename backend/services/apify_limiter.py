"""DB-backed global limiter for concurrent Apify actor runs (cross-process)."""

from __future__ import annotations

import logging
import time
import uuid
from contextlib import contextmanager
from typing import Iterator, Optional

from core.config import Settings
from core.database import get_supabase_for_settings

logger = logging.getLogger(__name__)


class ApifySlotWaitTimeout(RuntimeError):
    """No free Apify concurrency slot before wait timeout."""


def _rpc_claim(
    settings: Settings,
    *,
    holder_id: str,
    actor_id: str,
) -> Optional[int]:
    supabase = get_supabase_for_settings(settings)
    r = supabase.rpc(
        "claim_apify_run_slot",
        {
            "p_max_slots": settings.apify_max_concurrent_runs,
            "p_holder_id": holder_id,
            "p_actor_id": actor_id,
            "p_stale_after_seconds": settings.apify_slot_ttl_seconds,
        },
    ).execute()
    data = r.data
    if data is None:
        return None
    if isinstance(data, list):
        if len(data) == 0:
            return None
        data = data[0]
    try:
        return int(data) if data is not None else None
    except (TypeError, ValueError):
        return None


def _rpc_release(settings: Settings, holder_id: str) -> None:
    supabase = get_supabase_for_settings(settings)
    supabase.rpc("release_apify_run_slot", {"p_holder_id": holder_id}).execute()


@contextmanager
def apify_run_slot(settings: Settings, actor_id: str) -> Iterator[None]:
    """Acquire one global Apify slot for the duration of a full run_actor lifecycle.

    When ``apify_max_concurrent_runs`` is 0, this is a no-op.
    When Supabase is not configured, logs a warning and skips limiting (dev-only).
    """
    if settings.apify_max_concurrent_runs <= 0:
        yield
        return

    url = (settings.supabase_url or "").strip()
    key = (settings.supabase_service_role_key or "").strip()
    if not url or not key:
        logger.warning(
            "Apify slot limiter skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set "
            "(set APIFY_MAX_CONCURRENT_RUNS=0 to silence if intentional)"
        )
        yield
        return

    holder_id = uuid.uuid4().hex
    deadline = time.monotonic() + float(settings.apify_slot_wait_timeout_seconds)
    slot: Optional[int] = None
    waited = 0.0
    poll_s = 1.5

    while time.monotonic() < deadline:
        try:
            slot = _rpc_claim(settings, holder_id=holder_id, actor_id=actor_id)
        except Exception:
            logger.exception(
                "claim_apify_run_slot RPC failed — apply backend/sql/phase21_apify_run_slots.sql"
            )
            raise
        if slot is not None:
            logger.debug(
                "Apify slot acquired slot=%s actor=%s holder=%s waited_s=%.1f",
                slot,
                actor_id,
                holder_id[:12],
                waited,
            )
            break
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        time.sleep(min(poll_s, remaining))
        waited += min(poll_s, remaining)

    if slot is None:
        raise ApifySlotWaitTimeout(
            f"No free Apify concurrency slot within {settings.apify_slot_wait_timeout_seconds}s "
            f"(max_slots={settings.apify_max_concurrent_runs}, actor={actor_id}). "
            "Apply phase21_apify_run_slots.sql if RPC is missing."
        )

    try:
        yield
    finally:
        try:
            _rpc_release(settings, holder_id)
        except Exception:
            logger.exception(
                "release_apify_run_slot failed holder=%s — slot may leak until TTL",
                holder_id[:12],
            )
