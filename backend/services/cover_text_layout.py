"""Shared reel-cover text layout — single source of truth for Pillow export.

Keep ``content-machine/src/lib/cover-text-layout.ts`` in sync when changing formulas.
"""

from __future__ import annotations

import textwrap
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional, Tuple

COVER_EXPORT_W = 1080
COVER_EXPORT_H = 1920

@dataclass(frozen=True)
class CoverTextBlockLayout:
    """Pixel geometry for one cover headline block at export resolution (1080×1920)."""

    font_size: int
    line_spacing: int
    wrapped_lines: Tuple[str, ...]
    total_h: int
    y_top: int
    left: int
    text_area_w: int
    card_pad: int
    card_radius: int
    card_like: bool
    align: str
    text_pan_x: float


def _as_dict(value: Any) -> Dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    dump = getattr(value, "model_dump", None)
    if callable(dump):
        return dump(mode="json")
    return {}


def resolve_cover_font_id(appearance: Dict[str, Any], theme_id: str) -> str:
    """Match ``coverPreviewFontFamily`` in the content-machine workspace."""
    fid = str(appearance.get("fontId") or "").strip().lower()
    if fid in ("playfair", "inter", "poppins", "patrick"):
        return fid
    tid = str(theme_id or "bold-modern").strip().lower()
    if tid == "casual-hand":
        return "patrick"
    if tid == "clean-minimal":
        return "inter"
    if tid == "editorial":
        return "playfair"
    return "poppins"


def cover_size_scale(layout_scale: float, *, carousel_exact_base: bool = False, role: str = "body") -> float:
    legacy = 1.0
    scale = float(layout_scale if layout_scale is not None else legacy)
    if carousel_exact_base:
        exact_base = 0.062 if role == "cover" else 0.066
        return exact_base * max(0.78, min(1.15, scale))
    return 0.082 * max(0.7, min(1.3, scale))


def cover_base_font_size(frame_w: int, layout_scale: float, *, carousel_exact_base: bool = False, role: str = "body") -> int:
    size_scale = cover_size_scale(layout_scale, carousel_exact_base=carousel_exact_base, role=role)
    return max(42, int(frame_w * size_scale))


def cover_side_padding(layout: Dict[str, Any], *, carousel_exact_base: bool = False) -> float:
    default = 0.08 if carousel_exact_base else 0.05
    return max(0.02, min(0.14, float(layout.get("sidePadding") or default)))


def cover_resolve_vertical_pos(
    template_id: str,
    layout: Dict[str, Any],
    text_position: str,
) -> Literal["top", "center", "bottom"]:
    template = str(template_id or "centered-pop")
    vertical_anchor = str(layout.get("verticalAnchor") or "").lower()
    if vertical_anchor in ("top", "center", "bottom"):
        pos = vertical_anchor
    else:
        pos = str(text_position).lower()
    if template == "top-banner":
        return "top"
    if pos in ("top", "center", "bottom"):
        return pos  # type: ignore[return-value]
    return "center"


def cover_y_top(
    frame_h: int,
    total_h: int,
    pos: str,
    vertical_offset: float,
    *,
    carousel_exact_base: bool = False,
) -> int:
    vertical_offset = max(-1.0, min(1.0, float(vertical_offset or 0.0)))
    if pos == "top":
        y = int(frame_h * 0.16)
    elif pos == "bottom":
        bottom_margin = 0.10 if carousel_exact_base else 0.16
        y = frame_h - total_h - int(frame_h * bottom_margin)
    else:
        y = (frame_h - total_h) // 2 - int(frame_h * 0.03)
    return int(y + vertical_offset * frame_h)


def wrap_cover_lines_heuristic(text: str, font_size: int, text_area_w: int) -> List[str]:
    """Same character-width heuristic as legacy ``_overlay_text`` (no font metrics yet)."""
    avg_char_px = max(font_size * 0.48, 8.0)
    wrap_chars = max(18, min(52, int(text_area_w / avg_char_px)))
    return textwrap.wrap(
        text,
        width=wrap_chars,
        break_long_words=True,
        break_on_hyphens=True,
    ) or [text]


def compute_cover_text_block(
    text: str,
    *,
    frame_w: int = COVER_EXPORT_W,
    frame_h: int = COVER_EXPORT_H,
    template_id: str = "centered-pop",
    layout: Any = None,
    text_position: str = "center",
    layout_scale: Optional[float] = None,
    wrapped_lines: Optional[List[str]] = None,
    font_size: Optional[int] = None,
    total_body_h: Optional[int] = None,
    carousel_exact_base: bool = False,
    carousel_slide_role: str = "body",
) -> CoverTextBlockLayout:
    """Compute block geometry. Pass ``wrapped_lines`` + ``font_size`` when measured with a real font."""
    layout_d = _as_dict(layout)
    scale = float(layout_scale if layout_scale is not None else layout_d.get("scale") or 1.0)
    role = str(carousel_slide_role or "body").strip().lower()

    if font_size is None:
        font_size = cover_base_font_size(frame_w, scale, carousel_exact_base=carousel_exact_base, role=role)

    side_padding = cover_side_padding(layout_d, carousel_exact_base=carousel_exact_base)
    text_area_w = max(1, int(frame_w * (1.0 - side_padding * 2.0)))
    left = int(frame_w * side_padding)

    if wrapped_lines is None:
        lines = wrap_cover_lines_heuristic(text, font_size, text_area_w)
    else:
        lines = wrapped_lines or [text]

    line_spacing = int(font_size * (1.26 if carousel_exact_base else 1.28))
    total_h = int(total_body_h) if total_body_h is not None else line_spacing * len(lines)
    pos = cover_resolve_vertical_pos(template_id, layout_d, text_position)
    vertical_offset = float(layout_d.get("verticalOffset") or 0.0)
    y_top = cover_y_top(frame_h, total_h, pos, vertical_offset, carousel_exact_base=carousel_exact_base)

    template = str(template_id or "centered-pop")
    card_like = template in ("bottom-card", "top-banner", "stacked-cards")
    align = str(layout_d.get("textAlign") or "center").lower()
    if align not in ("left", "center", "right"):
        align = "center"
    text_pan_x = max(-1.0, min(1.0, float(layout_d.get("textPanX") or 0.0)))
    card_pad = max(10, int(font_size * (0.35 if carousel_exact_base else 0.38)))
    card_radius = max(14 if carousel_exact_base else 16, int(font_size * (0.25 if carousel_exact_base else 0.28)))

    return CoverTextBlockLayout(
        font_size=font_size,
        line_spacing=line_spacing,
        wrapped_lines=tuple(lines),
        total_h=total_h,
        y_top=y_top,
        left=left,
        text_area_w=text_area_w,
        card_pad=card_pad,
        card_radius=card_radius,
        card_like=card_like,
        align=align,
        text_pan_x=text_pan_x,
    )
