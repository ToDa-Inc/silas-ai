"""Orchestrate first-run discovery: DNA → baseline → profile → competitors → similarity → analyze."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from core.config import Settings
from core.database import get_supabase_for_settings
from core.id_generator import generate_job_id
from services.client_dna_compile import force_recompile_client_dna_sync
from services.format_digest_jobs import enqueue_auto_analyze_scraped, enqueue_format_digest_recompute
from services.job_queue import fail_abandoned_queued_jobs, has_active_job
from services.onboarding_job_wait import wait_for_jobs
from services.onboarding_state import update_onboarding_state
from services.scrape_cycle import (
    enqueue_keyword_reel_similarity_for_client,
    enqueue_sync_all_jobs_for_client,
)

logger = logging.getLogger(__name__)


def _enqueue(
    supabase,
    *,
    org_id: str,
    client_id: str,
    job_type: str,
    payload: Optional[Dict[str, Any]] = None,
    priority: int = 10,
) -> str:
    jid = generate_job_id()
    row: Dict[str, Any] = {
        "id": jid,
        "org_id": org_id,
        "client_id": client_id,
        "job_type": job_type,
        "payload": payload or {},
        "status": "queued",
        "priority": priority,
    }
    supabase.table("background_jobs").insert(row).execute()
    return jid


def _progress(supabase, client_id: str, phase: str, **extra: Any) -> None:
    update_onboarding_state(
        supabase,
        client_id,
        pipeline_progress={"phase": phase, "at": datetime.now(timezone.utc).isoformat(), **extra},
    )


def run_onboarding_pipeline(settings: Settings, job: Dict[str, Any]) -> None:
    supabase = get_supabase_for_settings(settings)
    job_id = job["id"]
    client_id = job.get("client_id")
    if not client_id:
        raise RuntimeError("onboarding_pipeline missing client_id")

    crow = supabase.table("clients").select("*").eq("id", client_id).limit(1).execute()
    if not crow.data:
        raise RuntimeError("Client not found")
    client = crow.data[0]
    org_id = str(client.get("org_id") or "")
    ig = (client.get("instagram_handle") or "").replace("@", "").strip()

    job_ids: Dict[str, str] = {}
    errors: List[str] = []

    try:
        _progress(supabase, client_id, "dna_compile")
        force_recompile_client_dna_sync(settings, supabase, client_id)

        if ig:
            _progress(supabase, client_id, "baseline_scrape")
            fail_abandoned_queued_jobs(supabase, client_id=client_id, job_type="baseline_scrape")
            if not has_active_job(supabase, client_id=client_id, job_type="baseline_scrape"):
                job_ids["baseline"] = _enqueue(
                    supabase,
                    org_id=org_id,
                    client_id=client_id,
                    job_type="baseline_scrape",
                    payload={},
                )
                wait = wait_for_jobs(supabase, [job_ids["baseline"]], timeout_seconds=600)
                if not wait.get("ok"):
                    errors.append("baseline_scrape did not complete in time")

            _progress(supabase, client_id, "auto_profile")
            fail_abandoned_queued_jobs(supabase, client_id=client_id, job_type="client_auto_profile")
            if not has_active_job(supabase, client_id=client_id, job_type="client_auto_profile"):
                job_ids["auto_profile"] = _enqueue(
                    supabase,
                    org_id=org_id,
                    client_id=client_id,
                    job_type="client_auto_profile",
                    payload={"merge_with_existing": True},
                )
                wait = wait_for_jobs(supabase, [job_ids["auto_profile"]], timeout_seconds=600)
                if not wait.get("ok"):
                    errors.append("client_auto_profile did not complete in time")

        _progress(supabase, client_id, "competitor_discovery")
        fail_abandoned_queued_jobs(supabase, client_id=client_id, job_type="competitor_discovery")
        if not has_active_job(supabase, client_id=client_id, job_type="competitor_discovery"):
            job_ids["competitor_discovery"] = _enqueue(
                supabase,
                org_id=org_id,
                client_id=client_id,
                job_type="competitor_discovery",
                payload={},
            )
            wait = wait_for_jobs(supabase, [job_ids["competitor_discovery"]], timeout_seconds=900)
            if not wait.get("ok"):
                errors.append("competitor_discovery did not complete in time")

        _progress(supabase, client_id, "profile_scrapes")
        sync_stats = enqueue_sync_all_jobs_for_client(
            supabase, org_id=org_id, client_id=client_id
        )
        kw_stats = enqueue_keyword_reel_similarity_for_client(
            supabase, org_id=org_id, client_id=client_id
        )
        kw_job = kw_stats.get("job_id") if isinstance(kw_stats, dict) else None
        if isinstance(kw_job, str) and kw_job:
            job_ids["keyword_similarity"] = kw_job
            wait = wait_for_jobs(supabase, [kw_job], timeout_seconds=900)
            if not wait.get("ok"):
                errors.append("keyword_reel_similarity did not complete in time")

        _progress(supabase, client_id, "auto_analyze")
        enqueue_auto_analyze_scraped(
            supabase, org_id=org_id, client_id=client_id, batch_limit=40
        )
        if has_active_job(supabase, client_id=client_id, job_type="auto_analyze_scraped"):
            res = (
                supabase.table("background_jobs")
                .select("id")
                .eq("client_id", client_id)
                .eq("job_type", "auto_analyze_scraped")
                .in_("status", ["queued", "running"])
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if res.data:
                aa_id = str(res.data[0]["id"])
                job_ids["auto_analyze"] = aa_id
                wait = wait_for_jobs(supabase, [aa_id], timeout_seconds=600)

        enqueue_format_digest_recompute(supabase, org_id=org_id, client_id=client_id)

        update_onboarding_state(
            supabase,
            client_id,
            pipeline_progress={
                "phase": "complete",
                "at": datetime.now(timezone.utc).isoformat(),
                "sync_stats": sync_stats,
                "kw_stats": kw_stats,
                "errors": errors,
            },
            job_ids_patch=job_ids,
            complete_step="pipeline",
            current_step="reel_review",
            last_error="; ".join(errors) if errors else None,
        )

        supabase.table("background_jobs").update(
            {
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "result": {
                    "pipeline": "onboarding_pipeline",
                    "job_ids": job_ids,
                    "errors": errors,
                },
            }
        ).eq("id", job_id).execute()
    except Exception as e:
        logger.exception("onboarding_pipeline failed for %s", client_id)
        update_onboarding_state(
            supabase,
            client_id,
            pipeline_progress={"phase": "failed", "error": str(e)},
            last_error=str(e)[:2000],
        )
        supabase.table("background_jobs").update(
            {
                "status": "failed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error_message": str(e)[:8000],
            }
        ).eq("id", job_id).execute()
        raise
