"""Preserve quiz-owned ICP when auto-profile merges."""

from services.onboarding_auto_profile_merge import merge_auto_profile_into_client


def test_merge_preserves_quiz_icp_summary():
    patch = merge_auto_profile_into_client(
        existing_niche_config=[
            {
                "id": "onboarding-quiz",
                "name": "Coach",
                "description": "Leadership",
                "keywords": ["leadership coach"],
            }
        ],
        existing_icp={"summary": "Busy executives", "source": "onboarding_quiz", "target": "CEOs"},
        existing_products={"competitor_seeds": ["seed_a"]},
        inferred_niches=[{"id": "inferred", "name": "Inferred", "keywords": ["toxic boss"]}],
        inferred_icp={"target": "Managers", "pain_points": ["stress"], "desires": ["clarity"]},
        inferred_seeds=["seed_b", "seed_a"],
        inferred_lang="de",
    )
    assert patch["icp"]["summary"] == "Busy executives"
    assert patch["icp"]["target"] == "CEOs"
    assert patch["icp"]["pain_points"] == ["stress"]
    assert patch["niche_config"][0]["id"] == "onboarding-quiz"
    assert "seed_a" in patch["products"]["competitor_seeds"]
    assert "seed_b" in patch["products"]["competitor_seeds"]


def test_merge_replaces_icp_when_not_quiz_owned():
    patch = merge_auto_profile_into_client(
        existing_niche_config=[],
        existing_icp={},
        existing_products={},
        inferred_niches=[{"id": "x", "name": "X", "keywords": []}],
        inferred_icp={"target": "Creators"},
        inferred_seeds=["one"],
        inferred_lang="en",
    )
    assert patch["icp"]["target"] == "Creators"
    assert patch["niche_config"][0]["id"] == "x"
