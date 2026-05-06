import unittest

from services.apify import instagram_profile_posts_input, instagram_reel_scraper_input


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


if __name__ == "__main__":
    unittest.main()
