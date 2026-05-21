import unittest

from services.similarity_discovery_keywords import (
    DEFAULT_MAX_KEYWORDS,
    similarity_scan_keywords,
)


class TestSimilarityScanKeywords(unittest.TestCase):
    def test_cap_and_topic_before_hashtag(self) -> None:
        client = {
            "client_dna": {},
            "client_context": {},
            "niche_config": [
                {
                    "topic_keywords": [f"topic-{i}" for i in range(12)],
                    "hashtags": ["hashtag-a", "hashtag-b"],
                    "keywords": ["bio-coach"],
                    "content_angles": ["Why does your boss ignore you when you ask for a raise?"],
                }
            ],
        }
        keywords, prov = similarity_scan_keywords(client=client, max_keywords=DEFAULT_MAX_KEYWORDS)
        self.assertLessEqual(len(keywords), DEFAULT_MAX_KEYWORDS)
        self.assertIn("topic-0", keywords)
        self.assertNotIn("bio-coach", keywords)
        self.assertNotIn("Why does your boss", keywords[0] if keywords else "")
        self.assertIn("niche_config.topic_keywords", prov)

    def test_similarity_keywords_tier_first(self) -> None:
        client = {
            "client_dna": {
                "similarity_keywords": {"auto": [{"text": "boundaries at work"}]},
            },
            "niche_config": [{"topic_keywords": ["other topic"]}],
        }
        keywords, _ = similarity_scan_keywords(client=client, max_keywords=2)
        self.assertEqual(keywords[0], "boundaries at work")


if __name__ == "__main__":
    unittest.main()
