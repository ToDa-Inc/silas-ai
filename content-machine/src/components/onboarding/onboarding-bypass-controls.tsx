"use client";

import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ONBOARDING_BYPASS_RESUME_HREF,
  ONBOARDING_BYPASS_SKIP_HREF,
} from "@/lib/onboarding-bypass";

const btnClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition";

const ghostClass = cn(
  btnClass,
  "border-white/15 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:bg-white/[0.08] hover:text-white",
);

const amberClass = cn(
  btnClass,
  "border-amber-400/35 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20",
);

/** Shown in onboarding header — skip gate and open the app. */
export function OnboardingSkipToStudioButton({ bypassActive }: { bypassActive?: boolean }) {
  if (bypassActive) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/dashboard" className={ghostClass}>
          Open studio
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <Link href={ONBOARDING_BYPASS_RESUME_HREF} className={amberClass}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Resume setup
        </Link>
      </div>
    );
  }

  return (
    <Link href={ONBOARDING_BYPASS_SKIP_HREF} className={ghostClass}>
      Skip setup
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

type BannerProps = {
  active: boolean;
};

/** Shown on dashboard when bypass cookie is set. */
export function OnboardingBypassBanner({ active }: BannerProps) {
  if (!active) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-950 dark:text-amber-100">
      <span className="font-semibold">Setup skipped</span>
      <span className="hidden text-amber-900/70 sm:inline dark:text-amber-200/70">
        — you can return to onboarding anytime
      </span>
      <Link
        href={ONBOARDING_BYPASS_RESUME_HREF}
        className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-950 hover:bg-amber-500/25 dark:text-amber-50"
      >
        <RotateCcw className="h-3 w-3" aria-hidden />
        Resume onboarding
      </Link>
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-1 rounded-lg border border-amber-500/25 bg-white/40 px-2.5 py-1 text-[11px] font-bold text-amber-950 hover:bg-white/60 dark:bg-white/10 dark:text-amber-50 dark:hover:bg-white/15"
      >
        Open setup UI
      </Link>
    </div>
  );
}
