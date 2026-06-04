"""Onboarding step ordering helpers."""

from services.onboarding_state import ONBOARDING_STEPS_ORDER, _merge_completed_steps


def test_merge_completed_steps_idempotent():
    assert _merge_completed_steps(["workspace"], "quiz") == ["workspace", "quiz"]
    assert _merge_completed_steps(["workspace", "quiz"], "quiz") == ["workspace", "quiz"]


def test_onboarding_steps_include_pipeline_and_aha_path():
    assert "pipeline" in ONBOARDING_STEPS_ORDER
    assert ONBOARDING_STEPS_ORDER.index("editor") < ONBOARDING_STEPS_ORDER.index("action_plan")
    assert ONBOARDING_STEPS_ORDER[-1] == "done"
