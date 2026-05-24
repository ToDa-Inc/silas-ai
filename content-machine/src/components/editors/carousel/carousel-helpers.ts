/**
 * Shared carousel constants and pure helpers.
 *
 * These are consumed by:
 *   - `CarouselTextLayerEditor` — live drag/resize stage in the editor
 *   - `CarouselSection` (still in `video-create-workspace.tsx`) — the host that
 *     mounts the editor and wires the autosave loop
 *   - misc. workspace-level code that needs to merge text-box defaults
 *
 * Keep this file pure (no React imports) so it can be reused by hooks/tests
 * without dragging the component tree in.
 */

import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPlayfairDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import type {
  CarouselBackgroundStyle,
  CarouselSlide,
  CarouselTextBox,
  ClientImageRow,
} from "@/lib/api-client";

const { fontFamily: CAROUSEL_INTER_FONT } = loadInter("normal", {
  weights: ["400", "700"],
  subsets: ["latin", "latin-ext"],
});
const { fontFamily: CAROUSEL_PLAYFAIR_FONT } = loadPlayfairDisplay("normal", {
  weights: ["400", "700"],
  subsets: ["latin", "latin-ext"],
});
const { fontFamily: CAROUSEL_POPPINS_FONT } = loadPoppins("normal", {
  weights: ["400", "700"],
  subsets: ["latin", "latin-ext"],
});

export const CAROUSEL_FONT_STACKS = {
  playfair: `"${CAROUSEL_PLAYFAIR_FONT}", Georgia, "Times New Roman", serif`,
  inter: `"${CAROUSEL_INTER_FONT}", Inter, Arial, sans-serif`,
  poppins: `"${CAROUSEL_POPPINS_FONT}", Poppins, Arial, sans-serif`,
  georgia: `Georgia, "Times New Roman", serif`,
} as const;

export const CAROUSEL_FONT_LABELS: Record<keyof typeof CAROUSEL_FONT_STACKS, string> = {
  playfair: "Playfair",
  inter: "Inter",
  poppins: "Poppins",
  georgia: "Georgia",
};

export const CAROUSEL_TEXT_COLOR = "#17110d";
export const CAROUSEL_EXPORT_W = 1080;
export const CAROUSEL_EXPORT_H = 1350;
export const CAROUSEL_EDIT_W = 360;
export const CAROUSEL_EDIT_H = Math.round((CAROUSEL_EDIT_W * CAROUSEL_EXPORT_H) / CAROUSEL_EXPORT_W);
export const CAROUSEL_FONT_RATIO = 0.061;
export const CAROUSEL_MIN_SLIDES = 3;

export type CarouselFontId = keyof typeof CAROUSEL_FONT_STACKS;

/** Stable Supabase paths are reused per slide — bust cache so previews refresh after regenerate. */
export function carouselDisplayImageUrl(url: string, cacheRev?: number): string {
  const u = (url || "").trim();
  if (!u || cacheRev == null || cacheRev <= 0) return u;
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}v=${cacheRev}`;
}

export function carouselFontId(tb: CarouselTextBox): CarouselFontId {
  const f = tb.font;
  return f && f in CAROUSEL_FONT_STACKS ? f : "playfair";
}

export function mergeCarouselTextBox(slide: CarouselSlide, totalSlides: number): CarouselTextBox {
  const defaults: CarouselTextBox =
    slide.idx === 0
      ? { x: 0.5, y: 0.42, width: 0.88, align: "center", scale: 1.05, card: false, font: "playfair" }
      : slide.idx === totalSlides - 1
        ? { x: 0.5, y: 0.85, width: 0.8, align: "center", scale: 1.0, card: true, font: "playfair" }
        : { x: 0.5, y: 0.82, width: 0.84, align: "center", scale: 1.0, card: false, font: "playfair" };
  return { ...defaults, ...(slide.text_box ?? {}) };
}

export function mergeCarouselBackgroundStyle(slide: CarouselSlide): CarouselBackgroundStyle {
  return {
    overlay_color: "#ffffff",
    overlay_opacity: 0,
    ...(slide.background_style ?? {}),
  };
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function clampRange(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Resolve the client image row that a slide's background came from (if any). */
export function clientImageIdForSlide(slide: CarouselSlide, images: ClientImageRow[]): string {
  const u = (slide.base_image_url || slide.image_url || "").trim().split("?")[0] ?? "";
  if (!u) return "";
  const match = images.find((img) => {
    const file = (img.file_url || "").trim().split("?")[0] ?? "";
    return file && (u === file || u.endsWith(file) || file.endsWith(u));
  });
  return match?.id ?? "";
}
