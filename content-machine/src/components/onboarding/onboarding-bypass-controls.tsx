"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Loader2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import {
  ONBOARDING_BYPASS_RESUME_HREF,
  ONBOARDING_BYPASS_SKIP_HREF,
} from "@/lib/onboarding-bypass";

const btnClass =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition disabled:cursor-wait disabled:opacity-80";

const skipLinkClass =
  "inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 underline-offset-2 transition hover:text-zinc-300 hover:underline disabled:cursor-wait disabled:opacity-60";

const ghostClass = cn(
  btnClass,
  "border-white/15 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:bg-white/[0.08] hover:text-white",
);

const amberClass = cn(
  btnClass,
  "border-amber-400/35 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20",
);

function BypassActionButton({
  href,
  className,
  children,
  pendingLabel,
}: {
  href: string;
  className: string;
  children: ReactNode;
  pendingLabel: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        setPending(true);
        window.location.assign(href);
      }}
    >
      {pending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Shown in onboarding header — skip gate and open the app. */
export function OnboardingSkipToStudioButton({ bypassActive }: { bypassActive?: boolean }) {
  const t = useTranslations("nav");

  if (bypassActive) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href="/dashboard" className={ghostClass}>
          {t("openStudio")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
        <BypassActionButton href={ONBOARDING_BYPASS_RESUME_HREF} className={amberClass} pendingLabel={t("resuming")}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {t("resumeSetup")}
        </BypassActionButton>
      </div>
    );
  }

  return (
    <BypassActionButton href={ONBOARDING_BYPASS_SKIP_HREF} className={skipLinkClass} pendingLabel={t("openingStudio")}>
      {t("skipSetup")}
    </BypassActionButton>
  );
}

type BannerProps = {
  active: boolean;
};

/** Shown on dashboard when bypass cookie is set. */
export function OnboardingBypassBanner({ active }: BannerProps) {
  const t = useTranslations("nav");
  const tOnboarding = useTranslations("onboarding");

  if (!active) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-950 dark:text-amber-100">
      <span className="font-semibold">{t("setupSkipped")}</span>
      <span className="hidden text-amber-900/70 sm:inline dark:text-amber-200/70">
        {tOnboarding("returnToOnboardingAnytime")}
      </span>
      <BypassActionButton
        href={ONBOARDING_BYPASS_RESUME_HREF}
        className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-950 hover:bg-amber-500/25 dark:text-amber-50"
        pendingLabel={t("resuming")}
      >
        <RotateCcw className="h-3 w-3" aria-hidden />
        {t("resumeOnboarding")}
      </BypassActionButton>
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-1 rounded-lg border border-amber-500/25 bg-white/40 px-2.5 py-1 text-[11px] font-bold text-amber-950 hover:bg-white/60 dark:bg-white/10 dark:text-amber-50 dark:hover:bg-white/15"
      >
        {t("openSetupUi")}
      </Link>
    </div>
  );
}
