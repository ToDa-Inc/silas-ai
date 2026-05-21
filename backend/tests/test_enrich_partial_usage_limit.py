"""enrich_reel_urls_direct keeps partial items when Apify usage limit hits mid-run."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from services.apify import ApifyUsageLimitError, enrich_reel_urls_direct


class TestEnrichPartialUsageLimit(unittest.TestCase):
    @patch("services.apify.run_actor")
    @patch("services.apify.time.sleep", return_value=None)
    def test_returns_items_from_prior_batches(self, _sleep, mock_run) -> None:
        batch_ok = [{"shortCode": "A", "url": "https://www.instagram.com/reel/A/"}]
        mock_run.side_effect = [batch_ok, ApifyUsageLimitError("limit exceeded")]

        urls = [f"https://www.instagram.com/reel/{i}/" for i in range(25)]
        items, errors, hit = enrich_reel_urls_direct("token", urls)

        self.assertTrue(hit)
        self.assertEqual(len(items), 1)
        self.assertTrue(any("apify_usage_limit" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
