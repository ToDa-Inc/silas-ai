"use client";

import Link from "next/link";
import { LinkPendingSpinner } from "@/components/ui/pending-link";

type Variant = "neutral" | "amber" | "purple";

type Pill = {
  href: string;
  label: string;
  active: boolean;
  variant?: Variant;
};

type Props = {
  pills: Pill[];
  /**
   * `segmented` — one control bar (clear hierarchy vs loose pills).
   * `wrap` — original flexible row of pills.
   */
  layout?: "wrap" | "segmented";
};

const ACTIVE_CLASS: Record<Variant, string> = {
  neutral: "rounded-lg bg-zinc-200 px-3 py-1.5 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
  amber: "rounded-lg bg-amber-500/20 px-3 py-1.5 font-semibold text-amber-700 dark:text-amber-400",
  purple: "rounded-lg bg-purple-500/20 px-3 py-1.5 font-semibold text-purple-700 dark:text-purple-400",
};

const IDLE_CLASS = "rounded-lg px-3 py-1.5 text-app-fg-muted hover:bg-zinc-200 dark:hover:bg-zinc-800";

const SEGMENTED_WRAP =
  "inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border border-zinc-200/90 bg-zinc-100/60 p-1 shadow-sm dark:border-white/10 dark:bg-zinc-950/60";

const segmentedActive = (v: Variant) =>
  ({
    neutral:
      "rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100",
    amber:
      "rounded-md bg-amber-500/20 px-2.5 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300",
    purple:
      "rounded-md bg-purple-500/20 px-2.5 py-1.5 text-xs font-semibold text-purple-800 dark:text-purple-300",
  })[v];

const SEGMENTED_IDLE =
  "rounded-md px-2.5 py-1.5 text-xs text-app-fg-muted transition-colors hover:bg-white/80 hover:text-zinc-800 dark:hover:bg-white/[0.06] dark:hover:text-app-fg-secondary";

export type SegmentedPill = {
  id: string;
  label: string;
  active: boolean;
  variant?: Variant;
};

/** Client-side segmented pills (same look as SourceFilterPills, no navigation). */
export function SegmentedFilterPills({
  pills,
  onSelect,
  busyId,
  "aria-label": ariaLabel = "Filter options",
}: {
  pills: SegmentedPill[];
  onSelect: (id: string) => void;
  busyId?: string | null;
  "aria-label"?: string;
}) {
  return (
    <nav className={`${SEGMENTED_WRAP} text-xs`} aria-label={ariaLabel}>
      {pills.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-current={p.active ? "true" : undefined}
          disabled={busyId === p.id}
          onClick={() => onSelect(p.id)}
          className={
            p.active ? segmentedActive(p.variant ?? "neutral") : SEGMENTED_IDLE
          }
        >
          {p.label}
          {busyId === p.id ? (
            <span className="ml-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          ) : null}
        </button>
      ))}
    </nav>
  );
}

/**
 * `useLinkStatus` (Next 15+) reports navigation pending state for the parent <Link>.
 * Renders a tiny spinner inline so the user gets visible feedback while the server
 * re-fetches the reels list with the new `source` filter — the work is server-side,
 * but the UI was previously silent during the round-trip.
 */
export function SourceFilterPills({ pills, layout = "wrap" }: Props) {
  if (layout === "segmented") {
    return (
      <nav className={`${SEGMENTED_WRAP} text-xs`} aria-label="Filter options">
        {pills.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            aria-current={p.active ? "page" : undefined}
            className={p.active ? segmentedActive(p.variant ?? "neutral") : SEGMENTED_IDLE}
            prefetch={false}
          >
            {p.label}
            <LinkPendingSpinner className="ml-1.5" label="Updating reels filter" />
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {pills.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          aria-current={p.active ? "page" : undefined}
          className={
            p.active ? ACTIVE_CLASS[p.variant ?? "neutral"] : IDLE_CLASS
          }
          prefetch={false}
        >
          {p.label}
          <LinkPendingSpinner className="ml-1.5" label="Updating reels filter" />
        </Link>
      ))}
    </div>
  );
}
