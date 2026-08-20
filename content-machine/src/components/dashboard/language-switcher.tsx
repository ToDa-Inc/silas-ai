"use client";

import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { useAppLocale } from "@/components/locale-provider";
import { cn } from "@/lib/cn";
import { type AppLocale, localeLabels, locales } from "@/i18n/config";

type LanguageSwitcherProps = {
  className?: string;
  /** Short DE / EN labels instead of full language names. */
  compact?: boolean;
  /** Dark onboarding chrome — pill toggle on zinc/amber backdrop. */
  variant?: "default" | "onboarding";
};

export function LanguageSwitcher({
  className,
  compact = false,
  variant = "default",
}: LanguageSwitcherProps) {
  const { locale, setLocale } = useAppLocale();
  const t = useTranslations("common");
  const isOnboarding = variant === "onboarding";
  const showCompact = compact || isOnboarding;

  function switchLocale(next: AppLocale) {
    setLocale(next);
  }

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="group"
      aria-label={t("language")}
    >
      {!showCompact ? (
        <Globe className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
      ) : null}
      <div
        className={cn(
          "flex p-0.5",
          isOnboarding
            ? "rounded-full border border-white/10 bg-white/[0.06] backdrop-blur-sm"
            : "rounded-lg border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-900",
        )}
      >
        {locales.map((loc) => {
          const active = loc === locale;
          return (
            <button
              key={loc}
              type="button"
              aria-pressed={active}
              onClick={() => switchLocale(loc)}
              className={cn(
                "min-w-[2.25rem] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-all",
                isOnboarding ? "rounded-full" : "rounded-md",
                active
                  ? isOnboarding
                    ? "bg-amber-300/90 text-zinc-950 shadow-sm"
                    : "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100"
                  : isOnboarding
                    ? "text-zinc-500 hover:text-zinc-300"
                    : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-300",
              )}
            >
              {showCompact ? loc.toUpperCase() : localeLabels[loc]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
