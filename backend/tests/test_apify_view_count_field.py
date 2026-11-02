"""View counts from ``apify~instagram-reel-scraper``.

Production runs on 2026-11-02 (own and competitor reels) returned ``videoViewCount: null`` with the
number in ``videoPlayCount`` on every item. Code that only read ``videoViewCount`` / ``playsCount``
stored 0 views for every reel and the own-reels sync discarded the whole batch as "no recent reels".
"""

from __future__ import annotations

from copy import deepcopy
from types import SimpleNamespace
from typing import Any, Dict, List

import pytest

from jobs import baseline_scrape, profile_scrape
from services.apify_reel_fields import view_count_from_item

# Shape and values of three reels from a real production run (public posts).
REAL_ITEMS: List[Dict[str, Any]] = [
    {
        "type": "Video",
        "productType": "clips",
        "shortCode": "DfNPsBRt3ik",
        "url": "https://www.instagram.com/p/DfNPsBRt3ik/",
        "ownerUsername": "connygfrerer",
        "caption": "Warum Menschen Dich ablehnen, obwohl Du nichts falsch machst",
        "timestamp": "2026-11-01T17:15:07.000Z",
        "videoViewCount": None,
        "videoPlayCount": 47748,
        "likesCount": 162,
        "commentsCount": 41,
        "videoDuration": 6.041667,
        "isPinned": False,
    },
    {
        "type": "Video",
        "productType": "clips",
        "shortCode": "DfIGFfNNq2B",
        "url": "https://www.instagram.com/p/DfIGFfNNq2B/",
        "ownerUsername": "connygfrerer",
        "caption": "Respektlose Menschen hoffen oft auf genau eine Reaktion von dir:",
        "timestamp": "2026-10-30T17:15:05.000Z",
        "videoViewCount": None,
        "videoPlayCount": 34001,
        "likesCount": 119,
        "commentsCount": 16,
        "videoDuration": 4.015601,
        "isPinned": False,
    },
    {
        "type": "Video",
        "productType": "clips",
        "shortCode": "DfKUqB_t7yS",
        "url": "https://www.instagram.com/p/DfKUqB_t7yS/",
        "ownerUsername": "connygfrerer",
        "caption": "Wenn jemand zu allen anderen freundlich sein kann, aber bei Dir plötzlich kalt",
        "timestamp": "2026-10-31T14:00:05.000Z",
        "videoViewCount": None,
        "videoPlayCount": 8188,
        "likesCount": 22,
        "commentsCount": 0,
        "videoDuration": 6.9,
        "isPinned": False,
    },
]


# --- helper ------------------------------------------------------------------


@pytest.mark.parametrize(
    "item,expected",
    [
        ({"videoViewCount": None, "videoPlayCount": 47748}, 47748),  # current Apify output
        ({"videoViewCount": 1200}, 1200),  # older output
        ({"videoViewCount": 1200, "videoPlayCount": 5000}, 1200),  # view count wins when present
        ({"videoViewCount": 0, "videoPlayCount": 900}, 900),  # zero is not a real count
        ({"playsCount": 70}, 70),  # other actors
        ({"videoViewCount": "1500"}, 1500),  # mixed types
        ({"videoPlayCount": 12.0}, 12),
        ({}, 0),
        ({"videoViewCount": None, "videoPlayCount": None}, 0),
        ({"videoViewCount": "n/a", "videoPlayCount": -3}, 0),
    ],
)
def test_view_count_from_item(item, expected):
    assert view_count_from_item(item) == expected


def test_competitor_reel_filter_keeps_current_apify_shape():
    kept = profile_scrape._reel_items(deepcopy(REAL_ITEMS))
    assert [i["shortCode"] for i in kept] == ["DfNPsBRt3ik", "DfIGFfNNq2B", "DfKUqB_t7yS"]


# --- own-reels baseline job --------------------------------------------------


class _Query:
    def __init__(self, db: "FakeSupabase", table: str) -> None:
        self._db = db
        self._table = table
        self._op = "select"
        self._payload: Any = None

    def select(self, *_a, **_k):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op, self._payload = "insert", payload
        return self

    def update(self, payload):
        self._op, self._payload = "update", payload
        return self

    def upsert(self, payload, **_k):
        self._op, self._payload = "upsert", payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, *_a):
        return self

    def in_(self, *_a):
        return self

    def limit(self, *_a):
        return self

    def execute(self):
        self._db.ops.append((self._table, self._op, self._payload))
        data = self._db.rows.get(self._table, []) if self._op == "select" else []
        return SimpleNamespace(data=data)


class FakeSupabase:
    def __init__(self, rows: Dict[str, List[Dict[str, Any]]]) -> None:
        self.rows = rows
        self.ops: List[tuple] = []

    def table(self, name: str) -> _Query:
        return _Query(self, name)

    def payloads(self, table: str, op: str) -> List[Any]:
        return [p for t, o, p in self.ops if t == table and o == op]


@pytest.fixture
def run_baseline(monkeypatch):
    def _run(items: List[Dict[str, Any]]) -> FakeSupabase:
        db = FakeSupabase({"clients": [{"instagram_handle": "@connygfrerer", "language": "de"}]})
        monkeypatch.setattr(baseline_scrape, "get_supabase_for_settings", lambda _s: db)
        monkeypatch.setattr(baseline_scrape, "run_actor", lambda *_a, **_k: deepcopy(items))
        monkeypatch.setattr(baseline_scrape, "insert_snapshots_for_scrape_job", lambda *_a, **_k: None)
        monkeypatch.setattr(baseline_scrape, "backfill_competitor_tiers", lambda *_a, **_k: 0)
        monkeypatch.setattr(baseline_scrape, "enqueue_format_digest_recompute", lambda *_a, **_k: None)
        monkeypatch.setattr(baseline_scrape, "enqueue_auto_analyze_scraped", lambda *_a, **_k: None)
        settings = SimpleNamespace(
            apify_api_token="test",
            apify_reel_actor="apify~instagram-reel-scraper",
            own_reels_sync_results_limit=100,
        )
        baseline_scrape.run_baseline_scrape(settings, {"id": "job_1", "client_id": "client_1", "org_id": "org_1"})
        return db

    return _run


def test_baseline_stores_reels_when_apify_returns_play_count_only(run_baseline):
    db = run_baseline(REAL_ITEMS)

    (baseline,) = db.payloads("client_baselines", "insert")
    assert baseline["reels_analyzed"] == 3
    assert baseline["median_views"] == 34001
    assert baseline["avg_views"] == 29979  # round((47748 + 34001 + 8188) / 3)

    (stored,) = db.payloads("scraped_reels", "upsert")
    assert {r["views"] for r in stored} == {47748, 34001, 8188}

    result = db.payloads("background_jobs", "update")[-1]["result"]
    assert "skipped" not in result
    assert result["own_reels_stored"] == 3


def test_baseline_still_works_with_legacy_view_count_field(run_baseline):
    legacy = deepcopy(REAL_ITEMS)
    for item in legacy:
        item["videoViewCount"], item["videoPlayCount"] = item["videoPlayCount"], None

    db = run_baseline(legacy)

    (baseline,) = db.payloads("client_baselines", "insert")
    assert baseline["reels_analyzed"] == 3


def test_baseline_reports_skip_when_no_reel_has_any_view_count(run_baseline):
    empty = deepcopy(REAL_ITEMS)
    for item in empty:
        item["videoViewCount"] = item["videoPlayCount"] = None

    db = run_baseline(empty)

    assert db.payloads("client_baselines", "insert") == []
    result = db.payloads("background_jobs", "update")[-1]["result"]
    assert result["skipped"] == "no_recent_reels"
    assert result["apify_items"] == 3
