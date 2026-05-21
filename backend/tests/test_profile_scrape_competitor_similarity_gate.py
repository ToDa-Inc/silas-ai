"""Tests for competitor profile_scrape similarity gate (pre-upsert)."""

import unittest
from types import SimpleNamespace
from typing import List, Optional
from unittest.mock import MagicMock, patch

from core.config import Settings
from jobs.profile_scrape import run_profile_scrape
from services.profile_similarity_gate import (
    index_enriched_items_by_lookup_url,
    lookup_enriched_for_url,
)


def _settings() -> Settings:
    s = MagicMock(spec=Settings)
    s.apify_api_token = "apify-token"
    s.apify_reel_actor = "apify~instagram-reel-scraper"
    s.apify_include_shares_count = False
    s.openrouter_api_key = "or-key"
    s.openrouter_reel_analyze_model = "google/gemini-3-flash-preview"
    return s


def _make_supabase_competitor(
    *,
    analysis_brief: str = "Client niche brief for tests.",
    scraped_existing: Optional[List[dict]] = None,
) -> MagicMock:
    scraped_existing = scraped_existing or []
    comp_table = MagicMock()
    comp_select = MagicMock()
    comp_select.execute.return_value = SimpleNamespace(
        data=[
            {
                "id": "cmp1",
                "username": "compuser",
                "avg_views": 500,
                "avg_likes": 20,
                "avg_comments": 2,
                "client_id": "cli1",
            }
        ]
    )
    comp_table.select.return_value.eq.return_value.eq.return_value.limit.return_value = (
        comp_select
    )
    comp_table.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )

    clients_table = MagicMock()
    clients_select = MagicMock()
    clients_select.execute.return_value = SimpleNamespace(
        data=[
            {
                "outlier_ratio_threshold": 5.0,
                "client_dna": {"analysis_brief": analysis_brief},
            }
        ]
    )
    clients_table.select.return_value.eq.return_value.limit.return_value = clients_select

    sr_table = MagicMock()
    sr_sel = MagicMock()
    sr_sel.execute.return_value = SimpleNamespace(data=scraped_existing)
    sr_table.select.return_value.eq.return_value.eq.return_value = sr_sel
    sr_table.upsert.return_value.execute.return_value = SimpleNamespace(data=[])

    bj_table = MagicMock()
    bj_table.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])

    sb = MagicMock()

    def table_side(name: str):
        if name == "competitors":
            return comp_table
        if name == "clients":
            return clients_table
        if name == "scraped_reels":
            return sr_table
        if name == "background_jobs":
            return bj_table
        return MagicMock()

    sb.table.side_effect = table_side
    sb._sr_table = sr_table  # type: ignore[attr-defined]
    sb._bj_table = bj_table  # type: ignore[attr-defined]
    return sb


class TestProfileSimilarityGateHelpers(unittest.TestCase):
    def test_index_and_lookup_roundtrip(self) -> None:
        item = {
            "type": "Video",
            "shortCode": "XYZ99",
            "url": "https://www.instagram.com/reel/XYZ99/",
            "videoViewCount": 100,
            "likesCount": 5,
            "commentsCount": 1,
            "caption": {"text": "c"},
            "videoUrl": "https://video.example/x.mp4",
        }
        idx = index_enriched_items_by_lookup_url([item])
        hit = lookup_enriched_for_url(idx, "https://www.instagram.com/reel/XYZ99/")
        self.assertIsNotNone(hit)
        self.assertEqual(hit.get("shortCode"), "XYZ99")


class TestProfileScrapeCompetitorGate(unittest.TestCase):
    @patch("jobs.profile_scrape.time.sleep", return_value=None)
    @patch("jobs.profile_scrape.enqueue_auto_analyze_scraped")
    @patch("jobs.profile_scrape.enqueue_format_digest_recompute")
    @patch("jobs.profile_scrape.update_milestones_for_competitor")
    @patch("jobs.profile_scrape.insert_snapshots_for_scrape_job")
    @patch("jobs.profile_scrape.score_reel_dict_for_keyword_similarity")
    @patch("jobs.profile_scrape.enrich_reel_urls_direct")
    @patch("jobs.profile_scrape.run_actor")
    @patch("jobs.profile_scrape.get_supabase_for_settings")
    def test_accepts_high_score_and_sets_similarity_on_row(
        self,
        mock_get_sb,
        mock_run_actor,
        mock_enrich,
        mock_score,
        _snap,
        _mile,
        _fd,
        _aa,
        _sleep,
    ) -> None:
        sb = _make_supabase_competitor()
        mock_get_sb.return_value = sb

        reel_item = {
            "type": "Video",
            "url": "https://www.instagram.com/reel/ABC123/",
            "shortCode": "ABC123",
            "videoViewCount": 10_000,
            "likesCount": 100,
            "commentsCount": 10,
            "caption": {"text": "caption"},
        }
        mock_run_actor.side_effect = [[reel_item], []]
        enriched = {
            "type": "Video",
            "shortCode": "ABC123",
            "url": "https://www.instagram.com/reel/ABC123/",
            "videoViewCount": 10_000,
            "likesCount": 100,
            "commentsCount": 10,
            "caption": {"text": "caption"},
            "videoUrl": "https://cdn.example/v.mp4",
        }
        mock_enrich.return_value = ([enriched], [], False)
        mock_score.return_value = {
            "similarity_score": 90,
            "verdict": "match",
            "why_it_doesnt_fit": "",
        }

        job = {
            "id": "job_test1",
            "client_id": "cli1",
            "org_id": "org1",
            "payload": {"competitor_id": "cmp1", "results_limit": 30},
        }
        run_profile_scrape(_settings(), job)

        sr = sb._sr_table  # type: ignore[attr-defined]
        self.assertTrue(sr.upsert.called)
        upsert_arg = sr.upsert.call_args[0][0]
        self.assertEqual(len(upsert_arg), 1)
        self.assertEqual(upsert_arg[0].get("similarity_score"), 90)
        self.assertEqual(upsert_arg[0].get("source"), "profile")

        bj = sb._bj_table  # type: ignore[attr-defined]
        res = bj.update.call_args[0][0].get("result") or {}
        self.assertEqual(res.get("reels_seen"), 1)
        self.assertEqual(res.get("reels_processed"), 1)
        self.assertEqual(res.get("reels_rejected_similarity"), 0)

    @patch("jobs.profile_scrape.time.sleep", return_value=None)
    @patch("jobs.profile_scrape.enqueue_auto_analyze_scraped")
    @patch("jobs.profile_scrape.enqueue_format_digest_recompute")
    @patch("jobs.profile_scrape.update_milestones_for_competitor")
    @patch("jobs.profile_scrape.insert_snapshots_for_scrape_job")
    @patch("jobs.profile_scrape.score_reel_dict_for_keyword_similarity")
    @patch("jobs.profile_scrape.enrich_reel_urls_direct")
    @patch("jobs.profile_scrape.run_actor")
    @patch("jobs.profile_scrape.get_supabase_for_settings")
    def test_rejects_low_score_not_upserted(
        self,
        mock_get_sb,
        mock_run_actor,
        mock_enrich,
        mock_score,
        _snap,
        _mile,
        _fd,
        _aa,
        _sleep,
    ) -> None:
        sb = _make_supabase_competitor()
        mock_get_sb.return_value = sb

        reel_item = {
            "type": "Video",
            "url": "https://www.instagram.com/reel/LOW1/",
            "shortCode": "LOW1",
            "videoViewCount": 5000,
            "likesCount": 50,
            "commentsCount": 5,
            "caption": {"text": "x"},
        }
        mock_run_actor.side_effect = [[reel_item], []]
        mock_enrich.return_value = (
            [
                {
                    "type": "Video",
                    "shortCode": "LOW1",
                    "url": "https://www.instagram.com/reel/LOW1/",
                    "videoViewCount": 5000,
                    "likesCount": 50,
                    "commentsCount": 5,
                    "caption": {"text": "x"},
                    "videoUrl": "https://cdn.example/v.mp4",
                }
            ],
            [],
            False,
        )
        mock_score.return_value = {
            "similarity_score": 40,
            "verdict": "no_match",
            "why_it_doesnt_fit": "wrong niche",
        }

        job = {
            "id": "job_test2",
            "client_id": "cli1",
            "org_id": "org1",
            "payload": {"competitor_id": "cmp1"},
        }
        run_profile_scrape(_settings(), job)

        sr = sb._sr_table  # type: ignore[attr-defined]
        self.assertFalse(sr.upsert.called)

        bj = sb._bj_table  # type: ignore[attr-defined]
        res = bj.update.call_args[0][0].get("result") or {}
        self.assertEqual(res.get("reels_processed"), 0)
        self.assertEqual(res.get("reels_rejected_similarity"), 1)
        self.assertTrue(res.get("rejected_examples"))

    @patch("jobs.profile_scrape.get_supabase_for_settings")
    def test_missing_analysis_brief_raises(self, mock_get_sb) -> None:
        mock_get_sb.return_value = _make_supabase_competitor(analysis_brief="")

        job = {
            "id": "job_fail",
            "client_id": "cli1",
            "org_id": "org1",
            "payload": {"competitor_id": "cmp1"},
        }
        with self.assertRaises(RuntimeError) as ctx:
            run_profile_scrape(_settings(), job)
        self.assertIn("analysis_brief", str(ctx.exception))

    @patch("jobs.profile_scrape.enqueue_auto_analyze_scraped")
    @patch("jobs.profile_scrape.enqueue_format_digest_recompute")
    @patch("jobs.profile_scrape.insert_snapshots_for_scrape_job")
    @patch("jobs.profile_scrape.run_actor")
    @patch("jobs.profile_scrape.get_supabase_for_settings")
    def test_own_scrape_does_not_call_enrich_or_scorer(
        self,
        mock_get_sb,
        mock_run_actor,
        _snap,
        _fd,
        _aa,
    ) -> None:
        with patch("jobs.profile_scrape.enrich_reel_urls_direct") as mock_enrich, patch(
            "jobs.profile_scrape.score_reel_dict_for_keyword_similarity"
        ) as mock_score:
            clients_table = MagicMock()
            ch = MagicMock()
            ch.execute.return_value = SimpleNamespace(data=[{"instagram_handle": "ownuser"}])
            clients_table.select.return_value.eq.return_value.limit.return_value = ch

            sr_table = MagicMock()
            sr_sel = MagicMock()
            sr_sel.execute.return_value = SimpleNamespace(data=[])
            sr_table.select.return_value.eq.return_value.is_.return_value = sr_sel
            sr_table.upsert.return_value.execute.return_value = SimpleNamespace(data=[])

            bj_table = MagicMock()
            bj_table.update.return_value.eq.return_value.execute.return_value = (
                SimpleNamespace(data=[])
            )

            sb = MagicMock()

            def table_side(name: str):
                if name == "clients":
                    return clients_table
                if name == "scraped_reels":
                    return sr_table
                if name == "background_jobs":
                    return bj_table
                return MagicMock()

            sb.table.side_effect = table_side
            mock_get_sb.return_value = sb

            reel_item = {
                "type": "Video",
                "url": "https://www.instagram.com/reel/OWN1/",
                "shortCode": "OWN1",
                "videoViewCount": 1000,
                "likesCount": 10,
                "commentsCount": 1,
                "caption": {"text": "own"},
            }
            mock_run_actor.return_value = [reel_item]

            job = {
                "id": "job_own",
                "client_id": "cli1",
                "org_id": "org1",
                "payload": {"scrape_own": True},
            }
            run_profile_scrape(_settings(), job)

            mock_enrich.assert_not_called()
            mock_score.assert_not_called()
