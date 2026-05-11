"""Apify usage-limit classification and DB slot limiter behavior."""

from __future__ import annotations

import unittest
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from core.config import Settings
from services.apify import _apify_error_for_response, run_actor
from services.apify_limiter import ApifySlotWaitTimeout, apify_run_slot


class TestApifyErrorClassification(unittest.TestCase):
    def test_not_enough_usage_maps_to_usage_limit_error(self) -> None:
        body = (
            '{"error":{"type":"not-enough-usage-to-run-paid-actor",'
            '"message":"By launching this job you will exceed your remaining usage"}}'
        )
        err = _apify_error_for_response("apify~instagram-reel-scraper", 402, body)
        from services.apify import ApifyUsageLimitError

        self.assertIsInstance(err, ApifyUsageLimitError)

    def test_402_with_usage_keyword_maps_to_usage_limit_error(self) -> None:
        err = _apify_error_for_response("x", 402, '{"error":"insufficient usage credits"}')
        from services.apify import ApifyUsageLimitError

        self.assertIsInstance(err, ApifyUsageLimitError)

    def test_generic_500_stays_apify_error(self) -> None:
        err = _apify_error_for_response("x", 500, "internal")
        from services.apify import ApifyError, ApifyUsageLimitError

        self.assertIsInstance(err, ApifyError)
        self.assertNotIsInstance(err, ApifyUsageLimitError)


class TestApifyRunSlot(unittest.TestCase):
    def test_max_zero_skips_rpc(self) -> None:
        s = SimpleNamespace(
            apify_max_concurrent_runs=0,
            supabase_url="https://x.supabase.co",
            supabase_service_role_key="k",
        )
        with patch("services.apify_limiter.get_supabase_for_settings") as m:
            with apify_run_slot(s, "actor"):  # type: ignore[arg-type]
                pass
        m.assert_not_called()

    def test_acquire_and_release_on_success(self) -> None:
        s = SimpleNamespace(
            apify_max_concurrent_runs=4,
            apify_slot_ttl_seconds=120,
            apify_slot_wait_timeout_seconds=30.0,
            supabase_url="https://x.supabase.co",
            supabase_service_role_key="secret",
        )
        mock_sb = MagicMock()
        claim_chain = MagicMock()
        claim_chain.execute.return_value = SimpleNamespace(data=2)
        release_chain = MagicMock()
        release_chain.execute.return_value = SimpleNamespace(data=None)

        def rpc_side_effect(name: str, _params: dict) -> MagicMock:
            m = MagicMock()
            if name == "claim_apify_run_slot":
                m.execute = claim_chain.execute
            else:
                m.execute = release_chain.execute
            return m

        mock_sb.rpc.side_effect = rpc_side_effect

        with patch("services.apify_limiter.get_supabase_for_settings", return_value=mock_sb):
            with apify_run_slot(s, "apify~instagram-reel-scraper"):  # type: ignore[arg-type]
                pass

        rpc_names = [c[0][0] for c in mock_sb.rpc.call_args_list]
        self.assertIn("claim_apify_run_slot", rpc_names)
        self.assertIn("release_apify_run_slot", rpc_names)

    def test_wait_timeout_when_no_slot(self) -> None:
        s = SimpleNamespace(
            apify_max_concurrent_runs=2,
            apify_slot_ttl_seconds=120,
            apify_slot_wait_timeout_seconds=0.1,
            supabase_url="https://x.supabase.co",
            supabase_service_role_key="secret",
        )
        mock_sb = MagicMock()
        claim_chain = MagicMock()
        claim_chain.execute.return_value = SimpleNamespace(data=None)

        def rpc_side_effect(_name: str, _params: dict) -> MagicMock:
            m = MagicMock()
            m.execute = claim_chain.execute
            return m

        mock_sb.rpc.side_effect = rpc_side_effect

        with patch("services.apify_limiter.get_supabase_for_settings", return_value=mock_sb):
            with patch("time.monotonic", side_effect=[0.0, 0.0, 0.2]):
                with patch("time.sleep"):
                    with self.assertRaises(ApifySlotWaitTimeout):
                        with apify_run_slot(s, "actor"):  # type: ignore[arg-type]
                            pass


class TestRunActorSlotIntegration(unittest.TestCase):
    @patch("services.apify._poll_run")
    @patch("services.apify.apify_run_slot")
    @patch("services.apify.httpx.Client")
    def test_run_actor_uses_slot_context(
        self,
        mock_client_cls: MagicMock,
        mock_slot: MagicMock,
        _mock_poll: MagicMock,
    ) -> None:
        @contextmanager
        def fake_slot(_settings: Settings, _actor: str):
            yield

        mock_slot.side_effect = fake_slot

        post_resp = MagicMock()
        post_resp.status_code = 200
        post_resp.json.return_value = {
            "data": {"id": "run1", "defaultDatasetId": "ds1"},
        }

        get_run_resp = MagicMock()
        get_run_resp.raise_for_status = MagicMock()
        get_run_resp.json.return_value = {"data": {"status": "SUCCEEDED"}}

        get_items_resp = MagicMock()
        get_items_resp.raise_for_status = MagicMock()
        get_items_resp.json.return_value = [{"url": "https://example.com/reel/x/"}]

        inst = MagicMock()
        inst.__enter__.return_value = inst
        inst.__exit__.return_value = False
        inst.post.return_value = post_resp
        inst.get.side_effect = [get_run_resp, get_items_resp]
        mock_client_cls.return_value = inst

        out = run_actor("tok", "apify~instagram-reel-scraper", {"username": ["u"], "resultsLimit": 1})
        self.assertEqual(len(out), 1)
        mock_slot.assert_called_once()
