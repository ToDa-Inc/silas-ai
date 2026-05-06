import unittest
from io import BytesIO
from unittest.mock import patch

from PIL import Image

from services.image_generation import compose_carousel_final_png, generate_slide_image


class GenerateSlideImageTest(unittest.TestCase):
    def test_defaults_to_instagram_carousel_dimensions_for_ai_background(self):
        with patch("services.image_generation.generate_thumbnail_freepik_pillow") as generate:
            generate.return_value = b"png"

            result = generate_slide_image(
                text="Hook",
                idx=0,
                total=3,
                freepik_key="freepik-key",
            )

        self.assertEqual(result, b"png")
        self.assertEqual(generate.call_args.kwargs["target_w"], 1080)
        self.assertEqual(generate.call_args.kwargs["target_h"], 1350)

    def test_defaults_to_instagram_carousel_dimensions_for_client_image(self):
        with patch("services.image_generation.compose_thumbnail_from_image") as compose:
            compose.return_value = b"png"

            result = generate_slide_image(
                text="Hook",
                idx=0,
                total=3,
                client_image_bytes=b"image",
            )

        self.assertEqual(result, b"png")
        self.assertEqual(compose.call_args.kwargs["target_w"], 1080)
        self.assertEqual(compose.call_args.kwargs["target_h"], 1350)

    def test_text_box_path_composes_without_legacy_compose_thumbnail(self):
        with patch("services.image_generation.prepare_carousel_base_png_bytes") as prep:
            prep.return_value = b"basepng"
            with patch("services.image_generation.compose_carousel_final_png") as comp:
                comp.return_value = b"finalpng"
                result = generate_slide_image(
                    text="Hello",
                    idx=1,
                    total=3,
                    client_image_bytes=b"image",
                    wash_template_base=False,
                    text_box={"x": 0.5, "y": 0.8, "width": 0.84, "align": "center", "scale": 1.0, "card": False},
                )
        self.assertEqual(result, b"finalpng")
        prep.assert_called_once()
        comp.assert_called_once()

    def test_compose_carousel_final_png_normalizes_legacy_base_dimensions(self):
        base = Image.new("RGB", (1080, 1920), (255, 255, 255))
        buf = BytesIO()
        base.save(buf, format="PNG")

        out = compose_carousel_final_png(
            buf.getvalue(),
            "Hello",
            {"x": 0.5, "y": 0.5, "width": 0.8, "align": "center", "scale": 1.0},
        )

        rendered = Image.open(BytesIO(out))
        self.assertEqual(rendered.size, (1080, 1350))


if __name__ == "__main__":
    unittest.main()
