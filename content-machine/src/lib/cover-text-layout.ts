/**
 * Reel cover text layout — mirrors ``backend/services/cover_text_layout.py`` + Pillow wrap/fit.
 * Preview uses canvas measurement (bold) so line breaks match export.
 */

import type { VideoSpecAppearance, VideoSpecLayout } from "./video-spec";

export const COVER_EXPORT_W = 1080;
export const COVER_EXPORT_H = 1920;

const COVER_MAX_BODY_FRAC = 0.5;
const COVER_MAX_LINES = 7;
const COVER_FIT_STEPS = 14;

export type CoverVerticalPos = "top" | "center" | "bottom";

export type CoverTextBlockPreview = {
  fontSizePx: number;
  lineGapPx: number;
  lines: string[];
  lineHeightsPx: number[];
  totalHeightPx: number;
  topPx: number;
  leftPx: number;
  widthPx: number;
  cardPadPx: number;
  borderRadiusPx: number;
  cardLike: boolean;
  textPanXPx: number;
  cardLeftPx: number;
  cardTopPx: number;
  cardWidthPx: number;
  cardHeightPx: number;
};

export function resolveCoverFontId(
  appearance: VideoSpecAppearance,
  themeId: string,
): "playfair" | "inter" | "poppins" | "patrick" {
  const fid = appearance.fontId;
  if (fid === "playfair" || fid === "inter" || fid === "poppins" || fid === "patrick") return fid;
  if (themeId === "casual-hand") return "patrick";
  if (themeId === "clean-minimal") return "inter";
  if (themeId === "editorial") return "playfair";
  return "poppins";
}

export function coverSizeScale(layoutScale: number): number {
  return 0.082 * Math.min(1.3, Math.max(0.7, layoutScale));
}

export function coverBaseFontSize(frameW: number, layoutScale: number): number {
  return Math.max(42, Math.floor(frameW * coverSizeScale(layoutScale)));
}

export function coverSidePadding(layout: VideoSpecLayout): number {
  const raw = layout.sidePadding ?? 0.05;
  return Math.min(0.14, Math.max(0.02, raw));
}

export function coverResolveVerticalPos(
  templateId: string,
  layout: VideoSpecLayout,
  textPosition = "center",
): CoverVerticalPos {
  const anchor = layout.verticalAnchor;
  let pos: CoverVerticalPos =
    anchor === "top" || anchor === "center" || anchor === "bottom" ? anchor : "center";
  if ((textPosition === "top" || textPosition === "bottom") && !anchor) pos = textPosition;
  if (templateId === "top-banner") return "top";
  return pos;
}

export function coverYTop(
  frameH: number,
  totalH: number,
  pos: CoverVerticalPos,
  verticalOffset: number,
): number {
  const off = Math.min(1, Math.max(-1, verticalOffset));
  let y: number;
  if (pos === "top") {
    y = frameH * 0.16;
  } else if (pos === "bottom") {
    y = frameH - totalH - frameH * 0.16;
  } else {
    y = (frameH - totalH) / 2 - frameH * 0.03;
  }
  return Math.round(y + off * frameH);
}

function canvasContext(fontSize: number, fontFamily: string): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  return ctx;
}

function measureLineWidth(ctx: CanvasRenderingContext2D, text: string): number {
  return Math.max(0, ctx.measureText(text).width);
}

/** Same algorithm as ``_wrap_lines_pixel_width`` in image_generation.py */
export function wrapCoverLinesPixelWidth(
  text: string,
  maxWidthPx: number,
  fontSize: number,
  fontFamily: string,
): string[] {
  const ctx = canvasContext(fontSize, fontFamily);
  if (!ctx) return wrapCoverLinesHeuristic(text, fontSize, maxWidthPx);

  const cleaned = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const words = cleaned.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const candidate = cur ? `${cur} ${word}` : word;
    if (measureLineWidth(ctx, candidate) <= maxWidthPx) {
      cur = candidate;
      continue;
    }
    if (cur) {
      lines.push(cur);
      cur = "";
    }
    if (measureLineWidth(ctx, word) <= maxWidthPx) {
      cur = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const cand = chunk + ch;
      if (measureLineWidth(ctx, cand) <= maxWidthPx) chunk = cand;
      else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    if (chunk) cur = chunk;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [cleaned];
}

export function wrapCoverLinesHeuristic(text: string, fontSize: number, textAreaW: number): string[] {
  const avgCharPx = Math.max(fontSize * 0.48, 8);
  const wrapChars = Math.max(18, Math.min(52, Math.floor(textAreaW / avgCharPx)));
  const words = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= wrapChars) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function lineHeightPx(ctx: CanvasRenderingContext2D, line: string, fontSize: number): number {
  const m = ctx.measureText(line);
  const ascent = m.actualBoundingBoxAscent ?? m.fontBoundingBoxAscent ?? fontSize * 0.82;
  const descent = m.actualBoundingBoxDescent ?? m.fontBoundingBoxDescent ?? fontSize * 0.18;
  // Canvas bbox can be shorter than CSS glyphs — never under-count vs font size.
  return Math.max(Math.ceil(fontSize * 1.05), Math.max(1, Math.ceil(ascent + descent)));
}

export function fitCoverTextLines(
  text: string,
  frameW: number,
  frameH: number,
  layoutScale: number,
  textAreaW: number,
  fontFamily: string,
): { fontSize: number; lines: string[]; lineGap: number; totalH: number } {
  const base = coverBaseFontSize(frameW, layoutScale);
  const ctx = canvasContext(base, fontFamily);
  if (!ctx) {
    const fontSize = base;
    const lines = wrapCoverLinesHeuristic(text, fontSize, textAreaW);
    const lineGap = Math.floor(fontSize * 0.28);
    return { fontSize, lines, lineGap, totalH: lineGap * Math.max(0, lines.length - 1) + lines.length * Math.floor(fontSize * 1.1) };
  }
  for (let step = 0; step < COVER_FIT_STEPS; step++) {
    const fontSize = Math.max(32, Math.floor(base * 0.88 ** step));
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    const lines = wrapCoverLinesPixelWidth(text, textAreaW, fontSize, fontFamily);
    const heights = lines.map((ln) => lineHeightPx(ctx, ln, fontSize));
    const lineGap = Math.max(6, Math.floor(fontSize * 0.28));
    const totalH = heights.reduce((a, b) => a + b, 0) + lineGap * Math.max(0, lines.length - 1);
    if (totalH <= frameH * COVER_MAX_BODY_FRAC && lines.length <= COVER_MAX_LINES) {
      return { fontSize, lines, lineGap, totalH };
    }
  }
  const fontSize = Math.max(32, base);
  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  const lines = wrapCoverLinesPixelWidth(text, textAreaW, fontSize, fontFamily);
  const heights = lines.map((ln) => lineHeightPx(ctx, ln));
  const lineGap = Math.max(6, Math.floor(fontSize * 0.28));
  const totalH = heights.reduce((a, b) => a + b, 0) + lineGap * Math.max(0, lines.length - 1);
  return { fontSize, lines, lineGap, totalH };
}

/** Layout at export resolution, scaled to the editor stage. Call from client (useLayoutEffect). */
export function computeCoverTextBlockPreview(
  text: string,
  stageW: number,
  stageH: number,
  opts: {
    templateId: string;
    layout: VideoSpecLayout;
    textPosition?: string;
    fontFamily: string;
  },
): CoverTextBlockPreview {
  const { templateId, layout, fontFamily } = opts;
  const scale = layout.scale ?? 1;
  const sidePadding = coverSidePadding(layout);
  const textAreaW = Math.max(1, Math.floor(COVER_EXPORT_W * (1 - sidePadding * 2)));
  const leftExport = Math.floor(COVER_EXPORT_W * sidePadding);

  const { fontSize, lines, lineGap, totalH } = fitCoverTextLines(
    text,
    COVER_EXPORT_W,
    COVER_EXPORT_H,
    scale,
    textAreaW,
    fontFamily,
  );
  const totalHExport = totalH;
  const pos = coverResolveVerticalPos(templateId, layout, opts.textPosition);
  const yTopExport = coverYTop(COVER_EXPORT_H, totalHExport, pos, layout.verticalOffset ?? 0);

  const cardLike =
    templateId === "bottom-card" || templateId === "top-banner" || templateId === "stacked-cards";
  const cardPadExport = Math.max(10, Math.floor(fontSize * 0.38));
  const radiusExport = Math.max(16, Math.floor(fontSize * 0.28));
  const textPanX = Math.min(1, Math.max(-1, layout.textPanX ?? 0));

  const cardLeftExport = leftExport - cardPadExport;
  const cardTopExport = yTopExport - cardPadExport;
  const cardWidthExport = textAreaW + cardPadExport * 2;
  const cardHeightExport = totalHExport + cardPadExport * 2;

  const sx = stageW / COVER_EXPORT_W;
  const sy = stageH / COVER_EXPORT_H;

  const ctx = canvasContext(fontSize, fontFamily);
  const lineHeightsExport = ctx
    ? lines.map((ln) => lineHeightPx(ctx, ln, fontSize))
    : lines.map(() => Math.floor(fontSize * 1.1));
  const lineGapExport = lineGap;

  return {
    fontSizePx: Math.max(12, Math.round(fontSize * sx)),
    lineGapPx: Math.round(lineGapExport * sy),
    lines,
    lineHeightsPx: lineHeightsExport.map((h) => Math.max(1, Math.round(h * sy))),
    totalHeightPx: Math.round(totalHExport * sy),
    topPx: Math.round(yTopExport * sy),
    leftPx: Math.round(leftExport * sx),
    widthPx: Math.round(textAreaW * sx),
    cardPadPx: Math.round(cardPadExport * sy),
    borderRadiusPx: Math.round(radiusExport * sx),
    cardLike,
    textPanXPx: textPanX * stageW,
    cardLeftPx: Math.round(cardLeftExport * sx),
    cardTopPx: Math.round(cardTopExport * sy),
    cardWidthPx: Math.round(cardWidthExport * sx),
    cardHeightPx: Math.round(cardHeightExport * sy),
  };
}
