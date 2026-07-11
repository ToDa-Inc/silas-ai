import unittest
from datetime import datetime, timedelta, timezone

from services.reel_thumbnail_refresh import (
    is_thumbnail_stale,
    merge_priority_into_refresh_pool,
)


class TestReelThumbnailRefresh(unittest.TestCase):
    def test_stale_when_missing_url_or_old_timestamp(self) -> None:
        now = datetime(2025, 1, 15, 12, 0, tzinfo=timezone.utc)
        fresh = (now - timedelta(hours=5)).isoformat()
        old = (now - timedelta(hours=21)).isoformat()

        self.assertTrue(is_thumbnail_stale({"thumbnail_url": "", "last_updated_at": fresh}, now_utc=now))
        self.assertTrue(is_thumbnail_stale({"thumbnail_url": "https://x", "last_updated_at": None}, now_utc=now))
        self.assertTrue(
            is_thumbnail_stale({"thumbnail_url": "https://x", "last_updated_at": old}, now_utc=now)
        )
        self.assertFalse(
            is_thumbnail_stale({"thumbnail_url": "https://x", "last_updated_at": fresh}, now_utc=now)
        )

    def test_merge_priority_prepends_without_duplicates(self) -> None:
        priority = [{"id": "a"}, {"id": "b"}]
        pool = [{"id": "b"}, {"id": "c"}]
        merged = merge_priority_into_refresh_pool(priority, pool)
        self.assertEqual([r["id"] for r in merged], ["a", "b", "c"])


if __name__ == "__main__":
    unittest.main()
