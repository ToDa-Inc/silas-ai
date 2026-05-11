"""DB-backed account-wide pacing for OpenRouter requests."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from core.config import Settings
from core.database import get_supabase_for_settings

logger = logging.getLogger(__name__)


def _parse_reserved_at(value: object) -> datetime | None:
    if value is None:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def wait_for_openrouter_request_slot(settings: Settings) -> None:
    """Reserve one global OpenRouter request timestamp, then sleep until it is due.

    Set ``OPENROUTER_REQUESTS_PER_MINUTE=0`` to use only the existing process-local
    spacing/backoff in ``services.openrouter``.
    """
    rpm = int(settings.openrouter_requests_per_minute or 0)
    if rpm <= 0:
        return

    url = (settings.supabase_url or "").strip()
    key = (settings.supabase_service_role_key or "").strip()
    if not url or not key:
        logger.warning(
            "OpenRouter global pacer skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set "
            "(set OPENROUTER_REQUESTS_PER_MINUTE=0 to silence if intentional)"
        )
        return

    supabase = get_supabase_for_settings(settings)
    r = supabase.rpc(
        "reserve_openrouter_request",
        {"p_requests_per_minute": rpm},
    ).execute()

    data = r.data
    if isinstance(data, list):
        data = data[0] if data else None
    reserved_at = _parse_reserved_at(data)
    if reserved_at is None:
        return

    wait_s = (reserved_at - datetime.now(timezone.utc)).total_seconds()
    if wait_s > 0:
        time.sleep(wait_s)
