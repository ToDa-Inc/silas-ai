import unittest
from unittest.mock import patch

from services.apify import (
    _sasky_per_keyword_limit,
    instagram_profile_posts_input,
    instagram_reel_scraper_input,
    keyword_posts_search_input,
    run_keyword_reel_search_batch,
)


class TestApifyInputs(unittest.TestCase):
    def test_reel_scraper_includes_recency_fields(self) -> None:
        body = instagram_reel_scraper_input(
            ["someone"],
            30,
            include_shares_count=True,
            only_newer_than="2 days",
            skip_pinned_posts=True,
        )
        self.assertEqual(body["username"], ["someone"])
        self.assertEqual(body["resultsLimit"], 30)
        self.assertTrue(body["includeSharesCount"])
        self.assertEqual(body["onlyPostsNewerThan"], "2 days")
        self.assertTrue(body["skipPinnedPosts"])

    def test_profile_posts_input_only_newer_than(self) -> None:
        body = instagram_profile_posts_input(
            ["foo", "@bar"],
            20,
            only_newer_than="2 days",
        )
        self.assertEqual(
            body["directUrls"],
            [
                "https://www.instagram.com/foo/",
                "https://www.instagram.com/bar/",
            ],
        )
        self.assertEqual(body["resultsLimit"], 20)
        self.assertEqual(body["resultsType"], "posts")
        self.assertEqual(body["onlyPostsNewerThan"], "2 days")

    def test_profile_posts_input_omits_recency_when_none(self) -> None:
        body = instagram_profile_posts_input(["x"], 10)
        self.assertNotIn("onlyPostsNewerThan", body)

    def test_keyword_posts_search_input_matches_sasky_posts_actor(self) -> None:
        body = keyword_posts_search_input(
            [" toxic boss ", "toxischer chef"],
            100,
            date="last-1-month",
        )
        self.assertEqual(body["keywords"], ["toxic boss", "toxischer chef"])
        self.assertEqual(body["limit"], "100")
        self.assertEqual(body["date"], "last-1-month")

    def test_keyword_posts_search_input_omits_date_when_empty(self) -> None:
        body = keyword_posts_search_input(["a"], 80, date="")
        self.assertNotIn("date", body)


class TestSaskyPerKeywordSplit(unittest.TestCase):
    def test_per_keyword_limit_splits_budget_evenly(self) -> None:
        self.assertEqual(_sasky_per_keyword_limit(80, 4), 20)
        self.assertEqual(_sasky_per_keyword_limit(25, 5), 10)  # floor at 10

    def test_split_by_keyword_runs_one_actor_call_per_term(self) -> None:
        with patch("services.apify.run_actor") as run_actor:
            run_actor.return_value = [{"reel_url": "https://www.instagram.com/reel/AAAA/", "user_name": "u"}]
            items = run_keyword_reel_search_batch(
                "token",
                ["Fitness Coach", "Psychologe", "Ernährungscoach"],
                max_items_total=60,
                date="last-1-month",
                split_by_keyword=True,
            )
        self.assertEqual(run_actor.call_count, 3)
        self.assertEqual(len(items), 3)
        bodies = [call.args[2] for call in run_actor.call_args_list]
        keywords = [body["keywords"] for body in bodies]
        self.assertEqual(
            keywords,
            [["Fitness Coach"], ["Psychologe"], ["Ernährungscoach"]],
        )
        self.assertTrue(all(body["limit"] == "20" for body in bodies))
        self.assertTrue(all(body["date"] == "last-1-month" for body in bodies))

    def test_combined_batch_stays_one_run_when_split_disabled(self) -> None:
        with patch("services.apify.run_actor") as run_actor:
            run_actor.return_value = []
            run_keyword_reel_search_batch(
                "token",
                ["Fitness Coach", "Psychologe"],
                max_items_total=80,
                date="last-2-days",
                split_by_keyword=False,
            )
        self.assertEqual(run_actor.call_count, 1)
        body = run_actor.call_args.args[2]
        self.assertEqual(body["keywords"], ["Fitness Coach", "Psychologe"])
        self.assertEqual(body["limit"], "80")


if __name__ == "__main__":
    unittest.main()
