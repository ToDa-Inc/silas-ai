"""Google CSE Instagram reel URL parsing and onboarding-only fan-in."""

from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace

from services.google_cse_instagram_reels import (
    canonical_reel_from_cse_link,
    cse_items_from_response,
    google_cse_search_instagram_reel_items,
    merge_google_cse_urls_if_enabled,
)
from services.keyword_search_window import onboarding_keyword_similarity_payload


class TestCanonicalReelFromCseLink(unittest.TestCase):
    def test_plain_reel_path(self) -> None:
        url, sc, uname = canonical_reel_from_cse_link(
            "https://www.instagram.com/reel/AbCdEfGhIj/"
        )
        self.assertEqual(sc, "AbCdEfGhIj")
        self.assertTrue(url.endswith("/reel/AbCdEfGhIj"))
        self.assertEqual(uname, "")

    def test_profile_prefixed_reel_path(self) -> None:
        url, sc, uname = canonical_reel_from_cse_link(
            "https://www.instagram.com/coach_de/reel/XyZ12345/?igsh=abc"
        )
        self.assertEqual(sc, "XyZ12345")
        self.assertEqual(uname, "coach_de")
        self.assertIn("/reel/XyZ12345", url)

    def test_p_path(self) -> None:
        url, sc, uname = canonical_reel_from_cse_link(
            "https://www.instagram.com/p/PostCode99/"
        )
        self.assertEqual(sc, "PostCode99")
        self.assertIn("/reel/PostCode99", url)
        self.assertEqual(uname, "")

    def test_non_instagram_dropped(self) -> None:
        url, sc, uname = canonical_reel_from_cse_link("https://www.google.com/search?q=x")
        self.assertEqual((url, sc, uname), ("", "", ""))


class TestCseItemsFromResponse(unittest.TestCase):
    def test_parses_fixture_items_and_caps(self) -> None:
        payload = {
            "items": [
                {"link": "https://www.instagram.com/reel/AAAA1111/"},
                {"link": "https://www.instagram.com/userx/reel/BBBB2222/"},
                {"link": "https://www.instagram.com/reel/AAAA1111/?dup=1"},
                {"link": "https://example.com/not-ig"},
            ]
        }
        seen: set[str] = set()
        rows = cse_items_from_response(
            payload, keyword="toxischer chef", seen=seen, max_total=40
        )
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["reel_url"], "https://www.instagram.com/reel/AAAA1111")
        self.assertEqual(rows[1]["username"], "userx")
        self.assertEqual(rows[0]["keyword"], "toxischer chef")
        self.assertEqual(rows[0]["discovery"], "google_cse")


class TestGoogleCseSearch(unittest.TestCase):
    def test_per_keyword_and_total_caps(self) -> None:
        calls: list[str] = []

        def getter(url: str):
            calls.append(url)
            n = len(calls)
            return {
                "items": [
                    {"link": f"https://www.instagram.com/reel/KW{n}IT{i:02d}/"}
                    for i in range(8)
                ]
            }

        items, meta = google_cse_search_instagram_reel_items(
            api_key="k",
            cse_cx="cx",
            keywords=["a", "b", "c", "d", "e", "f"],
            per_keyword=8,
            max_total=20,
            http_get_json=getter,
        )
        self.assertEqual(len(items), 20)
        self.assertEqual(meta["unique_short_codes"], 20)
        self.assertLessEqual(meta["queries"], 6)
        self.assertTrue(all("site%3Ainstagram.com%2Freel" in u or "site:instagram.com/reel" in u for u in calls))


class TestMergeGoogleCseIfEnabled(unittest.TestCase):
    def test_onboarding_payload_merges_without_username(self) -> None:
        raw: dict = {}
        settings = SimpleNamespace(google_cse_api_key="k", google_cse_cx="cx")

        def search_fn(**_kwargs):
            return (
                [
                    {
                        "reel_url": "https://www.instagram.com/reel/CseOnly1/",
                        "username": "",
                        "keyword": "vorgesetzter toxisch",
                        "discovery": "google_cse",
                    }
                ],
                {"queries": 1, "items": 1},
            )

        meta = merge_google_cse_urls_if_enabled(
            raw,
            settings=settings,
            payload=onboarding_keyword_similarity_payload(),
            keywords=["vorgesetzter toxisch"],
            client_handle="me",
            banned_handles=set(),
            banned_scs=set(),
            dismissed_scs=set(),
            search_fn=search_fn,
        )
        self.assertTrue(meta["used"])
        self.assertIn("CseOnly1", raw)
        self.assertEqual(raw["CseOnly1"]["username"], "")

    def test_daily_payload_does_not_call_search(self) -> None:
        settings = SimpleNamespace(google_cse_api_key="k", google_cse_cx="cx")

        def search_fn(**_kwargs):
            raise AssertionError("daily path must not call Google CSE")

        meta = merge_google_cse_urls_if_enabled(
            {},
            settings=settings,
            payload={"search_window": "last-2-days", "days": 3},
            keywords=["workout"],
            client_handle="me",
            banned_handles=set(),
            banned_scs=set(),
            dismissed_scs=set(),
            search_fn=search_fn,
        )
        self.assertFalse(meta["used"])
        self.assertEqual(meta.get("skipped"), "not_requested")

    def test_missing_credentials_skip(self) -> None:
        settings = SimpleNamespace(google_cse_api_key="", google_cse_cx="")
        meta = merge_google_cse_urls_if_enabled(
            {},
            settings=settings,
            payload=onboarding_keyword_similarity_payload(),
            keywords=["x"],
            client_handle="me",
            banned_handles=set(),
            banned_scs=set(),
            dismissed_scs=set(),
            search_fn=lambda **k: (_ for _ in ()).throw(AssertionError("no search")),
        )
        self.assertFalse(meta["used"])
        self.assertEqual(meta.get("skipped"), "missing_credentials")


class TestDailyTickSource(unittest.TestCase):
    def test_daily_tick_file_has_no_google_cse(self) -> None:
        src = (
            Path(__file__).resolve().parents[1] / "jobs" / "daily_intelligence_tick.py"
        ).read_text(encoding="utf-8")
        self.assertNotIn("google_cse", src)
        self.assertNotIn("url_sources", src)


if __name__ == "__main__":
    unittest.main()
