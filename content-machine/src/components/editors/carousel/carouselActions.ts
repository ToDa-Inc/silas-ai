/**
 * carouselActions — action provider for the Carousel editor.
 *
 * Consumed by `EditorCommandPalette` (⌘K) and inspector buttons via
 * `actionById(registry, "carousel.regenerate.slide").run()`.
 */

import type { EditorAction } from "../shared/actionRegistry";

export type CarouselActionsHost = {
  selectedSlideIdx: number | null;
  slideCount: number;
  busy: boolean;
  generating: boolean;
  needsEditableConversion: boolean;
  canRemoveSlide: boolean;

  generateAllSlides: () => void | Promise<void>;
  convertToEditable: () => void | Promise<void>;
  regenerateSlideAi: (idx: number, text: string) => void | Promise<void>;
  removeSlide: (idx: number) => void | Promise<void>;
  applyTextStyleToAll: (idx: number) => void | Promise<void>;
  applyBackgroundToAll: (idx: number) => void | Promise<void>;
  /** Used to grab the text for a slide when regenerating. */
  getSlideText: (idx: number) => string;
};

export function buildCarouselActions(host: CarouselActionsHost): EditorAction[] {
  const {
    selectedSlideIdx,
    slideCount,
    busy,
    generating,
    needsEditableConversion,
    canRemoveSlide,
    generateAllSlides,
    convertToEditable,
    regenerateSlideAi,
    removeSlide,
    applyTextStyleToAll,
    applyBackgroundToAll,
    getSlideText,
  } = host;

  const hasSelectedSlide = selectedSlideIdx != null;

  return [
    // ──────────── Render ────────────
    {
      id: "carousel.generate.all",
      label: slideCount > 0 ? "Regenerate all slides" : "Generate slides",
      group: "Render",
      keywords: ["all", "ai", "build"],
      disabled: generating || busy,
      run: () => {
        void generateAllSlides();
      },
    },
    {
      id: "carousel.convert.editable",
      label: "Enable text editing on all slides",
      group: "Render",
      keywords: ["convert", "editable", "split"],
      appliesTo: () => needsEditableConversion,
      disabled: busy,
      run: () => {
        void convertToEditable();
      },
    },
    {
      id: "carousel.regenerate.slide",
      label: "Regenerate background of selected slide with AI",
      shortLabel: "Regenerate",
      group: "Visual",
      keywords: ["ai", "background", "image"],
      appliesTo: () => hasSelectedSlide,
      disabled: busy,
      run: () => {
        if (selectedSlideIdx == null) return;
        void regenerateSlideAi(selectedSlideIdx, getSlideText(selectedSlideIdx));
      },
    },

    // ──────────── Brand (apply-to-all) ────────────
    {
      id: "carousel.text.sync.all",
      label: "Sync this slide's text style to all slides",
      group: "Brand",
      appliesTo: () => hasSelectedSlide && slideCount > 1,
      disabled: busy,
      run: () => {
        if (selectedSlideIdx == null) return;
        void applyTextStyleToAll(selectedSlideIdx);
      },
    },
    {
      id: "carousel.background.sync.all",
      label: "Apply this slide's darken setting to all slides",
      group: "Brand",
      appliesTo: () => hasSelectedSlide && slideCount > 1,
      disabled: busy,
      run: () => {
        if (selectedSlideIdx == null) return;
        void applyBackgroundToAll(selectedSlideIdx);
      },
    },

    // ──────────── Visual (slide management) ────────────
    {
      id: "carousel.slide.remove",
      label: "Remove selected slide",
      group: "Visual",
      keywords: ["delete", "trash"],
      appliesTo: () => hasSelectedSlide && canRemoveSlide,
      disabled: busy,
      run: () => {
        if (selectedSlideIdx == null) return;
        void removeSlide(selectedSlideIdx);
      },
    },
  ];
}
