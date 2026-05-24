/**
 * Shared style helpers for Cover and Video editors.
 *
 * Tiny presentational primitives + style constants + theme lookup tables that
 * are used by both the Reel cover editor and the Video editor's Look tab.
 * Pure (no app state) — safe to import anywhere.
 */

import { loadFont as loadPatrickHand } from "@remotion/google-fonts/PatrickHand";
import type { VideoSpec, VideoSpecAppearance } from "@/lib/video-spec";
import { CAROUSEL_FONT_STACKS } from "../carousel/carousel-helpers";

const { fontFamily: COVER_PATRICK_FONT } = loadPatrickHand("normal", {
  weights: ["400"],
  subsets: ["latin", "latin-ext"],
});

export type UiFormat = "center" | "card" | "stack";

export const STYLE_CHIP_ON =
  "border-amber-500 bg-amber-500/15 text-amber-200 shadow-[0_0_0_1px_rgba(245,158,11,0.4)]";
export const STYLE_CHIP_OFF =
  "border-app-divider text-app-fg-muted hover:border-amber-500/40 hover:text-app-fg";

export function layoutFormatFromTemplateId(
  id: VideoSpec["templateId"] | undefined | null,
): UiFormat {
  switch (id) {
    case "bottom-card":
    case "top-banner":
      return "card";
    case "stacked-cards":
      return "stack";
    case "centered-pop":
    case "capcut-highlight":
    default:
      return "center";
  }
}

export function FormatGlyph({ format }: { format: UiFormat }) {
  const shell =
    "relative flex h-6 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-zinc-950/80";
  switch (format) {
    case "center":
      return (
        <span className={shell} aria-hidden>
          <span className="h-2.5 w-3 rounded-sm bg-app-fg-muted/40" />
        </span>
      );
    case "card":
      return (
        <span className={shell} aria-hidden>
          <span className="absolute bottom-0.5 left-0.5 right-0.5 h-1 rounded-sm bg-app-fg-muted/45" />
        </span>
      );
    case "stack":
      return (
        <span className={shell} aria-hidden>
          <span className="flex flex-col gap-0.5">
            <span className="mx-auto h-0.5 w-4 rounded-full bg-app-fg-muted/35" />
            <span className="mx-auto h-0.5 w-4 rounded-full bg-app-fg-muted/35" />
            <span className="mx-auto h-0.5 w-4 rounded-full bg-app-fg-muted/35" />
          </span>
        </span>
      );
    default:
      return <span className={shell} aria-hidden />;
  }
}

export function OutlineGlyph() {
  const shell =
    "relative flex h-6 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-zinc-950/80";
  return (
    <span className={shell} aria-hidden>
      <span
        className="text-[8px] font-black leading-none text-app-fg-muted/80"
        style={{ WebkitTextStroke: "0.6px currentColor" }}
      >
        Aa
      </span>
    </span>
  );
}

export const LOOK_VISUAL: {
  id: VideoSpec["themeId"];
  label: string;
  title: string;
  fontFamily: string;
  swatches: string[];
}[] = [
  {
    id: "bold-modern",
    label: "Bold",
    title: "Heavy sans, high contrast — good for promos",
    fontFamily: "ui-sans-serif, system-ui",
    swatches: ["#ffffff", "#0a0a0a", "#f59e0b"],
  },
  {
    id: "editorial",
    label: "Editorial",
    title: "Magazine-style serif, refined spacing",
    fontFamily: "Georgia, 'Times New Roman', serif",
    swatches: ["#faf8f5", "#1a1a1a", "#c4a574"],
  },
  {
    id: "casual-hand",
    label: "Hand",
    title: "Friendly handwritten feel",
    fontFamily: "'Segoe Print', 'Bradley Hand', cursive",
    swatches: ["#1f2937", "#ffffff", "#fbbf24"],
  },
  {
    id: "clean-minimal",
    label: "Minimal",
    title: "Thin weights, understated glass",
    fontFamily: "ui-sans-serif, system-ui",
    swatches: ["rgba(20,20,20,0.55)", "#ffffff", "#94a3b8"],
  },
];

export const COVER_PATRICK_FONT_FAMILY = COVER_PATRICK_FONT;

export function coverPreviewFontFamily(
  themeId: VideoSpec["themeId"],
  a: VideoSpecAppearance,
): string {
  const fid = a.fontId;
  if (fid === "poppins") return CAROUSEL_FONT_STACKS.poppins;
  if (fid === "inter") return CAROUSEL_FONT_STACKS.inter;
  if (fid === "playfair") return CAROUSEL_FONT_STACKS.playfair;
  if (fid === "patrick")
    return `"${COVER_PATRICK_FONT}", "Segoe Print", "Bradley Hand", cursive`;
  const look = LOOK_VISUAL.find((t) => t.id === themeId);
  return look?.fontFamily ?? CAROUSEL_FONT_STACKS.playfair;
}

export function appearanceHasSavedOverrides(a: VideoSpecAppearance): boolean {
  return Boolean(
    a.fontId ||
      (a.cardTextColor && String(a.cardTextColor).trim()) ||
      (a.overlayTextColor && String(a.overlayTextColor).trim()) ||
      (a.cardBg && String(a.cardBg).trim()) ||
      (a.overlayStroke && String(a.overlayStroke).trim()),
  );
}
