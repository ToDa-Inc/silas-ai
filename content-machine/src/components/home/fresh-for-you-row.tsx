"use client";

import type { ScrapedReelRow } from "@/lib/api";
import { HOME_COPY } from "@/lib/home-ui";
import { OpportunityCard } from "./opportunity-card";

type Props = {
  reels: ScrapedReelRow[];
  disabled?: boolean;
  onUseReel: (reel: ScrapedReelRow) => void;
  draftByReelId?: Record<string, { state: "idle" | "preparing" | "ready" | "opening"; sessionId: string | null }>;
};

export function FreshForYouRow({ reels, disabled, onUseReel, draftByReelId }: Props) {
  if (reels.length === 0) return null;

  const slice = reels.slice(0, 4);

  return (
    <section className="mt-8" aria-label={HOME_COPY.freshLabel}>
      <h3 className="mb-3 text-sm font-semibold text-app-fg">{HOME_COPY.freshLabel}</h3>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
        {slice.map((reel, i) => {
          const meta = draftByReelId?.[reel.id];
          return (
            <div key={reel.id} className="min-w-[280px] snap-start md:min-w-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                {i === 0 ? HOME_COPY.freshTrending : HOME_COPY.freshThisWeek}
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
