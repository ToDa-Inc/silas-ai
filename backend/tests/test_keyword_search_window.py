"""Onboarding month window must not collapse to the daily 2-day recency cutoff."""

from __future__ import annotations

import unittest
from pathlib import Path

from services.keyword_search_window import (
    DEFAULT_MIN_VIEWS_PER_DAY,
    ONBOARDING_DAYS,
    ONBOARDING_MIN_VIEWS_PER_DAY,
    ONBOARDING_SEARCH_WINDOW,
    onboarding_keyword_similarity_payload,
    payload_includes_google_cse,
    resolve_min_views_per_day,
    resolve_search_window_and_days,
)

_ONBOARDING_PIPELINE = (
    Path(__file__).resolve().parents[1] / "jobs" / "onboarding_pipeline.py"
)


class TestResolveSearchWindowAndDays(unittest.TestCase):
    def test_defaults_to_daily_two_day_window(self) -> None:
        window, days = resolve_search_window_and_days()
        self.assertEqual(window, "last-2-days")
        self.assertEqual(days, 2)

    def test_payload_month_window_wins_over_niche_recency_days(self) -> None:
        window, days = resolve_search_window_and_days(
            niche_settings={"search_window": "last-2-days", "recency_days": 2},
            payload={"search_window": "last-1-month", "days": 30},
        )
        self.assertEqual(window, "last-1-month")
        self.assertEqual(days, 30)

    def test_payload_window_without_days_maps_month_to_30(self) -> None:
        window, days = resolve_search_window_and_days(
            niche_settings={"recency_days": 2},
            payload={"search_window": "last-1-month"},
        )
        self.assertEqual(window, "last-1-month")
        self.assertEqual(days, 30)

    def test_niche_recency_used_when_payload_has_no_window(self) -> None:
        window, days = resolve_search_window_and_days(
            niche_settings={"search_window": "last-1-week", "recency_days": 7},
            payload={},
        )
        self.assertEqual(window, "last-1-week")
        self.assertEqual(days, 7)


class TestOnboardingKeywordPayload(unittest.TestCase):
    def test_onboarding_payload_is_month_window_and_splits_keywords(self) -> None:
        payload = onboarding_keyword_similarity_payload()
        self.assertEqual(payload["search_window"], ONBOARDING_SEARCH_WINDOW)
        self.assertEqual(payload["days"], ONBOARDING_DAYS)
        self.assertTrue(payload["split_by_keyword"])
        self.assertEqual(payload["source"], "onboarding")
        self.assertEqual(payload["url_sources"], ["sasky", "google_cse"])
        self.assertEqual(payload["min_views_per_day"], ONBOARDING_MIN_VIEWS_PER_DAY)
        self.assertTrue(payload_includes_google_cse(payload))

    def test_onboarding_pipeline_enqueues_month_window_payload(self) -> None:
        src = _ONBOARDING_PIPELINE.read_text(encoding="utf-8")
        self.assertIn("from services.keyword_search_window import onboarding_keyword_similarity_payload", src)
        self.assertIn("payload=onboarding_keyword_similarity_payload()", src)
        self.assertIn("enqueue_keyword_reel_similarity_for_client", src)


class TestResolveMinViewsPerDay(unittest.TestCase):
    def test_defaults_to_daily_floor(self) -> None:
        self.assertEqual(resolve_min_views_per_day(), DEFAULT_MIN_VIEWS_PER_DAY)

    def test_payload_beats_niche_floor(self) -> None:
        v = resolve_min_views_per_day(
            niche_settings={"min_views_per_day": 2000},
            payload={"min_views_per_day": 500},
        )
        self.assertEqual(v, 500.0)

    def test_niche_used_when_payload_omits_floor(self) -> None:
        v = resolve_min_views_per_day(
            niche_settings={"min_views_per_day": 1500},
            payload={},
        )
        self.assertEqual(v, 1500.0)


class TestDailyTickDoesNotRequestGoogleCse(unittest.TestCase):
    def test_daily_tick_payload_has_no_google_cse(self) -> None:
        src = (
            Path(__file__).resolve().parents[1] / "jobs" / "daily_intelligence_tick.py"
        ).read_text(encoding="utf-8")
        self.assertNotIn("url_sources", src)
        self.assertNotIn("google_cse", src)
        self.assertFalse(
            payload_includes_google_cse({"search_window": "last-2-days", "days": 3})
        )


if __name__ == "__main__":
    unittest.main()
