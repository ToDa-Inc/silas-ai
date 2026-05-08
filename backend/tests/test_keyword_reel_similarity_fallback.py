"""Tests for Sasky posts URL fallback in keyword_reel_similarity discovery."""

from __future__ import annotations

import unittest

from services.keyword_similarity_discovery import (
    discover_keyword_urls_with_fallback,
    merge_keyword_discovery_items_into_raw_by_sc,
)


class TestMergeKeywordDiscovery(unittest.TestCase):
    def test_reel_url_primary_shape(self) -> None:
        raw: dict = {}
        merge_keyword_discovery_items_into_raw_by_sc(
            [
                {
                    "reel_url": "https://www.instagram.com/reel/AbCdEfGhIj/",
                    "user_name": "someone",
                    "keyword": "kw1",
                }
            ],
            raw,
            client_handle="client",
            banned_handles=set(),
            banned_scs=set(),
            dismissed_scs=set(),
            keywords=["kw1"],
        )
        self.assertEqual(len(raw), 1)
        self.assertIn("AbCdEfGhIj", raw)
        self.assertEqual(raw["AbCdEfGhIj"]["username"], "someone")
        self.assertEqual(raw["AbCdEfGhIj"]["keywords"], ["kw1"])

    def test_post_url_fallback_shape(self) -> None:
        raw: dict = {}
        merge_keyword_discovery_items_into_raw_by_sc(
            [
                {
                    "post_url": "https://www.instagram.com/p/XyZaBcDeFg/",
                    "user_name": "poster",
                    "keyword": "de",
                }
            ],
            raw,
            client_handle="client",
            banned_handles=set(),
            banned_scs=set(),
            dismissed_scs=set(),
            keywords=["de"],
        )
        self.assertEqual(len(raw), 1)
        self.assertIn("XyZaBcDeFg", raw)

    def test_username_field_fallback(self) -> None:
        raw: dict = {}
        merge_keyword_discovery_items_into_raw_by_sc(
            [{"post_url": "https://www.instagram.com/p/AAA/", "username": "alt"}],
            raw,
            client_handle="client",
            banned_handles=set(),
            banned_scs=set(),
            dismissed_scs=set(),
            keywords=["x"],
        )
        self.assertEqual(raw["AAA"]["username"], "alt")


class TestDiscoverKeywordUrls(unittest.TestCase):
    def test_no_fallback_when_primary_has_urls(self) -> None:
        def reel_batch(_token, _keywords, **_kwargs):
            return [
                {
                    "reel_url": "https://www.instagram.com/reel/ZZzz1111/",
                    "user_name": "u",
                    "keyword": "k",
                }
            ]

        def post_batch(*_a, **_k):
            raise AssertionError("fallback should not run")

        raw, meta = discover_keyword_urls_with_fallback(
            "tok",
            ["k"],
            total_limit=50,
            search_window="last-2-days",
            client_handle="me",
            banned_handles=set(),
            banned_scs=set(),
            dismissed_scs=set(),
            reel_batch=reel_batch,
            post_batch=post_batch,
        )
        self.assertEqual(len(raw), 1)
        self.assertFalse(meta["keyword_search_fallback_used"])
        self.assertEqual(meta["keyword_search_primary_items"], 1)
        self.assertEqual(meta["total_keyword_actor_items"], 1)
        self.assertEqual(meta["keyword_discovery_impl"], "posts_fallback_v1")
        self.assertEqual(meta["discovery_log"][0]["stage"], "primary_keyword_reels_completed")
        self.assertEqual(meta["discovery_log"][0]["usable_short_codes"], 1)

    def test_fallback_when_primary_empty(self) -> None:
        def reel_batch(*_a, **_k):
            return []

        def post_batch(*_a, **_k):
            return [
                {
                    "post_url": "https://www.instagram.com/p/FbCkFaLl1/",
                    "user_name": "fbuser",
                    "keyword": "toxic",
                }
            ]

        raw, meta = discover_keyword_urls_with_fallback(
            "tok",
            ["toxic"],
            total_limit=50,
            search_window="last-2-days",
            client_handle="me",
            banned_handles=set(),
            banned_scs=set(),
            dismissed_scs=set(),
            reel_batch=reel_batch,
            post_batch=post_batch,
        )
        self.assertEqual(len(raw), 1)
        self.assertTrue(meta["keyword_search_fallback_used"])
        self.assertEqual(meta["keyword_search_fallback_items"], 1)
        self.assertEqual(meta["total_keyword_actor_items"], 1)
        self.assertEqual(raw["FbCkFaLl1"]["username"], "fbuser")
        self.assertEqual(
            [entry["stage"] for entry in meta["discovery_log"]],
            [
                "primary_keyword_reels_completed",
                "fallback_decision",
                "fallback_keyword_posts_completed",
            ],
        )
        self.assertEqual(meta["discovery_log"][-1]["usable_short_codes"], 1)


if __name__ == "__main__":
    unittest.main()
