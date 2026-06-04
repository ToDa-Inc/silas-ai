"""Poll background_jobs until terminal state (onboarding pipeline)."""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from supabase import Client


def _terminal(status: str) -> bool:
    return status in ("completed", "failed", "cancelled")


def wait_for_jobs(
    supabase: Client,
    job_ids: List[str],
    *,
    timeout_seconds: int = 900,
    poll_seconds: float = 8.0,
) -> Dict[str, Any]:
    """Block until all jobs finish or timeout. Returns per-job status map."""
    ids = [j for j in job_ids if j]
    if not ids:
        return {"ok": True, "jobs": {}}

    deadline = time.monotonic() + timeout_seconds
    results: Dict[str, str] = {}

    while time.monotonic() < deadline:
        res = (
            supabase.table("background_jobs")
            .select("id, status, error_message")
            .in_("id", ids)
            .execute()
        )
        rows = res.data or []
        pending = False
        for row in rows:
            jid = str(row.get("id") or "")
            st = str(row.get("status") or "unknown")
            results[jid] = st
            if not _terminal(st):
                pending = True
        if not pending and len(results) >= len(ids):
            failed = [j for j, s in results.items() if s == "failed"]
            return {"ok": len(failed) == 0, "jobs": results, "failed": failed}
        time.sleep(poll_seconds)

    return {"ok": False, "jobs": results, "timeout": True}
