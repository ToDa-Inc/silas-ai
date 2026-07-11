"use client";

import type { HomeSummaryExport } from "@/lib/api";
import { useHomeCopy } from "@/lib/home-ui";

type Props = {
  postsMade: number;
  lastExport: HomeSummaryExport | null;
};

export function MomentumLine({ postsMade, lastExport }: Props) {
  const copy = useHomeCopy();
  const thumb = lastExport?.thumbnail_url?.trim();

  return (
    <div className="mt-8 flex items-center gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-lg bg-zinc-200 dark:bg-white/10" />
      )}
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {postsMade > 0 ? copy.momentumPosts(postsMade) : copy.momentumNone}
        {lastExport?.hook_text ? (
          <span className="mt-0.5 block text-xs text-zinc-500 line-clamp-1">
            Last: {lastExport.hook_text}
          </span>
        ) : null}
      </p>
    </div>
  );
}
