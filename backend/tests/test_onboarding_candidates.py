"""Onboarding reel candidates must expose creator + thumbnail fields the vote UI reads."""

import sys
import types

if "supabase" not in sys.modules:
    stub = types.ModuleType("supabase")
    stub.Client = object
    sys.modules["supabase"] = stub

from services.onboarding_candidates import CANDIDATE_REEL_COLUMNS, shape_candidate_reel


def test_candidate_select_includes_username_and_media():
    cols = CANDIDATE_REEL_COLUMNS.replace(" ", "")
    for required in (
        "account_username",
        "thumbnail_url",
        "post_url",
        "similarity_score",
        "outlier_likes_ratio",
    ):
        assert required in cols, f"missing {required} in candidate select"
    assert "shortcode" not in cols
    assert "video_url" not in cols


def test_shape_maps_outlier_ratio_and_strips_username():
    row = shape_candidate_reel(
        {
            "id": "r1",
            "account_username": "  fitcoach  ",
            "outlier_likes_ratio": 2.4,
            "similarity_score": 88,
        }
    )
    assert row["account_username"] == "fitcoach"
    assert row["outlier_ratio"] == 2.4
    assert row["similarity_score"] == 88


def test_shape_keeps_explicit_outlier_ratio():
    row = shape_candidate_reel(
        {"id": "r2", "account_username": "x", "outlier_ratio": 3.1, "outlier_likes_ratio": 9.0}
    )
    assert row["outlier_ratio"] == 3.1


def test_list_candidates_sorts_by_views_descending():
    from unittest.mock import MagicMock
    from services.onboarding_candidates import list_onboarding_reel_candidates

    mock_supabase = MagicMock()
    # Mock feedback
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    # Mock scraped_reels select
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        {
            "id": "reel_low",
            "account_username": "coach_a",
            "post_url": "https://instagram.com/reel/1",
            "views": 5000,
            "likes": 200,
            "comments": 20,
            "similarity_score": 90,
            "source": "keyword_similarity",
            "thumbnail_url": "https://img.com/1.jpg",
            "format": "reel",
        },
        {
            "id": "reel_high",
            "account_username": "coach_b",
            "post_url": "https://instagram.com/reel/2",
            "views": 500000,
            "likes": 20000,
            "comments": 2000,
            "similarity_score": 92,
            "source": "keyword_similarity",
            "thumbnail_url": "https://img.com/2.jpg",
            "format": "reel",
        },
        {
            "id": "reel_mid",
            "account_username": "coach_c",
            "post_url": "https://instagram.com/reel/3",
            "views": 50000,
            "likes": 2000,
            "comments": 200,
            "similarity_score": 95,
            "source": "keyword_similarity",
            "thumbnail_url": "https://img.com/3.jpg",
            "format": "reel",
        },
    ]

    candidates = list_onboarding_reel_candidates(mock_supabase, "client_123", limit=10)
    assert len(candidates) == 3
    assert candidates[0]["reel"]["id"] == "reel_high"
    assert candidates[0]["reel"]["views"] == 500000
    assert candidates[1]["reel"]["id"] == "reel_mid"
    assert candidates[1]["reel"]["views"] == 50000
    assert candidates[2]["reel"]["id"] == "reel_low"
    assert candidates[2]["reel"]["views"] == 5000
