"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, LayoutGrid, List, Loader2, Search } from "lucide-react";
import { SegmentedFilterPills } from "@/app/(dashboard)/intelligence/reels/source-filter-pills";
import { ReelThumbnail } from "@/components/reel-thumbnail";
import type { HomeSummaryRow, ScrapedReelRow } from "@/lib/api";
import { opportunityTitle } from "@/lib/home-opportunities";
import { formatCompactViews, useHomeCopy } from "@/lib/home-ui";
import {
  scoutCatalogHref,
  useScoutReelsCatalog,
  type ScoutSlice,
  type ScoutSort,
} from "@/lib/use-scout-reels-catalog";
import { getReelProvenance } from "@/lib/reel-provenance";
import { OpportunityCard } from "./opportunity-card";
import { cn } from "@/lib/cn";

type ViewMode = "cards" | "rows";

type Props = {
  clientSlug: string;
  orgSlug: string;
  summary: HomeSummaryRow;
  expanded: boolean;
  enabled: boolean;
  onUseReel: (reel: ScrapedReelRow) => void;
};

export function ScoutReelsPanel({
  clientSlug,
  orgSlug,
  summary,
  expanded,
  enabled,
  onUseReel,
}: Props) {
  const copy = useHomeCopy();
  const pageSize = expanded ? 24 : 8;
  const catalog = useScoutReelsCatalog(clientSlug, orgSlug, { pageSize, enabled });
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  useEffect(() => {
    setViewMode(expanded ? "rows" : "cards");
  }, [expanded]);

  const slicePills = [
    { id: "fresh", label: copy.scoutSliceFresh, active: catalog.slice === "fresh", variant: "purple" as const },
    {
      id: "competitors",
      label: copy.scoutSliceCompetitors,
      active: catalog.slice === "competitors",
      variant: "neutral" as const,
    },
    {
      id: "breakouts",
      label: copy.scoutSliceBreakouts,
      active: catalog.slice === "breakouts",
      variant: "amber" as const,
    },
    { id: "saved", label: copy.scoutSliceSaved, active: catalog.slice === "saved", variant: "neutral" as const },
  ];

  const sortPills = [
    { id: "posted_at", label: copy.scoutSortPosted, active: catalog.sort === "posted_at" },
    { id: "views", label: copy.scoutSortViews, active: catalog.sort === "views" },
    { id: "outlier_ratio", label: copy.scoutSortOutlier, active: catalog.sort === "outlier_ratio" },
  ];

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="space-y-1">
        <p className="text-xs text-app-fg-muted">
          Watching {summary.scout.watching_accounts} account
          {summary.scout.watching_accounts === 1 ? "" : "s"}
          {summary.scout.new_this_week > 0
            ? ` · ${summary.scout.new_this_week} new this week`
            : ""}
        </p>
        <p className="text-[11px] leading-relaxed text-app-fg-muted">
          Proven reels Scout surfaced for you — pick one to adapt in your studio.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-app-fg-muted">Show</p>
        <SegmentedFilterPills
          pills={slicePills}
          busyId={catalog.loading ? catalog.slice : null}
          onSelect={(id) => catalog.setSlice(id as ScoutSlice)}
          aria-label="Scout reel slices"
        />
      </div>

      {expanded ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-app-fg-muted">Sort</p>
            <SegmentedFilterPills
              pills={sortPills}
              onSelect={(id) => catalog.setSort(id as ScoutSort)}
              aria-label="Sort reels"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-lg border border-zinc-200/90 bg-zinc-100/60 p-0.5 dark:border-white/10 dark:bg-zinc-950/60"
              role="group"
              aria-label="View mode"
            >
              <button
                type="button"
                aria-pressed={viewMode === "cards"}
                onClick={() => setViewMode("cards")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                  viewMode === "cards"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-app-fg-muted hover:text-app-fg",
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                {copy.scoutViewCards}
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "rows"}
                onClick={() => setViewMode("rows")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                  viewMode === "rows"
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-app-fg-muted hover:text-app-fg",
                )}
              >
                <List className="h-3.5 w-3.5" aria-hidden />
                {copy.scoutViewRows}
              </button>
            </div>
            <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                aria-hidden
              />
              <input
                type="search"
                value={catalog.search}
                onChange={(e) => catalog.setSearch(e.target.value)}
                placeholder={copy.scoutSearchPlaceholder}
                className="w-full rounded-lg border border-zinc-200/90 bg-white py-2 pl-8 pr-3 text-xs text-app-fg placeholder:text-app-fg-muted focus:outline-none focus:ring-2 focus:ring-amber-500/35 dark:border-white/10 dark:bg-zinc-900"
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 text-[11px] text-app-fg-muted">
        <span>
          {catalog.loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Loading…
            </span>
          ) : catalog.search.trim() ? (
            `${catalog.rows.length} match${catalog.rows.length === 1 ? "" : "es"} on this page`
          ) : (
            copy.scoutShowing(catalog.rows.length, catalog.total)
          )}
        </span>
        {expanded && catalog.totalPages > 1 ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={catalog.page <= 1 || catalog.loading}
              onClick={() => catalog.setPage((p) => Math.max(1, p - 1))}
              className="rounded-md p-1.5 text-app-fg-muted transition hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-white/10"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="tabular-nums">
              {catalog.page} / {catalog.totalPages}
            </span>
            <button
              type="button"
              disabled={catalog.page >= catalog.totalPages || catalog.loading}
              onClick={() => catalog.setPage((p) => p + 1)}
              className="rounded-md p-1.5 text-app-fg-muted transition hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-white/10"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      {catalog.error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {catalog.error}
        </p>
      ) : null}

      {!catalog.loading && catalog.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-app-fg-muted dark:border-white/10">
          {copy.scoutEmpty}
        </p>
      ) : viewMode === "rows" ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-200/90 dark:border-white/10">
          <table className="w-full min-w-[32rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-200/80 text-[10px] font-semibold uppercase tracking-wide text-app-fg-muted dark:border-white/10">
                <th className="px-3 py-2.5 font-medium">Reel</th>
                <th className="hidden px-2 py-2.5 font-medium sm:table-cell">Hook</th>
                <th className="px-2 py-2.5 font-medium">Views</th>
                <th className="px-3 py-2.5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {catalog.rows.map((reel) => (
                <ScoutReelRow key={reel.id} reel={reel} onUse={() => onUseReel(reel)} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul
          className={cn(
            "grid grid-cols-1 gap-3",
            expanded && "sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          {catalog.rows.map((reel) => (
            <li key={reel.id}>
              <OpportunityCard reel={reel} onMake={() => onUseReel(reel)} />
            </li>
          ))}
        </ul>
      )}

      <Link
        href={scoutCatalogHref(catalog.slice)}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200/90 px-3 py-2.5 text-xs font-semibold text-app-fg-secondary transition hover:border-amber-400/40 hover:bg-amber-500/[0.04] dark:border-white/10"
      >
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        {copy.scoutOpenCatalog}
      </Link>
    </div>
  );
}

function ScoutReelRow({ reel, onUse }: { reel: ScrapedReelRow; onUse: () => void }) {
  const copy = useHomeCopy();
  const title = opportunityTitle(reel);
  const user = reel.account_username?.trim() || "creator";
  const provenance = getReelProvenance(reel);
  const outlier =
    reel.outlier_ratio != null && Number(reel.outlier_ratio) >= 1.5
      ? Number(reel.outlier_ratio).toFixed(1)
      : null;

  return (
    <tr className="text-xs transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
      <td className="px-3 py-2.5 align-middle">
        <div className="flex items-center gap-2.5">
          <ReelThumbnail
            src={reel.thumbnail_url}
            alt={`@${user} reel`}
            href={reel.post_url}
            size="sm"
            className="h-14 w-10 shrink-0"
          />
          <div className="min-w-0">
            <p className="font-semibold text-app-fg">@{user}</p>
            <span className="mt-0.5 inline-block rounded-md bg-zinc-100 px-1.5 py-px text-[10px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
              {provenance.sourceLabel}
            </span>
          </div>
        </div>
      </td>
      <td className="hidden max-w-[14rem] px-2 py-2.5 align-middle sm:table-cell">
        <p className="line-clamp-2 text-app-fg-secondary">{title}</p>
      </td>
      <td className="px-2 py-2.5 align-middle tabular-nums">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-app-fg">{formatCompactViews(reel.views)}</span>
          {outlier ? (
            <span className="w-fit rounded-md bg-amber-500/15 px-1.5 py-px text-[10px] font-bold text-amber-700 dark:text-amber-300">
              {outlier}× usual
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2.5 align-middle text-right">
        <button
          type="button"
          onClick={onUse}
          className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-zinc-950 transition hover:bg-amber-400"
        >
          {copy.useThis}
        </button>
      </td>
    </tr>
  );
}
