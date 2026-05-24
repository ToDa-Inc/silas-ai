"""Per-beat fontScale and B-roll trim fields on VideoSpec v1."""

from models.video_spec import VideoSpecV1, effective_background_duration
from services.video_spec_patch import apply_ops_to_spec


def _base_spec():
    return {
        "v": 1,
        "templateId": "centered-pop",
        "themeId": "bold-modern",
        "appearance": {},
        "brand": {"primary": "#fff", "accent": None},
        "background": {
            "url": "https://example.com/bg.mp4",
            "kind": "video",
            "focalPoint": "center",
            "durationSec": 12.0,
            "trimStartSec": 0,
            "trimEndSec": None,
        },
        "hook": {"text": "Hook", "durationSec": 3.0},
        "blocks": [
            {
                "id": "b0",
                "text": "Beat one",
                "isCTA": False,
                "startSec": 3.5,
                "endSec": 6.0,
                "animation": "fade",
            }
        ],
        "layout": {
            "verticalAnchor": "bottom",
            "verticalOffset": 0,
            "scale": 1,
            "sidePadding": 0.05,
            "textAlign": "center",
            "stackGap": 0.008,
            "stackGrowth": "up",
        },
        "gapBetweenBlocksSec": 0,
        "totalSec": 12,
    }


def test_patch_block_font_scale():
    spec = apply_ops_to_spec(_base_spec(), [{"op": "replace", "path": "/blocks/0/fontScale", "value": 1.25}])
    assert spec.blocks[0].fontScale == 1.25


def test_patch_hook_font_scale():
    spec = apply_ops_to_spec(_base_spec(), [{"op": "replace", "path": "/hook/fontScale", "value": 0.9}])
    assert spec.hook.fontScale == 0.9


def test_font_scale_clamped_on_load():
    raw = _base_spec()
    raw["blocks"][0]["fontScale"] = 3.5
    spec = VideoSpecV1.model_validate(raw)
    assert spec.blocks[0].fontScale == 2.0


def test_effective_background_duration_with_trim():
    spec = apply_ops_to_spec(
        _base_spec(),
        [
            {"op": "replace", "path": "/background/trimStartSec", "value": 2.0},
            {"op": "replace", "path": "/background/trimEndSec", "value": 8.0},
        ],
    )
    eff = effective_background_duration(spec.background)
    assert eff is not None
    assert abs(eff - 6.0) < 0.01


def test_relayout_preserves_hook_font_scale():
    spec = apply_ops_to_spec(_base_spec(), [{"op": "replace", "path": "/hook/fontScale", "value": 0.9}])
    assert spec.hook.fontScale == 0.9


def test_trim_relayout_caps_blocks():
    spec = apply_ops_to_spec(
        _base_spec(),
        [
            {"op": "replace", "path": "/background/trimStartSec", "value": 0.0},
            {"op": "replace", "path": "/background/trimEndSec", "value": 4.0},
            {"op": "replace", "path": "/blocks/0/endSec", "value": 10.0},
        ],
    )
    eff = effective_background_duration(spec.background)
    assert eff is not None
    assert spec.blocks[0].endSec <= eff + 0.01


def test_trim_clamps_when_start_past_end():
    raw = _base_spec()
    raw["background"]["trimStartSec"] = 10
    raw["background"]["trimEndSec"] = 5
    spec = VideoSpecV1.model_validate(raw)
    assert spec.background.trimStartSec < (spec.background.trimEndSec or 12)
