"use client";

import { motion } from "framer-motion";
import { Check, Loader2, Sparkles } from "lucide-react";
import { ReelThumbnail } from "@/components/reel-thumbnail";
import type { ScrapedReelRow } from "@/lib/api";
import { HOME_COPY } from "@/lib/home-ui";
import { opportunityTitle, opportunityWhy } from "@/lib/home-opportunities";
import { cn } from "@/lib/cn";

export type OpportunityCardState = "idle" | "preparing" | "ready" | "opening";

type Props = {
  reel: ScrapedReelRow;
  layoutId?: string;
  state?: OpportunityCardState;
  disabled?: boolean;
  onOpen?: () => void;
  onMake?: () => void;
  /** Compact layout for onboarding reel pick. */
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** Dark glass styling for onboarding wizard. */
  tone?: "default" | "onboarding";
};

export function OpportunityCard({
  reel,
  layoutId,
  state = "idle",
  disabled,
  onOpen,
  onMake,
  selectable,
  selected,
  onSelect,
  tone = "default",
}: Props) {
  const title = opportunityTitle(reel);
  const why = opportunityWhy(reel);
  const user = reel.account_username?.trim() || "creator";
  const isReady = state === "ready";
  const isPreparing = state === "preparing" || state === "opening";

  const isOnboarding = tone === "onboarding";

  const cardBody = (
    <>
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-xl border",
          isOnboarding
            ? "border-white/10 bg-zinc-900"
            : "border-zinc-200/80 bg-zinc-100 dark:border-white/10 dark:bg-zinc-900",
        )}
      >
        <ReelThumbnail
          src={reel.thumbnail_url}
          alt={`@${user} reel`}
          href={reel.post_url}
          size="sm"
          className="h-28 w-[72px] object-cover sm:h-32 sm:w-20"
        />
        {isReady ? (
          <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded-md bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
            <Check className="h-2.5 w-2.5" aria-hidden />
            {HOME_COPY.draftReady}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[11px] font-semibold",
            isOnboarding ? "text-zinc-400" : "text-zinc-500 dark:text-zinc-400",
          )}
        >
          @{user}
        </p>
        <p
          className={cn(
            "mt-1 line-clamp-2 text-sm font-medium leading-snug",
            isOnboarding ? "text-zinc-100" : "text-zinc-900 dark:text-zinc-100",
          )}
        >
          {isPreparing ? (
            <span className="inline-flex items-center gap-2 text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {HOME_COPY.preparing}
            </span>
          ) : (
            title
          )}
        </p>
        {!isPreparing ? (
          <p
            className={cn(
              "mt-1.5 line-clamp-2 text-xs leading-relaxed",
              isOnboarding ? "text-zinc-400" : "text-zinc-500 dark:text-zinc-400",
            )}
          >
            {why}
          </p>
        ) : (
          <div className="mt-2 space-y-1.5">
            <div className="h-2 w-full animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
            <div className="h-2 w-4/5 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
          </div>
        )}
      </div>

      {selectable ? (
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full border transition",
            selected
              ? "border-amber-500 bg-amber-500 text-zinc-950"
              : "border-zinc-300 bg-transparent dark:border-white/20",
          )}
        >
          {selected ? <Check className="h-3.5 w-3.5 stroke-[3]" aria-hidden /> : null}
        </div>
      ) : (
        <div className="flex shrink-0 flex-col items-stretch justify-center gap-2 self-center">
          {isReady ? (
            <button
              type="button"
              disabled={disabled || isPreparing}
              onClick={(e) => {
                e.stopPropagation();
                onOpen?.();
              }}
              className="whitespace-nowrap rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              {HOME_COPY.reviewDraft}
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || isPreparing}
              onClick={(e) => {
                e.stopPropagation();
                onMake?.();
              }}
              className="whitespace-nowrap rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/15 disabled:opacity-50 dark:text-amber-400"
            >
              {isPreparing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  …
                </span>
              ) : (
                HOME_COPY.makeThisPost
              )}
            </button>
          )}
        </div>
      )}
    </>
  );

  const className = cn(
    "flex w-full gap-4 rounded-2xl border p-4 text-left transition duration-200",
    selectable
      ? selected
        ? isOnboarding
          ? "border-amber-300/50 bg-amber-300/[0.06] ring-1 ring-amber-300/30"
          : "border-amber-400/50 bg-amber-500/[0.06] ring-1 ring-amber-400/20"
        : isOnboarding
          ? "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.04]"
          : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900/50 dark:hover:border-white/20"
      : isOnboarding
        ? "border-white/10 bg-white/[0.025]"
        : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm dark:border-white/10 dark:bg-zinc-900/40 dark:hover:border-white/20",
    disabled && "pointer-events-none opacity-60",
  );

  if (selectable) {
    return (
      <button type="button" className={className} onClick={onSelect} disabled={disabled}>
        {cardBody}
      </button>
    );
  }

  const onActivate = () => {
    if (isReady) onOpen?.();
    else if (!isPreparing) onMake?.();
  };

  if (layoutId) {
    return (
      <motion.article
        layoutId={layoutId}
        className={cn(className, "cursor-pointer")}
        onClick={onActivate}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onActivate();
          }
        }}
      >
        {cardBody}
      </motion.article>
    );
  }

  return (
    <article
      className={cn(className, "cursor-pointer")}
      onClick={onActivate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      {cardBody}
    </article>
  );
}

export function OpportunityCardSkeleton() {
  return (
    <div className="flex animate-pulse gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900/40">
      <div className="h-28 w-[72px] rounded-xl bg-zinc-200 dark:bg-white/10 sm:h-32 sm:w-20" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-2.5 w-16 rounded bg-zinc-200 dark:bg-white/10" />
        <div className="h-4 w-full rounded bg-zinc-200 dark:bg-white/10" />
        <div className="h-3 w-4/5 rounded bg-zinc-200 dark:bg-white/10" />
      </div>
    </div>
  );
}

export function MakePostFab({ href = "/generate" }: { href?: string }) {
  return (
    <a
      href={href}
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 rounded-full bg-amber-500 px-4 py-3 text-sm font-bold text-zinc-950 shadow-lg shadow-amber-500/25 transition hover:bg-amber-400 md:bottom-6"
    >
      <Sparkles className="h-4 w-4" aria-hidden />
      {HOME_COPY.makePost}
    </a>
  );
}
