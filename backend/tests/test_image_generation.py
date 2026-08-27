import unittest
from io import BytesIO
from unittest.mock import patch

from PIL import Image

from services.image_generation import (
    _download_image_bytes,
    _freepik_task_id,
    _looks_like_image_bytes,
    compose_carousel_final_png,
    generate_slide_image,
)


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


class FreepikDownloadHelpersTest(unittest.TestCase):
    def test_task_id_from_data(self):
        self.assertEqual(_freepik_task_id({"data": {"task_id": "abc"}}), "abc")
        self.assertEqual(_freepik_task_id({"data": {"id": "xyz"}}), "xyz")

    def test_task_id_rejects_empty(self):
        with self.assertRaises(RuntimeError):
            _freepik_task_id({"data": {}})
        with self.assertRaises(RuntimeError):
            _freepik_task_id({"message": "nope"})

    def test_image_magic_bytes(self):
        self.assertTrue(_looks_like_image_bytes(b"\x89PNG\r\n\x1a\nxxxx"))
        self.assertTrue(_looks_like_image_bytes(b"\xff\xd8\xff\x00"))
        self.assertFalse(_looks_like_image_bytes(b"<html>redirect</html>"))
        self.assertFalse(_looks_like_image_bytes(b""))

    def test_download_uses_follow_redirects(self):
        png = b"\x89PNG\r\n\x1a\n" + b"x" * 40

        class FakeResp:
            status_code = 200
            content = png

            def raise_for_status(self) -> None:
                return None

        class FakeClient:
            def __init__(self, *args, **kwargs):
                self.kwargs = kwargs

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def get(self, url):
                assert self.kwargs.get("follow_redirects") is True
                return FakeResp()

        with patch("services.image_generation.httpx.Client", FakeClient):
            out = _download_image_bytes("https://example.com/go")
        self.assertEqual(out, png)


if __name__ == "__main__":
    unittest.main()
