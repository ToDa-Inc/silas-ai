"""Bounded helper for concurrent similarity scoring."""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Dict, Iterable, List, TypeVar

from core.config import Settings

T = TypeVar("T")


def similarity_scoring_workers(settings: Settings, item_count: int) -> int:
    if item_count <= 1:
        return 1
    return max(1, min(int(settings.openrouter_scoring_workers or 1), item_count))


def score_items_bounded(
    settings: Settings,
    items: Iterable[T],
    scorer: Callable[[T], Dict],
) -> tuple[List[Dict], Dict[str, float | int]]:
    """Score items concurrently while preserving input order in the returned rows."""
    seq = list(items)
    workers = similarity_scoring_workers(settings, len(seq))
    started = time.monotonic()
    if not seq:
        return [], {"scoring_workers": workers, "scoring_elapsed_s": 0.0, "avg_score_seconds": 0.0}

    results: list[Dict | None] = [None] * len(seq)
    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_by_idx = {executor.submit(scorer, item): idx for idx, item in enumerate(seq)}
        for future in as_completed(future_by_idx):
            idx = future_by_idx[future]
            results[idx] = future.result()

    elapsed = time.monotonic() - started
    return [r for r in results if r is not None], {
        "scoring_workers": workers,
        "scoring_elapsed_s": round(elapsed, 2),
        "avg_score_seconds": round(elapsed / max(len(seq), 1), 3),
    }
