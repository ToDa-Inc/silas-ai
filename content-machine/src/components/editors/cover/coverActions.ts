/**
 * coverActions — action provider for the Cover editor.
 *
 * Consumed by both `EditorCommandPalette` (⌘K) and inspector buttons via
 * `actionById(registry, "cover.headline.regenerate").run()`. The host passes
 * in the cover-edit/regen callbacks; this file just wraps them in
 * EditorAction metadata.
 */

import type { EditorAction } from "../shared/actionRegistry";
import type { CoverEditState } from "@/lib/cover-edit";

export type CoverActionsHost = {
  coverEdit: CoverEditState;
  coverRegenBusy: boolean;
  thumbnailBusy: boolean;
  hasAiCover: boolean;
  hasImagePicked: boolean;

  regenerateCoverIdeas: () => void;
  generateAiCover: () => void;
  composeCoverFromImage: () => void;
  toggleWash: () => void;
  toggleOutline: () => void;
};

export function buildCoverActions(host: CoverActionsHost): EditorAction[] {
  const {
    coverEdit,
    coverRegenBusy,
    thumbnailBusy,
    hasAiCover,
    hasImagePicked,
    regenerateCoverIdeas,
    generateAiCover,
    composeCoverFromImage,
    toggleWash,
    toggleOutline,
  } = host;

  const outlineOn = coverEdit.textTreatment === "bold-outline";

  return [
    // ──────────── Text ────────────
    {
      id: "cover.headline.regenerate",
      label: "Generate new headline ideas",
      shortLabel: "Ideas",
      group: "Text",
      keywords: ["headline", "title", "regenerate"],
      disabled: coverRegenBusy,
      run: () => {
        regenerateCoverIdeas();
      },
    },

    // ──────────── Visual ────────────
    {
      id: "cover.background.darken.toggle",
      label: coverEdit.wash ? "Stop darkening background" : "Darken background",
      shortLabel: coverEdit.wash ? "Lighten" : "Darken",
      group: "Visual",
      description: "Mutes the photo so the headline stands out",
      keywords: ["wash", "overlay", "dim"],
      run: () => {
        toggleWash();
      },
    },
    {
      id: "cover.style.outline.toggle",
      label: outlineOn ? "Use normal lettering" : "Use bold outline lettering",
      shortLabel: outlineOn ? "Outline off" : "Outline on",
      group: "Visual",
      run: () => {
        toggleOutline();
      },
    },

    // ──────────── Render ────────────
    {
      id: "cover.generate.ai",
      label: hasAiCover ? "Regenerate cover with AI" : "Generate cover with AI",
      group: "Render",
      keywords: ["ai", "image", "generate"],
      disabled: thumbnailBusy,
      run: () => {
        generateAiCover();
      },
    },
    {
      id: "cover.compose.image",
      label: "Compose cover from selected photo",
      group: "Render",
      keywords: ["photo", "client", "compose"],
      disabled: thumbnailBusy || !hasImagePicked,
      run: () => {
        composeCoverFromImage();
      },
    },
  ];
}
