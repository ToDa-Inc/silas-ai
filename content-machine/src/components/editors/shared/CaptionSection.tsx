"use client";

import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Final Instagram caption + hashtag display card. Pure presentation: caption /
 * hashtags come from the session, copy + regen actions are owned by the host
 * (the host wires `regenInline` to a `<RegenInline scope="caption">` and
 * `onCopy` to its `copyText` helper so the toast and clipboard are consistent
 * with the rest of the wizard).
 */
export function CaptionSection({
  caption,
  hashtags,
  onCopy,
  regenInline,
}: {
  caption: string;
  hashtags: string[];
  onCopy: () => void;
  regenInline: ReactNode;
}) {
  const t = useTranslations("editors");

  return (
    <div className="glass rounded-2xl border border-app-divider/80 p-5 md:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold text-app-fg">{t("captionHashtags")}</h2>
        {regenInline}
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-lg bg-app-icon-btn-bg px-2.5 py-1 text-[11px] font-bold text-app-icon-btn-fg"
        >
          <Copy className="h-3 w-3" /> {t("copy")}
        </button>
      </div>
      {caption ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-app-fg">{caption}</p>
      ) : (
        <p className="text-xs text-app-fg-subtle">{t("noCaptionYet")}</p>
      )}
      {hashtags.length > 0 && (
        <p className="mt-3 text-xs text-app-fg-muted">{hashtags.join(" ")}</p>
      )}
    </div>
  );
}
