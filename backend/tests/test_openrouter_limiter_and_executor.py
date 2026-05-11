from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from services.openrouter_limiter import wait_for_openrouter_request_slot
from services.similarity_scoring_executor import score_items_bounded, similarity_scoring_workers


class TestOpenRouterLimiter(unittest.TestCase):
    def test_rpm_zero_skips_rpc(self) -> None:
        settings = SimpleNamespace(
            openrouter_requests_per_minute=0,
            supabase_url="https://x.supabase.co",
            supabase_service_role_key="k",
        )
        with patch("services.openrouter_limiter.get_supabase_for_settings") as m:
            wait_for_openrouter_request_slot(settings)  # type: ignore[arg-type]
        m.assert_not_called()

    def test_reserves_and_sleeps_until_timestamp(self) -> None:
        reserved = datetime.now(timezone.utc) + timedelta(seconds=2)
        settings = SimpleNamespace(
            openrouter_requests_per_minute=15,
            supabase_url="https://x.supabase.co",
            supabase_service_role_key="k",
        )
        mock_sb = MagicMock()
        rpc_chain = MagicMock()
        rpc_chain.execute.return_value = SimpleNamespace(data=reserved.isoformat())
        mock_sb.rpc.return_value = rpc_chain

        with patch("services.openrouter_limiter.get_supabase_for_settings", return_value=mock_sb):
            with patch("time.sleep") as sleep:
                wait_for_openrouter_request_slot(settings)  # type: ignore[arg-type]

        mock_sb.rpc.assert_called_once_with(
            "reserve_openrouter_request",
            {"p_requests_per_minute": 15},
        )
        self.assertGreater(sleep.call_args[0][0], 0)


class TestSimilarityScoringExecutor(unittest.TestCase):
    def test_worker_count_is_bounded(self) -> None:
        settings = SimpleNamespace(openrouter_scoring_workers=4)
        self.assertEqual(similarity_scoring_workers(settings, 0), 1)  # type: ignore[arg-type]
        self.assertEqual(similarity_scoring_workers(settings, 2), 2)  # type: ignore[arg-type]
        self.assertEqual(similarity_scoring_workers(settings, 10), 4)  # type: ignore[arg-type]

    def test_preserves_input_order(self) -> None:
        settings = SimpleNamespace(openrouter_scoring_workers=3)
        rows, meta = score_items_bounded(
            settings,  # type: ignore[arg-type]
            [3, 1, 2],
            lambda x: {"value": x},
        )
        self.assertEqual([r["value"] for r in rows], [3, 1, 2])
        self.assertEqual(meta["scoring_workers"], 3)
        self.assertIn("scoring_elapsed_s", meta)


if __name__ == "__main__":
    unittest.main()
