"use client";

import { CheckCircle2, Copy, Download, Eye, Music2, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

type Props = {
  videoUrl: string | null | undefined;
  onCopyCaption: () => void;
  onPreview?: () => void;
  captionPreview?: string | null;
  className?: string;
  compact?: boolean;
};

const STEP_CONFIG = [
  {
    key: "download",
    detail: "Save the MP4 to your phone or computer.",
    icon: Download,
  },
  {
    key: "audio",
    detail:
      "Open Instagram → create a Reel → upload your video → tap Audio and pick a trending track in your niche. Audio boosts reach.",
    icon: Music2,
  },
  {
    key: "open",
    detail: "Use the + button → Reel → upload the file you downloaded.",
    icon: Smartphone,
  },
  {
    key: "caption",
    detail: "Copy the caption below and paste it before you publish.",
    icon: Copy,
  },
  {
    key: "publish",
    detail: "Review the cover frame, add hashtags if needed, then post.",
    icon: CheckCircle2,
  },
] as const;

export function InstagramPostChecklist({
  videoUrl,
  onCopyCaption,
  onPreview,
  captionPreview,
  className,
  compact = false,
}: Props) {
  const t = useTranslations("instagramChecklist");

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4",
        className,
      )}
    >
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
        {t("title")}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-app-fg-muted">
        Silas can&apos;t publish for you yet — follow these steps to post manually.
      </p>

      <ol className={cn("mt-4 space-y-3", compact && "space-y-2.5")}>
        {STEP_CONFIG.map((step, index) => {
          const Icon = step.icon;
          const stepLabel = t(`step${index + 1}` as "step1" | "step2" | "step3" | "step4" | "step5");
          return (
            <li key={step.key} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-bold text-amber-700 dark:text-amber-300">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-app-fg">
                  <Icon className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
                  {stepLabel}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-app-fg-muted">{step.detail}</p>
                {step.key === "download" && videoUrl ? (
                  <a
                    href={videoUrl}
                    download="reel.mp4"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-zinc-950 hover:opacity-90"
                  >
                    <Download className="h-3 w-3" aria-hidden />
                    {t("downloadMp4")}
                  </a>
                ) : null}
                {step.key === "caption" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onCopyCaption}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-app-divider bg-app-chip-bg/40 px-3 py-1.5 text-[11px] font-bold text-app-fg hover:bg-app-chip-bg/70"
                    >
                      <Copy className="h-3 w-3" aria-hidden />
                      {t("copyCaption")}
                    </button>
                    {onPreview ? (
                      <button
                        type="button"
                        onClick={onPreview}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-app-divider px-3 py-1.5 text-[11px] font-bold text-app-fg hover:bg-white/5"
                      >
                        <Eye className="h-3 w-3" aria-hidden />
                        {t("previewPost")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {captionPreview ? (
        <p className="mt-4 line-clamp-3 whitespace-pre-line rounded-lg border border-app-divider/60 bg-app-chip-bg/20 px-3 py-2 text-[12px] leading-relaxed text-app-fg-secondary">
          {captionPreview}
        </p>
      ) : null}
    </div>
  );
}
