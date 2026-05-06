import unittest
from datetime import datetime, timedelta, timezone

from jobs.scraped_reels_refresh import select_refresh_candidates


class TestScrapedReelsRefreshPolicy(unittest.TestCase):
    def test_skips_recently_updated_then_fills_batch(self) -> None:
        now = datetime(2025, 1, 15, 12, 0, tzinfo=timezone.utc)
        fresh = (now - timedelta(hours=5)).isoformat()
        old = (now - timedelta(hours=30)).isoformat()

        pool = [
            {"id": "1", "last_updated_at": fresh},
            {"id": "2", "last_updated_at": fresh},
            {"id": "3", "last_updated_at": old},
            {"id": "4", "last_updated_at": None},
            {"id": "5", "last_updated_at": old},
        ]

        selected, skipped = select_refresh_candidates(
            pool,
            now_utc=now,
            batch_limit=2,
            skip_recently_updated_hours=20,
        )
        self.assertEqual(skipped, 2)
        self.assertEqual([r["id"] for r in selected], ["3", "4"])

    def test_thirty_day_window_enforced_by_query_not_here(self) -> None:
        """Age cutoff is applied in SQL; selector only enforces recent-update skip."""
        now = datetime(2025, 1, 15, 12, 0, tzinfo=timezone.utc)
        old = (now - timedelta(hours=25)).isoformat()
        pool = [{"id": "a", "last_updated_at": old}]
        selected, skipped = select_refresh_candidates(
            pool,
            now_utc=now,
            batch_limit=10,
            skip_recently_updated_hours=20,
        )
        self.assertEqual(skipped, 0)
        self.assertEqual(len(selected), 1)


if __name__ == "__main__":
    unittest.main()
