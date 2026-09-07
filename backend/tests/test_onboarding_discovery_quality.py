"""Guards for the ElmarTest (+10) onboarding run: one reel, empty competitor lane."""

from __future__ import annotations

import unittest

from jobs.keyword_reel_similarity import select_onboarding_qualifying
from services.daily_opportunities import (
    DASHBOARD_FALLBACK_LOOKBACK_DAYS,
    DASHBOARD_LOOKBACK_DAYS,
)
from services.niche_queries import collect_keywords, looks_like_search_phrase
from services.onboarding_state import content_goals_from_answer


def _reel(url: str, score: int) -> dict:
    return {"url": url, "similarity_score": score, "username": "x", "views": 1}


class TestContentGoalsFromAnswer(unittest.TestCase):
    def test_essay_becomes_empty(self) -> None:
        essay = (
            "Ziele für die nächsten 6–12 Monate (bezogen auf Brutto-Jahresumsatz):\n"
            "- Kurzfristig: Den ROI sichern."
        )
        self.assertEqual(content_goals_from_answer(essay), [])

    def test_short_comma_list_kept(self) -> None:
        self.assertEqual(
            content_goals_from_answer("leads, brand authority, bookings"),
            ["leads", "brand authority", "bookings"],
        )

    def test_list_filters_paragraphs(self) -> None:
        self.assertEqual(
            content_goals_from_answer(
                [
                    "lampenfieber überwinden",
                    "Elmar hilft Unternehmen und Einzelpersonen dabei, überzeugend zu kommunizieren",
                ]
            ),
            ["lampenfieber überwinden"],
        )


class TestCollectKeywordsRejectsEssays(unittest.TestCase):
    def test_payload_keywords_skip_interview_dump(self) -> None:
        kws = collect_keywords(
            [{"keywords": ["Programmdirektor ist keine Suchphrase die jemand sucht weil sie viel zu lang ist"]}],
            {
                "keywords": [
                    "Ziele für die nächsten 6–12 Monate (bezogen auf Brutto-Jahresumsatz exkl. MwSt.)",
                    "rhetorik coaching",
                ]
            },
        )
        self.assertEqual(kws, ["rhetorik coaching"])

    def test_looks_like_search_phrase(self) -> None:
        self.assertTrue(looks_like_search_phrase("rhetorik für manager"))
        self.assertFalse(looks_like_search_phrase("Ziele für die nächsten 12 Monate plus 100000"))


class TestOnboardingQualifyingFill(unittest.TestCase):
    def test_keeps_true_match_and_fills_near(self) -> None:
        scored = [
            _reel("https://ig/a", 88),
            _reel("https://ig/b", 74),
            _reel("https://ig/c", 61),
            _reel("https://ig/d", 40),
        ]
        qualifying, meta = select_onboarding_qualifying(
            scored, threshold=85, min_save=8, floor=50
        )
        urls = [r["url"] for r in qualifying]
        self.assertEqual(urls, ["https://ig/a", "https://ig/b", "https://ig/c"])
        self.assertEqual(meta["onboarding_fallback_saved"], 3)

    def test_does_not_fill_when_batch_already_full(self) -> None:
        scored = [_reel(f"https://ig/{i}", 90) for i in range(8)]
        qualifying, meta = select_onboarding_qualifying(
            scored, threshold=85, min_save=8, floor=50
        )
        self.assertEqual(len(qualifying), 8)
        self.assertEqual(meta["onboarding_fallback_saved"], 0)


class TestDashboardLookback(unittest.TestCase):
    def test_fallback_covers_onboarding_window(self) -> None:
        self.assertEqual(DASHBOARD_LOOKBACK_DAYS, 3)
        self.assertEqual(DASHBOARD_FALLBACK_LOOKBACK_DAYS, 30)


if __name__ == "__main__":
    unittest.main()
