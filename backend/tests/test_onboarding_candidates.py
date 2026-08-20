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
