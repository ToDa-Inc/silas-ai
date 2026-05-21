import unittest

from services.cover_text_layout import (
    COVER_EXPORT_H,
    COVER_EXPORT_W,
    compute_cover_text_block,
    cover_base_font_size,
    resolve_cover_font_id,
    wrap_cover_lines_heuristic,
)


class CoverTextLayoutTest(unittest.TestCase):
    def test_resolve_font_id_from_appearance(self):
        self.assertEqual(resolve_cover_font_id({"fontId": "inter"}, "bold-modern"), "inter")

    def test_resolve_font_id_theme_fallback(self):
        self.assertEqual(resolve_cover_font_id({}, "editorial"), "playfair")

    def test_base_font_size_matches_export_formula(self):
        self.assertEqual(cover_base_font_size(1080, 1.0), max(42, int(1080 * 0.082)))

    def test_center_block_not_using_css_translate_center(self):
        text = "Warum das System keine Gerechtigkeit sucht"
        font_size = cover_base_font_size(COVER_EXPORT_W, 1.0)
        lines = wrap_cover_lines_heuristic(text, font_size, int(COVER_EXPORT_W * 0.9))
        block = compute_cover_text_block(
            text,
            template_id="bottom-card",
            layout={"verticalAnchor": "center", "verticalOffset": 0, "scale": 1, "sidePadding": 0.05},
            wrapped_lines=lines,
            font_size=font_size,
        )
        self.assertGreater(block.y_top, 0)
        self.assertLess(block.y_top + block.total_h, COVER_EXPORT_H)
        mid = block.y_top + block.total_h / 2
        self.assertAlmostEqual(mid, COVER_EXPORT_H * 0.47, delta=COVER_EXPORT_H * 0.08)


if __name__ == "__main__":
    unittest.main()
