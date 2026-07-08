"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { ReelThumbnail } from "@/components/reel-thumbnail";
import { cn } from "@/lib/cn";
import type { ScrapedReelRow } from "@/lib/api";

type Props = {
  row: ScrapedReelRow;
  score: number;
  verdict: "yes" | "no" | undefined;
  onVote: (verdict: "yes" | "no") => void;
  dimmed?: boolean;
};

export function OnboardingReelVoteCard({ row, score, verdict, onVote, dimmed }: Props) {
  const user = row.account_username?.trim() || "creator";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border bg-app-card/20 shadow-sm transition-all duration-200",
        verdict === "yes"
          ? "border-emerald-500/50 ring-1 ring-emerald-500/30"
          : verdict === "no"
            ? "border-app-divider/40 opacity-50"
            : "border-app-card-border hover:border-amber-500/30",
        dimmed && "pointer-events-none opacity-40",
      )}
    >
      <div className="flex gap-3 p-3">
        <div className="relative shrink-0">
          <ReelThumbnail
            src={row.thumbnail_url}
            alt={`@${user} reel`}
            href={row.post_url}
            size="lg"
          />
          {row.is_outlier || row.outlier_ratio != null ? (
            <span className="absolute -right-1 -top-1 rounded-md bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-zinc-950">
              {row.outlier_ratio != null
                ? `${Number(row.outlier_ratio).toFixed(1)}×`
                : "Outlier"}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-app-fg">@{user}</p>
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-app-fg-muted">
            {row.caption?.trim() || row.hook_text?.trim() || "No caption"}
          </p>
          <p className="mt-2 text-[10px] font-medium text-app-fg-subtle">
            Match score {score.toFixed(1)}
            {row.views != null ? ` · ${formatCompact(row.views)} views` : ""}
          </p>
          <p className="mt-0.5 text-[9px] leading-snug text-app-fg-subtle/80">
            How closely this reel fits your niche and goals — higher is a better fit.
          </p>
        </div>
      </div>
      <div className="flex border-t border-app-divider/60">
        <button
          type="button"
          onClick={() => onVote("yes")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition",
            verdict === "yes"
              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              : "text-app-fg-muted hover:bg-emerald-500/10 hover:text-emerald-600",
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          Yes
        </button>
        <button
          type="button"
          onClick={() => onVote("no")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 border-l border-app-divider/60 py-2.5 text-xs font-semibold transition",
            verdict === "no"
              ? "bg-red-500/15 text-red-700 dark:text-red-300"
              : "text-app-fg-muted hover:bg-red-500/10 hover:text-red-600",
          )}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          No
        </button>
      </div>
    </article>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
