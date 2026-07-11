"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { MarkdownLite } from "@/lib/markdown-lite";
import { cn } from "@/lib/cn";

type Props = {
  label: string;
  value: string;
  locked?: boolean;
};

export function StrategyDocPreviewCard({ label, value, locked }: Props) {
  const t = useTranslations("onboarding");

  return (
    <article className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.04] to-white/[0.015] shadow-sm transition-all duration-300 hover:border-amber-300/25 hover:from-white/[0.05]">
      <header className="border-b border-white/6 px-5 py-4">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/90">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
          {label}
        </p>
      </header>

      <div className="relative px-5 py-4">
        <div
          className={cn(
            "relative",
            locked ? "max-h-[220px] overflow-hidden select-none" : "max-h-[360px] overflow-y-auto pr-1",
          )}
        >
          <MarkdownLite content={value} />

          {locked ? (
            <>
              {/* Soft fade + blur from midway down */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 top-[38%] bg-gradient-to-b from-transparent via-zinc-950/55 to-zinc-950/95"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 top-[42%] backdrop-blur-[5px]"
                aria-hidden
              />
            </>
          ) : null}
        </div>

        {locked ? (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-4 py-3">
            <Lock className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
            <p className="text-center text-xs font-semibold leading-snug text-amber-200">
              {t("strategyDocUnlock")}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
