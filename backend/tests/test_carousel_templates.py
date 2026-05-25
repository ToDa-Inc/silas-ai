import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from models.generation import GenerationStartBody, SelectedCarouselTemplate, SelectedCoverTemplate
from routers.creation import carousel_slide_count_effective, _resolve_template_slide_image_bytes, _resolve_template_slide_for_idx
from services.content_generation import run_carousel_slide_texts
from services.image_generation import generate_slide_image


class CarouselTemplateModelsTest(unittest.TestCase):
    def test_generation_start_accepts_selected_carousel_template_snapshot(self):
        body = GenerationStartBody(
            source_type="idea_match",
            format_key="carousel",
            idea_text="A post about speaking up in meetings",
            selected_carousel_template={
                "id": "template_conny_tweets",
                "name": "Conny tweets",
                "description": "Cover photo, then tweet-style message screenshots",
                "slides": [
                    {
                        "idx": 0,
                        "role": "cover",
                        "reference_image_id": "img_creator",
                        "reference_image_url": "https://example.com/conny.jpg",
                        "reference_label": "Conny portrait",
                        "instruction": "Creator photo with one strong headline",
                    },
                    {
                        "idx": 1,
                        "role": "screenshot",
                        "reference_image_id": "img_tweet",
                        "reference_image_url": "https://example.com/tweet.jpg",
                        "reference_label": "Tweet screenshot",
                        "instruction": "Tweet-style screenshot with the first message",
                    },
                ],
            },
        )

        template = body.selected_carousel_template

        self.assertIsInstance(template, SelectedCarouselTemplate)
        self.assertEqual(template.name, "Conny tweets")
        self.assertEqual(len(template.slides), 2)
        self.assertEqual(template.slides[1].role, "screenshot")

    def test_generation_start_accepts_selected_cover_template_snapshot(self):
        body = GenerationStartBody(
            source_type="idea_match",
            format_key="text_overlay",
            idea_text="A reel about direct communication",
            selected_cover_template={
                "id": "cover_portrait",
                "name": "Portrait cover",
                "reference_image_id": "img_creator",
                "reference_image_url": "https://example.com/portrait.jpg",
                "reference_label": "Creator portrait",
                "instruction": "Use the face-centered portrait with large serif headline.",
            },
        )

        template = body.selected_cover_template

        self.assertIsInstance(template, SelectedCoverTemplate)
        self.assertEqual(template.name, "Portrait cover")
        self.assertEqual(template.reference_image_id, "img_creator")
        self.assertIn("serif headline", template.instruction)


class CarouselTemplatePromptTest(unittest.TestCase):
    def test_session_slide_count_overrides_request(self):
        row = {
            "carousel_slide_count": 4,
            "selected_carousel_template": {
                "slides": [{"idx": i, "role": "body"} for i in range(8)],
            },
        }
        self.assertEqual(carousel_slide_count_effective(row, requested_count=6), 4)

    def test_requested_count_when_session_unset(self):
        row: dict = {}
        self.assertEqual(carousel_slide_count_effective(row, requested_count=8), 8)

    def test_requested_count_clamped(self):
        row: dict = {}
        self.assertEqual(carousel_slide_count_effective(row, requested_count=2), 3)
        self.assertEqual(carousel_slide_count_effective(row, requested_count=11), 10)

    def test_slide_text_prompt_includes_template_sequence(self):
        captured = {}

        def fake_chat_json_completion(*args, **kwargs):
            captured["user"] = kwargs["user"]
            return {"slides": ["Cover", "Tweet one", "CTA"]}

        client_row = {
            "name": "Conny",
            "language": "en",
            "client_dna": {
                "generation_brief": "Audience: managers who struggle to speak up.",
                "voice_brief": "Direct, honest, concise.",
            },
        }
        template = {
            "id": "template_conny_tweets",
            "name": "Conny tweets",
            "description": "Cover photo, then tweet-style message screenshots",
            "slides": [
                {
                    "idx": 0,
                    "role": "cover",
                    "reference_label": "Conny portrait",
                    "instruction": "Creator photo with one strong headline",
                },
                {
                    "idx": 1,
                    "role": "screenshot",
                    "reference_label": "Tweet screenshot",
                    "instruction": "Tweet-style screenshot with the first message",
                },
                {
                    "idx": 2,
                    "role": "cta",
                    "reference_label": "CTA card",
                    "instruction": "End with a simple next step",
                },
            ],
        }

        with patch("services.content_generation.chat_json_completion", side_effect=fake_chat_json_completion):
            slides = run_carousel_slide_texts(
                type("Settings", (), {"openrouter_api_key": "key", "openrouter_model": "model"})(),
                client_row=client_row,
                chosen_angle={
                    "title": "Meeting confidence",
                    "situation": "High-stakes meeting",
                    "draft_hook": "They challenged you in front of everyone — and you started explaining.",
                    "emotional_trigger": "Shame spiral",
                    "mechanism_note": "Every justification shrinks your authority in the room.",
                },
                hook_text="They challenged you in front of everyone — and you started explaining.",
                count=3,
                selected_carousel_template=template,
            )

        self.assertEqual(slides, ["Cover", "Tweet one", "CTA"])
        self.assertIn("FIDELITY", captured["user"])
        self.assertIn("They challenged you", captured["user"])
        self.assertIn("CAROUSEL_TEMPLATE", captured["user"])
        self.assertIn("Conny tweets", captured["user"])
        self.assertIn("Tweet-style screenshot", captured["user"])


class CarouselTemplateImagePromptTest(unittest.TestCase):
    def test_generate_slide_image_forwards_visual_prompt_to_ai_background(self):
        with patch("services.image_generation.generate_thumbnail_freepik_pillow") as generate:
            generate.return_value = b"png"

            result = generate_slide_image(
                text="Tweet one",
                idx=1,
                total=3,
                freepik_key="freepik-key",
                visual_prompt="Tweet-style screenshot card, white background, black text",
            )

        self.assertEqual(result, b"png")
        self.assertIn("Tweet-style screenshot", generate.call_args.kwargs["angle_context"])

    def test_generate_slide_image_exact_base_disables_wash(self):
        with patch("services.image_generation.compose_thumbnail_from_image") as compose:
            compose.return_value = b"png"
            generate_slide_image(
                text="Hook",
                idx=0,
                total=3,
                freepik_key="freepik-key",
                client_image_bytes=b"fake-jpeg",
                wash_template_base=False,
            )
        self.assertIs(compose.call_args.kwargs.get("wash"), False)
        self.assertIs(compose.call_args.kwargs.get("carousel_exact_base"), True)
        self.assertEqual(compose.call_args.kwargs.get("carousel_slide_role"), "cover")

    def test_generate_slide_image_forwards_layout_to_compose(self):
        with patch("services.image_generation.compose_thumbnail_from_image") as compose:
            compose.return_value = b"png"
            layout = {"scale": 0.88, "verticalOffset": -0.06, "sidePadding": 0.08}
            generate_slide_image(
                text="Hook",
                idx=1,
                total=3,
                client_image_bytes=b"jpeg",
                wash_template_base=False,
                carousel_slide_role="body",
                layout=layout,
            )
        self.assertEqual(compose.call_args.kwargs.get("layout"), layout)


class CarouselTemplateResolveTest(unittest.TestCase):
    def test_resolve_template_slide_missing_reference_raises(self):
        supabase = MagicMock()
        with self.assertRaises(HTTPException) as ctx:
            _resolve_template_slide_image_bytes(supabase, "cli_1", {}, slide_idx=0)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("slide 1", ctx.exception.detail)


class CarouselSmartMappingTest(unittest.TestCase):
    def test_resolve_template_slide_empty_template(self):
        self.assertEqual(_resolve_template_slide_for_idx(0, 5, []), {})

    def test_resolve_template_slide_cover_cta_body_mapping(self):
        template_slides = [
            {"idx": 0, "role": "cover", "reference_label": "Cover picture"},
            {"idx": 1, "role": "body", "reference_label": "Body background"},
            {"idx": 2, "role": "cta", "reference_label": "CTA screen"},
        ]
        
        # 6-slide carousel
        resolved_0 = _resolve_template_slide_for_idx(0, 6, template_slides)
        self.assertEqual(resolved_0["role"], "cover")
        
        resolved_5 = _resolve_template_slide_for_idx(5, 6, template_slides)
        self.assertEqual(resolved_5["role"], "cta")
        
        # Intermediate slides should all map to body
        for i in range(1, 5):
            resolved = _resolve_template_slide_for_idx(i, 6, template_slides)
            self.assertEqual(resolved["role"], "body")

    def test_resolve_template_slide_multi_body_mapping(self):
        template_slides = [
            {"idx": 0, "role": "cover", "reference_label": "Cover picture"},
            {"idx": 1, "role": "body", "reference_label": "Body 1"},
            {"idx": 2, "role": "body", "reference_label": "Body 2"},
            {"idx": 3, "role": "cta", "reference_label": "CTA screen"},
        ]
        
        # 6-slide carousel: 
        # idx 0 -> Cover
        # idx 1 -> Body 1
        # idx 2 -> Body 2
        # idx 3 -> Body 1
        # idx 4 -> Body 2
        # idx 5 -> CTA
        self.assertEqual(_resolve_template_slide_for_idx(0, 6, template_slides)["reference_label"], "Cover picture")
        self.assertEqual(_resolve_template_slide_for_idx(1, 6, template_slides)["reference_label"], "Body 1")
        self.assertEqual(_resolve_template_slide_for_idx(2, 6, template_slides)["reference_label"], "Body 2")
        self.assertEqual(_resolve_template_slide_for_idx(3, 6, template_slides)["reference_label"], "Body 1")
        self.assertEqual(_resolve_template_slide_for_idx(4, 6, template_slides)["reference_label"], "Body 2")
        self.assertEqual(_resolve_template_slide_for_idx(5, 6, template_slides)["reference_label"], "CTA screen")

    def test_resolve_template_slide_two_slides_template(self):
        template_slides = [
            {"idx": 0, "role": "cover", "reference_label": "Cover picture"},
            {"idx": 1, "role": "cta", "reference_label": "CTA screen"},
        ]
        
        # 5-slide carousel
        # idx 0 -> Cover
        # idx 4 -> CTA
        # Intermediate (idx 1, 2, 3) must use CTA slide (as cover is excluded)
        self.assertEqual(_resolve_template_slide_for_idx(0, 5, template_slides)["reference_label"], "Cover picture")
        self.assertEqual(_resolve_template_slide_for_idx(1, 5, template_slides)["reference_label"], "CTA screen")
        self.assertEqual(_resolve_template_slide_for_idx(2, 5, template_slides)["reference_label"], "CTA screen")
        self.assertEqual(_resolve_template_slide_for_idx(3, 5, template_slides)["reference_label"], "CTA screen")
        self.assertEqual(_resolve_template_slide_for_idx(4, 5, template_slides)["reference_label"], "CTA screen")

    def test_resolve_template_slide_one_slide_template(self):
        template_slides = [
            {"idx": 0, "role": "cover", "reference_label": "Cover picture"},
        ]
        
        # 4-slide carousel
        # All slides should resolve to Cover picture
        for i in range(4):
            self.assertEqual(_resolve_template_slide_for_idx(i, 4, template_slides)["reference_label"], "Cover picture")


if __name__ == "__main__":
    unittest.main()
