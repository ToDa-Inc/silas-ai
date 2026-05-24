import type { VideoSpecAppearance, VideoTextTreatmentId } from "./schema";

export type CaptionLayerInput = {
  hook: { text?: string | null; durationSec: number; fontScale?: number | null };
  blocks: Array<{
    id: string;
    text?: string | null;
    isCTA: boolean;
    startSec: number;
    endSec: number;
    animation?: "pop" | "fade" | "slide-up" | "none" | null;
    appearance?: VideoSpecAppearance | null;
    textTreatment?: VideoTextTreatmentId | null;
    fontScale?: number | null;
  }>;
};

export type ActiveCaptionLayer = {
  key: string;
  text: string;
  isCTA: boolean;
  startSec: number;
  animation: "pop" | "fade" | "slide-up" | "none";
  kind: "hook" | "block";
  appearance?: VideoSpecAppearance | null;
  textTreatment?: VideoTextTreatmentId | null;
  /** Per-beat multiplier on top of global ``layout.scale``; default 1. */
  fontScale?: number | null;
};

export function beatFontScaleMult(layer: ActiveCaptionLayer): number {
  const v = layer.fontScale;
  return v != null && Number.isFinite(v) && v > 0 ? v : 1;
}

export function activeCaptionLayers(spec: CaptionLayerInput, sec: number): ActiveCaptionLayer[] {
  const layers: ActiveCaptionLayer[] = [];
  const hookText = String(spec.hook.text ?? "").trim();
  if (hookText && sec >= 0 && sec < spec.hook.durationSec) {
    layers.push({
      key: "hook",
      text: hookText,
      isCTA: false,
      startSec: 0,
      animation: "fade",
      kind: "hook",
      fontScale: spec.hook.fontScale ?? undefined,
    });
  }

  [...spec.blocks]
    .sort((a, b) => a.startSec - b.startSec)
    .forEach((b) => {
      const text = String(b.text ?? "").trim();
      if (!text || sec < b.startSec || sec >= b.endSec) return;
      layers.push({
        key: b.id,
        text,
        isCTA: Boolean(b.isCTA),
        startSec: b.startSec,
        animation: b.animation ?? "fade",
        kind: "block",
        appearance: b.appearance ?? undefined,
        textTreatment: b.textTreatment ?? undefined,
        fontScale: b.fontScale ?? undefined,
      });
    });

  return layers;
}
