"use client";

import { Eye, Film, Heart, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import type { IntelligenceStatsRow } from "@/lib/api";
import { cn } from "@/lib/cn";

function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString();
}

type Props = {
  stats: IntelligenceStatsRow | null;
  className?: string;
};

export function DashboardKpiStrip({ stats, className }: Props) {
  const t = useTranslations("dashboard");
  const pct = stats?.avg_views_change_vs_prior_week_pct ?? null;
  const trendUp = (pct ?? 0) >= 0;
  const trend =
    pct !== null && pct !== undefined && Number.isFinite(pct)
      ? t("vsLastWeek", { pct: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}` })
      : null;

  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-3", className)}>
      <div className="glass group relative overflow-hidden rounded-2xl border border-app-card-border p-5 transition-colors hover:bg-app-chip-bg-hover">
        <div className="absolute right-0 top-0 h-24 w-24 opacity-[0.07] blur-3xl transition-opacity group-hover:opacity-[0.11] amber-gradient" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-app-fg-subtle">
              {t("reelsStored")}
            </p>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-app-fg">
              {stats ? stats.total_own_reels.toLocaleString() : "—"}
            </p>
            <p className="text-[11px] text-app-fg-muted">{t("fromInstagram")}</p>
          </div>
          <div className="rounded-xl bg-app-icon-btn-bg p-2.5 text-app-accent">
            <Film className="h-5 w-5" aria-hidden />
          </div>
        </div>
      </div>

      <div className="glass group relative overflow-hidden rounded-2xl border border-app-card-border p-5 transition-colors hover:bg-app-chip-bg-hover">
        <div className="absolute right-0 top-0 h-24 w-24 bg-teal-400 opacity-[0.06] blur-3xl transition-opacity group-hover:opacity-[0.1]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-app-fg-subtle">
              {t("averageViews")}
            </p>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-app-fg">
              {formatInt(stats?.average_views_last_30_reels ?? null)}
            </p>
            {trend ? (
              <p
                className={cn(
                  "flex items-center gap-1 text-[11px] font-medium",
                  trendUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400",
                )}
              >
                {trendUp ? (
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                )}
                {trend}
              </p>
            ) : (
              <p className="text-[11px] text-app-fg-muted">{t("acrossLatestReels")}</p>
            )}
          </div>
          <div className="rounded-xl bg-app-icon-btn-bg p-2.5 text-teal-500 dark:text-teal-400">
            <Eye className="h-5 w-5" aria-hidden />
          </div>
        </div>
      </div>

      <div className="glass group relative overflow-hidden rounded-2xl border border-app-card-border p-5 transition-colors hover:bg-app-chip-bg-hover">
        <div className="relative flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-app-fg-subtle">
              {t("averageLikes")}
            </p>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-app-fg">
              {formatInt(stats?.average_likes_last_30_reels ?? null)}
            </p>
            <p className="text-[11px] text-app-fg-muted">{t("acrossLatestReels")}</p>
          </div>
          <div className="rounded-xl bg-app-icon-btn-bg p-2.5 text-rose-500 dark:text-rose-400">
            <Heart className="h-5 w-5" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}
