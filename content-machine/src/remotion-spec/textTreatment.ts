import type { CSSProperties } from "react";
import type { VideoSpec, VideoTextTreatmentId } from "./schema";

export function isBoldOutlineTreatment(spec: VideoSpec): boolean {
  return spec.textTreatment === "bold-outline";
}

export type LayerOutlineCtx = {
  kind: "hook" | "block";
  textTreatment?: VideoTextTreatmentId | null;
};

export function isBoldOutlineLayer(spec: VideoSpec, layer: LayerOutlineCtx): boolean {
  const t = layer.kind === "hook" ? spec.textTreatment : (layer.textTreatment ?? spec.textTreatment);
  return t === "bold-outline";
}

/** Centered / overlay captions (no card shell). Caller gates with ``isBoldOutlineLayer``. */
export function overlayBoldOutlineCaptionStyle(): CSSProperties {
  return {
    WebkitTextStroke: "4px rgba(0,0,0,0.92)",
    paintOrder: "stroke fill",
    textShadow: "0 6px 22px rgba(0,0,0,0.55)",
  };
}

/** Text inside a filled card (bottom-card, stack, top-banner). Caller gates with ``isBoldOutlineLayer``. */
export function cardBoldOutlineCaptionStyle(): CSSProperties {
  return {
    WebkitTextStroke: "3px rgba(0,0,0,0.85)",
    paintOrder: "stroke fill",
    textShadow: "0 4px 16px rgba(0,0,0,0.28)",
  };
}
