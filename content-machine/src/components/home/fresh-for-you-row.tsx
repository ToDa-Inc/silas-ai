"use client";

import type { ScrapedReelRow } from "@/lib/api";
import { useFormatter } from "next-intl";
import { useHomeCopy } from "@/lib/home-ui";
import { OpportunityCard } from "./opportunity-card";

type Props = {
  reels: ScrapedReelRow[];
  disabled?: boolean;
  onUseReel: (reel: ScrapedReelRow) => void;
  draftByReelId?: Record<string, { state: "idle" | "preparing" | "ready" | "opening"; sessionId: string | null }>;
  computedAt?: string | null;
  isFallback?: boolean;
};

export function FreshForYouRow({ reels, disabled, onUseReel, draftByReelId, computedAt, isFallback }: Props) {
  const copy = useHomeCopy();
  const format = useFormatter();
  if (reels.length === 0) return null;

  const slice = reels.slice(0, 4);
  const updatedLabel =
    computedAt && !isFallback
      ? copy.freshPicksUpdated(
          format.relativeTime(new Date(computedAt), { now: new Date(), style: "short" }),
        )
      : null;

  return (
    <section className="mt-8" aria-label={copy.freshLabel}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold text-app-fg">{copy.freshLabel}</h3>
        {updatedLabel ? (
          <p className="text-[11px] text-app-fg-subtle">{updatedLabel}</p>
        ) : isFallback ? (
          <p className="text-[11px] text-app-fg-subtle">{copy.freshPicksFallback}</p>
        ) : null}
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
        {slice.map((reel, i) => {
          const meta = draftByReelId?.[reel.id];
          return (
            <div key={reel.id} className="min-w-[280px] snap-start md:min-w-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                {i === 0 ? copy.freshTrending : copy.freshThisWeek}
              </p>
              <OpportunityCard
                reel={reel}
                state={meta?.state ?? "idle"}
                disabled={disabled}
                onMake={() => onUseReel(reel)}
                onOpen={() => onUseReel(reel)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
