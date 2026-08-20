"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { ReelThumbnail } from "@/components/reel-thumbnail";
import type { ScrapedReelRow } from "@/lib/api";
import type { HeroResolved } from "@/lib/home-opportunities";
import { opportunityTitle, opportunityWhy } from "@/lib/home-opportunities";
import { useHomeCopy } from "@/lib/home-ui";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { cn } from "@/lib/cn";

type Props = {
  hero: HeroResolved;
  pool: ScrapedReelRow[];
  disabled?: boolean;
  busy?: boolean;
  primaryLabel?: string;
  onUseThis: () => void;
  onShowAnother: (reel: ScrapedReelRow) => void;
  layoutId?: string;
};

export function HeroCard({
  hero,
  pool,
  disabled,
  busy,
  primaryLabel,
  onUseThis,
  onShowAnother,
  layoutId = "hero-card",
}: Props) {
  const copy = useHomeCopy();
  const reducedMotion = usePrefersReducedMotion();
  const [heroIndex, setHeroIndex] = useState(0);
  const [buildingStep, setBuildingStep] = useState(0);
  const [swapKey, setSwapKey] = useState(0);

  useEffect(() => {
    if (hero.kind !== "building") return;
    const id = window.setInterval(() => {
      setBuildingStep((s) => (s + 1) % copy.heroBuildingSteps.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, [hero.kind, copy.heroBuildingSteps.length]);

  const displayReel =
    hero.kind === "draft_preparing"
      ? hero.reel
      : hero.kind === "next_post"
        ? pool.length > 0
          ? pool[heroIndex % pool.length]!
          : hero.reel
        : null;

  const handleShowAnother = useCallback(() => {
    if (pool.length < 2) return;
    const next = (heroIndex + 1) % pool.length;
    setHeroIndex(next);
    setSwapKey((k) => k + 1);
    onShowAnother(pool[next]!);
  }, [heroIndex, pool, onShowAnother]);

  const entrance = reducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  return (
    <motion.section
      layoutId={layoutId}
      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900/50"
      {...entrance}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="p-5 sm:p-6">
        {hero.kind === "draft_ready" && (
          <HeroBody
            title={copy.heroDraftReadyTitle}
            sub={copy.heroDraftReadySub}
            hook={hero.hookText}
            thumb={hero.thumbnailUrl}
            username={null}
            disabled={disabled}
            busy={busy}
            primaryLabel={primaryLabel ?? copy.openTodayPost}
            onPrimary={onUseThis}
            onSecondary={pool.length > 1 ? handleShowAnother : undefined}
          />
        )}

        {hero.kind === "draft_preparing" && displayReel && (
          <HeroBody
            title={copy.heroDraftPreparingTitle}
            sub={copy.heroDraftPreparingSub}
            hook={opportunityTitle(displayReel)}
            thumb={displayReel.thumbnail_url}
            username={displayReel.account_username}
            disabled
            busy
            primaryLabel={copy.createTodayPost}
            onPrimary={onUseThis}
            onSecondary={undefined}
          />
        )}

        {hero.kind === "next_post" && displayReel && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${swapKey}-${displayReel.id}`}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
              transition={{ duration: 0.16 }}
            >
              <HeroBody
                title={copy.heroNextPostTitle}
                sub={opportunityWhy(displayReel)}
                hook={opportunityTitle(displayReel)}
                thumb={displayReel.thumbnail_url}
                username={displayReel.account_username}
                disabled={disabled}
                busy={busy}
                primaryLabel={primaryLabel ?? copy.createTodayPost}
                onPrimary={onUseThis}
                onSecondary={pool.length > 1 ? handleShowAnother : undefined}
              />
            </motion.div>
          </AnimatePresence>
        )}

        {hero.kind === "building" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-app-fg">{copy.heroBuildingTitle}</h2>
              <p className="mt-1 text-sm text-app-fg-muted">
                {copy.heroBuildingSteps[buildingStep]}
              </p>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded-full bg-zinc-200 dark:bg-white/10" />
              <div className="h-3 w-4/5 animate-pulse rounded-full bg-zinc-200/80 dark:bg-white/[0.07]" />
            </div>
          </div>
        )}

        {hero.kind === "start" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-app-fg">{copy.heroStartTitle}</h2>
              <p className="mt-1 text-sm text-app-fg-muted">{copy.heroStartSub}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href="/generate"
                className="flex flex-1 items-center justify-center rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-zinc-950 transition hover:bg-amber-400"
              >
                {copy.pasteReel}
              </Link>
              <Link
                href="/onboarding"
                className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                {copy.finishSetup}
              </Link>
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}

function HeroBody({
  title,
  sub,
  hook,
  thumb,
  username,
  disabled,
  busy,
  primaryLabel,
  onPrimary,
  onSecondary,
}: {
  title: string;
  sub: string;
  hook: string;
  thumb: string | null;
  username: string | null;
  disabled?: boolean;
  busy?: boolean;
  primaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
}) {
  const copy = useHomeCopy();
  const label = primaryLabel ?? copy.useThis;
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {thumb ? (
        <div className="shrink-0 overflow-hidden rounded-xl border border-zinc-200 dark:border-white/10">
          <ReelThumbnail
            src={thumb}
            alt=""
            fallbackLabel={username ? `@${username}` : undefined}
            size="sm"
            className="h-32 w-20 object-cover sm:h-36 sm:w-[88px]"
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-app-fg">{title}</h2>
        {username ? (
          <p className="mt-0.5 text-xs font-medium text-zinc-500">@{username}</p>
        ) : null}
        <p className="mt-2 text-base font-medium leading-snug text-zinc-900 dark:text-zinc-100">
          {hook}
        </p>
        <p className="mt-2 text-sm text-app-fg-muted">{sub}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={onPrimary}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-50",
              busy && "scale-[1.02] shadow-md",
            )}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {copy.preparing}
              </>
            ) : (
              label
            )}
          </button>
          {onSecondary ? (
            <button
              type="button"
              disabled={disabled || busy}
              onClick={onSecondary}
              className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:text-zinc-300"
            >
              {copy.showAnother}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
