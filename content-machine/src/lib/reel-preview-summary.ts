import type { ScrapedReelRow } from "@/lib/api";

export type ReelPreviewSource = "analysis" | "caption";

export type ReelPreview = {
  text: string;
  source: ReelPreviewSource;
};

const MAX_CAPTION_LEN = 200;

/** Tier 1 (analysis one-liner) then Tier 0 (hook / caption) for hover previews. */
export function reelPreviewSummary(reel: ScrapedReelRow): ReelPreview | null {
  const fromAnalysis = reel.analysis?.preview_summary?.trim();
  if (fromAnalysis) {
    return { text: fromAnalysis, source: "analysis" };
  }

  const hook = reel.hook_text?.trim();
  const caption = reel.caption?.trim().replace(/\s+/g, " ");
  const raw = hook || caption;
  if (!raw) return null;

  const text =
    raw.length > MAX_CAPTION_LEN ? `${raw.slice(0, MAX_CAPTION_LEN - 1)}…` : raw;
  return { text, source: "caption" };
}
