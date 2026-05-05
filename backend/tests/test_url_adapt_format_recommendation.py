import unittest

from services.url_adapt_format_recommendation import recommend_url_adapt_format


class UrlAdaptFormatRecommendationTest(unittest.TestCase):
    def test_carousel_media_type_wins_over_duration(self):
        self.assertEqual(
            recommend_url_adapt_format(
                {"normalized_format": "text_overlay"},
                reel_meta={"format": "carousel", "video_duration": 8},
            ),
            "carousel",
        )

    def test_short_video_routes_to_text_overlay(self):
        self.assertEqual(
            recommend_url_adapt_format(
                {"normalized_format": "talking_head"},
                reel_meta={"format": "reel", "video_duration": 14.9},
            ),
            "text_overlay",
        )

    def test_fifteen_seconds_and_longer_routes_to_talking_head(self):
        for duration in (15, 31.5):
            with self.subTest(duration=duration):
                self.assertEqual(
                    recommend_url_adapt_format(
                        {"normalized_format": "text_overlay"},
                        reel_meta={"format": "reel", "video_duration": duration},
                    ),
                    "talking_head",
                )

    def test_falls_back_to_normalized_format_when_duration_is_missing(self):
        self.assertEqual(
            recommend_url_adapt_format({"normalized_format": "b_roll"}),
            "b_roll_reel",
        )
        self.assertEqual(
            recommend_url_adapt_format({"normalized_format": "unknown"}),
            "text_overlay",
        )


if __name__ == "__main__":
    unittest.main()
