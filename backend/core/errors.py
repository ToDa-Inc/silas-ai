"""Shared exception types for background job handlers."""

from __future__ import annotations


class MissingCredentialsError(RuntimeError):
    """Raised by a job handler when required API credentials are absent from *this* worker's env.

    Distinct from a hard failure: another worker process sharing the same background_jobs
    queue (e.g. a teammate's local dev worker) may have the missing credential configured.
    worker.py catches this specifically and requeues the job instead of marking it permanently
    failed, so a capable worker gets a chance to pick it up on its next poll.
    """
