"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { ScrapedReelRow } from "@/lib/api";
import { reelPreviewSummary } from "@/lib/reel-preview-summary";

type Props = {
  reel: ScrapedReelRow;
  children: ReactNode;
  className?: string;
};

/** Hover preview: analysis one-liner when available, else hook/caption (Tier 1 + Tier 0). */
export function ReelPreviewTooltip({ reel, children, className }: Props) {
  const t = useTranslations("intelligence");
  const preview = reelPreviewSummary(reel);
  if (!preview) {
    return className ? <span className={className}>{children}</span> : <>{children}</>;
  }

  const user = reel.account_username?.trim() || "creator";
  const views =
    reel.views != null && Number.isFinite(Number(reel.views))
      ? Number(reel.views).toLocaleString()
      : null;
  const outlier =
    reel.outlier_ratio != null && Number(reel.outlier_ratio) >= 1.5
      ? `${Number(reel.outlier_ratio).toFixed(1)}× avg`
      : null;
  const stats = [views ? `${views} views` : null, outlier].filter(Boolean).join(" · ");

  const content = (
    <div className="space-y-1 text-left">
      <p className="text-[11px] font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
        @{user}
      </p>
      {stats ? (
        <p className="text-[9px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
          {stats}
        </p>
      ) : null}
      <p className="text-[11px] leading-snug text-zinc-700 dark:text-zinc-200">{preview.text}</p>
      <p className="text-[9px] text-zinc-500 dark:text-zinc-400">
        {preview.source === "analysis" ? t("previewFromAnalysis") : t("previewFromCaption")}
      </p>
    </div>
  );

  return (
    <Tooltip content={content} maxWidthRem={20} side="top" className={className}>
      {children}
    </Tooltip>
  );
}
