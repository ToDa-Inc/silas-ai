"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { STUDIO_ENTRY_HREFS, type StudioEditorEntryPoint } from "@/lib/studio-editor-context";
import { cn } from "@/lib/cn";

type Props = {
  entryPoint: StudioEditorEntryPoint;
  sessionLabel?: string | null;
  className?: string;
};

export function StudioEditorHeader({ entryPoint, sessionLabel, className }: Props) {
  const t = useTranslations("common");
  const originLabel =
    entryPoint === "home"
      ? t("home")
      : entryPoint === "create"
        ? t("create")
        : entryPoint === "media"
          ? t("media")
          : t("setup");
  const originHref = STUDIO_ENTRY_HREFS[entryPoint];

  return (
    <nav
      aria-label="Editor location"
      className={cn(
        "mb-4 flex flex-wrap items-center gap-1.5 rounded-xl border border-app-divider/70 bg-app-chip-bg/25 px-3 py-2 text-xs",
        className,
      )}
    >
      <Link href={originHref} className="font-semibold text-amber-600 hover:underline dark:text-amber-400">
        {originLabel}
      </Link>
      <ChevronRight className="h-3.5 w-3.5 text-app-fg-subtle" aria-hidden />
      <span className="font-semibold text-app-fg">{t("editor")}</span>
      {sessionLabel ? (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-app-fg-subtle" aria-hidden />
          <span className="min-w-0 truncate text-app-fg-muted">{sessionLabel}</span>
        </>
      ) : null}
    </nav>
  );
}
