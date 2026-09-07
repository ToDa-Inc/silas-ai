"""Google lookback window, matched-creator expansion, competitor search terms."""

from __future__ import annotations

import unittest
from typing import Any, Dict, List

from jobs.keyword_reel_similarity import (
    ONBOARDING_NEAR_MATCH_FLOOR,
    collect_matched_creator_candidates,
    select_onboarding_qualifying,
)
from services.google_cse_instagram_reels import (
    _tbs_from_date_restrict,
    google_cse_search_instagram_reel_items,
)
from services.keyword_search_window import (
    GOOGLE_LOOKBACK_DAYS,
    onboarding_keyword_similarity_payload,
    recency_days_for_discovery,
    resolve_google_date_restrict,
    resolve_google_lookback_days,
)
from services.matched_creator_expansion import (
    creator_baseline_views,
    expansion_budget,
    select_creator_outliers,
    select_matched_creator_handles,
)
from services.niche_queries import competitor_search_phrases, pick_default_keyword


class GoogleWindowTests(unittest.TestCase):
    def test_google_reels_survive_beyond_the_sasky_window(self):
        self.assertEqual(
            recency_days_for_discovery("google_cse", days=30, google_days=90), 90
        )
        self.assertEqual(
            recency_days_for_discovery("google_search", days=30, google_days=90), 90
        )

    def test_sasky_reels_keep_the_narrow_window(self):
        self.assertEqual(recency_days_for_discovery("sasky", days=30, google_days=90), 30)
        self.assertEqual(recency_days_for_discovery("", days=2, google_days=90), 2)

    def test_google_days_never_narrower_than_the_search_window(self):
        self.assertEqual(
            recency_days_for_discovery("google_cse", days=30, google_days=7), 30
        )

    def test_onboarding_payload_carries_a_three_month_google_window(self):
        payload = onboarding_keyword_similarity_payload()
        self.assertEqual(payload["google_lookback_days"], GOOGLE_LOOKBACK_DAYS)
        self.assertEqual(resolve_google_lookback_days(payload=payload), 90)
        self.assertEqual(resolve_google_date_restrict(payload=payload), "m3")

    def test_payload_overrides_the_default_window(self):
        self.assertEqual(
            resolve_google_lookback_days(payload={"google_lookback_days": 60}), 60
        )
        self.assertEqual(
            resolve_google_date_restrict(payload={"google_date_restrict": "m2"}), "m2"
        )

    def test_date_restrict_maps_to_google_search_tbs(self):
        self.assertEqual(_tbs_from_date_restrict("m3"), "qdr:m3")
        self.assertEqual(_tbs_from_date_restrict("d7"), "qdr:d7")

    def test_junk_date_restrict_is_dropped_rather_than_sent(self):
        self.assertEqual(_tbs_from_date_restrict(""), "")
        self.assertEqual(_tbs_from_date_restrict("last-3-months"), "")

    def test_cse_query_includes_the_date_restriction(self):
        seen: List[str] = []

        def fake_get(url: str) -> Dict[str, Any]:
            seen.append(url)
            return {"items": []}

        google_cse_search_instagram_reel_items(
            api_key="k",
            cse_cx="cx",
            keywords=["rhetorik training"],
            date_restrict="m3",
            http_get_json=fake_get,
        )
        self.assertEqual(len(seen), 1)
        self.assertIn("dateRestrict=m3", seen[0])

    def test_cse_omits_the_param_when_unrestricted(self):
        seen: List[str] = []

        def fake_get(url: str) -> Dict[str, Any]:
            seen.append(url)
            return {"items": []}

        google_cse_search_instagram_reel_items(
            api_key="k",
            cse_cx="cx",
            keywords=["rhetorik training"],
            http_get_json=fake_get,
        )
        self.assertNotIn("dateRestrict", seen[0])


class MatchedCreatorTests(unittest.TestCase):
    def test_only_creators_that_cleared_the_bar_are_mined(self):
        scored = [
            {"username": "andre", "similarity_score": 88},
            {"username": "weak", "similarity_score": 61},
        ]
        self.assertEqual(
            select_matched_creator_handles(scored, threshold=85, max_handles=3), ["andre"]
        )

    def test_handles_are_deduped_and_ordered_by_score(self):
        scored = [
            {"username": "b", "similarity_score": 86},
            {"username": "a", "similarity_score": 94},
            {"username": "@A", "similarity_score": 90},
        ]
        self.assertEqual(
            select_matched_creator_handles(scored, threshold=85, max_handles=5), ["a", "b"]
        )

    def test_client_and_banned_handles_are_excluded(self):
        scored = [
            {"username": "elmar", "similarity_score": 92},
            {"username": "andre", "similarity_score": 88},
        ]
        self.assertEqual(
            select_matched_creator_handles(
                scored, threshold=85, max_handles=3, exclude={"elmar"}
            ),
            ["andre"],
        )

    def test_baseline_uses_median_so_one_viral_reel_cannot_raise_the_bar(self):
        posts = [{"views": 1000}, {"views": 1200}, {"views": 900}, {"views": 400000}]
        self.assertEqual(creator_baseline_views(posts), 1100.0)

    def test_outliers_are_reels_that_beat_their_own_account(self):
        posts = [
            {"url": "a", "views": 1000},
            {"url": "b", "views": 1100},
            {"url": "c", "views": 900},
            {"url": "d", "views": 9000},
        ]
        hits, meta = select_creator_outliers(posts, multiplier=1.5)
        self.assertEqual([h["url"] for h in hits], ["d"])
        self.assertEqual(meta["baseline_views"], 1050)
        self.assertEqual(meta["outliers"], 1)

    def test_flat_profile_contributes_nothing(self):
        posts = [{"url": "a", "views": 1000}, {"url": "b", "views": 1010}]
        hits, meta = select_creator_outliers(posts, multiplier=1.5)
        self.assertEqual(hits, [])
        self.assertEqual(meta["outliers"], 0)

    def test_already_seen_reels_are_not_re_offered(self):
        posts = [
            {"url": "known", "views": 9000},
            {"url": "fresh", "views": 8000},
            {"url": "c", "views": 1000},
            {"url": "d", "views": 1000},
        ]
        hits, _ = select_creator_outliers(posts, multiplier=1.5, exclude_urls={"known"})
        self.assertEqual([h["url"] for h in hits], ["fresh"])

    def test_outliers_are_capped(self):
        posts = [{"url": str(i), "views": 500} for i in range(6)]
        posts += [{"url": f"big{i}", "views": 50_000} for i in range(5)]
        hits, _ = select_creator_outliers(posts, multiplier=1.5, limit=2)
        self.assertEqual(len(hits), 2)

    def test_expansion_only_runs_on_a_thin_but_non_empty_batch(self):
        self.assertEqual(expansion_budget(saved=0, min_save=8), 0)
        self.assertEqual(expansion_budget(saved=8, min_save=8), 0)
        self.assertEqual(expansion_budget(saved=1, min_save=8, max_handles=3), 3)
        self.assertEqual(expansion_budget(saved=7, min_save=8, max_handles=3), 1)


class FakeSettings:
    apify_api_token = "t"
    apify_reel_actor = "apify~instagram-reel-scraper"
    apify_include_shares_count = False


def _item(sc: str, views: int, *, duration: int = 30) -> Dict[str, Any]:
    return {
        "shortCode": sc,
        "type": "Video",
        "videoViewCount": views,
        "commentsCount": 10,
        "likesCount": 100,
        "videoDuration": duration,
        "caption": f"caption {sc}",
        "timestamp": "2026-08-20T10:00:00.000Z",
        "url": f"https://www.instagram.com/reel/{sc}/",
    }


class CollectMatchedCreatorCandidatesTests(unittest.TestCase):
    def test_returns_only_the_creators_own_outliers(self):
        calls: List[Dict[str, Any]] = []

        def fake_runner(token: str, actor: str, body: Dict[str, Any]) -> List[Dict[str, Any]]:
            calls.append(body)
            return [
                _item("flat1", 1000),
                _item("flat2", 1000),
                _item("flat3", 1100),
                _item("winner", 12_000),
            ]

        candidates, log = collect_matched_creator_candidates(
            FakeSettings(),
            handles=["andre"],
            keywords=["rhetorik"],
            seen_short_codes=set(),
            exclude_urls=set(),
            run_actor_fn=fake_runner,
        )
        self.assertEqual(len(candidates), 1)
        self.assertIn("winner", candidates[0]["url"])
        self.assertEqual(candidates[0]["discovery"], "matched_creator")
        self.assertEqual(candidates[0]["username"], "andre")
        self.assertEqual(log[0]["outliers"], 1)

    def test_scrape_is_recency_limited_and_skips_pinned(self):
        calls: List[Dict[str, Any]] = []

        def fake_runner(token: str, actor: str, body: Dict[str, Any]) -> List[Dict[str, Any]]:
            calls.append(body)
            return []

        collect_matched_creator_candidates(
            FakeSettings(),
            handles=["andre"],
            keywords=[],
            seen_short_codes=set(),
            exclude_urls=set(),
            run_actor_fn=fake_runner,
        )
        self.assertEqual(calls[0]["onlyPostsNewerThan"], "3 months")
        self.assertTrue(calls[0]["skipPinnedPosts"])

    def test_reels_already_in_the_library_are_skipped(self):
        def fake_runner(token: str, actor: str, body: Dict[str, Any]) -> List[Dict[str, Any]]:
            return [
                _item("known", 20_000),
                _item("flat1", 1000),
                _item("flat2", 1000),
                _item("flat3", 1000),
            ]

        candidates, _ = collect_matched_creator_candidates(
            FakeSettings(),
            handles=["andre"],
            keywords=[],
            seen_short_codes={"known"},
            exclude_urls=set(),
            run_actor_fn=fake_runner,
        )
        self.assertEqual(candidates, [])

    def test_one_failing_handle_does_not_abort_the_rest(self):
        def fake_runner(token: str, actor: str, body: Dict[str, Any]) -> List[Dict[str, Any]]:
            if body["username"] == ["broken"]:
                raise RuntimeError("actor 403")
            return [
                _item("flat1", 1000),
                _item("flat2", 1000),
                _item("win", 9000),
            ]

        candidates, log = collect_matched_creator_candidates(
            FakeSettings(),
            handles=["broken", "andre"],
            keywords=[],
            seen_short_codes=set(),
            exclude_urls=set(),
            run_actor_fn=fake_runner,
        )
        self.assertEqual(len(candidates), 1)
        self.assertIn("error", log[0])
        self.assertEqual(log[1]["outliers"], 1)


class CompetitorKeywordTests(unittest.TestCase):
    def test_interview_prose_is_dropped_not_truncated(self):
        used, dropped = competitor_search_phrases(
            [
                "Ziele für die nächsten 12 Monate sind mehr Sichtbarkeit und Kunden",
                "rhetorik training",
            ]
        )
        self.assertEqual(used, ["rhetorik training"])
        self.assertEqual(len(dropped), 1)

    def test_terms_are_sanitized_and_deduped(self):
        used, _ = competitor_search_phrases(
            ["Rhetorik!! Training", "rhetorik training", "  "]
        )
        self.assertEqual(used, ["Rhetorik Training"])

    def test_max_terms_is_respected(self):
        used, _ = competitor_search_phrases([f"kw{i}" for i in range(20)], max_terms=5)
        self.assertEqual(len(used), 5)

    def test_default_keyword_never_returns_chopped_prose(self):
        niches = [
            {
                "keywords_de": [
                    "Was sind deine Ziele für die nächsten zwölf Monate im Business"
                ],
                "name": "Rhetorik Coaching",
            }
        ]
        self.assertEqual(pick_default_keyword(niches), "Rhetorik Coaching")

    def test_default_keyword_falls_back_to_a_safe_term(self):
        niches = [{"keywords_de": ["a" * 200], "name": "b" * 200}]
        self.assertEqual(pick_default_keyword(niches), "content creator")


class NearMatchFloorTests(unittest.TestCase):
    def test_floor_sits_close_to_the_real_bar(self):
        self.assertEqual(ONBOARDING_NEAR_MATCH_FLOOR, 70)

    def test_weak_scores_never_pad_the_taste_batch(self):
        scored = [
            {"url": "a", "similarity_score": 88},
            {"url": "b", "similarity_score": 74},
            {"url": "c", "similarity_score": 61},
            {"url": "d", "similarity_score": 52},
        ]
        qualifying, meta = select_onboarding_qualifying(scored, threshold=85, min_save=8)
        self.assertEqual([q["url"] for q in qualifying], ["a", "b"])
        self.assertEqual(meta["onboarding_fallback_floor"], 70)

    def test_a_full_batch_is_left_untouched(self):
        scored = [{"url": str(i), "similarity_score": 90} for i in range(8)]
        qualifying, meta = select_onboarding_qualifying(scored, threshold=85, min_save=8)
        self.assertEqual(len(qualifying), 8)
        self.assertEqual(meta["onboarding_fallback_saved"], 0)


if __name__ == "__main__":
    unittest.main()
