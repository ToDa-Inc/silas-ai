"use client";

import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { SaveStatusPill } from "@/components/editor-ui";

/**
 * Instagram caption + hashtag card. When change handlers are provided the
 * fields are editable textareas (autosave owned by the host); otherwise they
 * render as read-only copy for surfaces that only need display + copy/regen.
 */
export function CaptionSection({
  caption,
  hashtags,
  hashtagsText,
  onCopy,
  regenInline,
  onCaptionChange,
  onHashtagsChange,
  saveInFlight = 0,
}: {
  caption: string;
  hashtags: string[];
  /** Raw hashtag field value while editing (avoids re-parsing mid-keystroke). */
  hashtagsText?: string;
  onCopy: () => void;
  regenInline: ReactNode;
  onCaptionChange?: (value: string) => void;
  onHashtagsChange?: (value: string) => void;
  saveInFlight?: number;
}) {
  const t = useTranslations("editors");
  const editable = Boolean(onCaptionChange || onHashtagsChange);
  const tagsDisplay = hashtagsText ?? hashtags.join(" ");

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

      {editable ? (
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[9px] font-bold uppercase tracking-wide text-app-fg-muted">
              Caption
            </span>
            <textarea
              value={caption}
              onChange={(e) => onCaptionChange?.(e.target.value)}
              rows={Math.min(16, Math.max(5, caption.split("\n").length + 2))}
              className="glass-inset w-full resize-y rounded-xl px-3 py-2.5 text-sm leading-relaxed text-app-fg placeholder:text-app-fg-subtle focus:outline-none focus:ring-2 focus:ring-amber-500/35"
              placeholder={t("noCaptionYet")}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[9px] font-bold uppercase tracking-wide text-app-fg-muted">
              Hashtags
            </span>
            <textarea
              value={tagsDisplay}
              onChange={(e) => onHashtagsChange?.(e.target.value)}
              rows={2}
              className="glass-inset w-full resize-y rounded-xl px-3 py-2.5 text-xs leading-relaxed text-app-fg-muted placeholder:text-app-fg-subtle focus:outline-none focus:ring-2 focus:ring-amber-500/35"
              placeholder="#topic #niche"
            />
          </label>
          <div className="flex items-center gap-2 text-[11px] text-app-fg-subtle">
            <SaveStatusPill inFlight={saveInFlight} />
            <span className="opacity-70">Changes save automatically.</span>
          </div>
        </div>
      ) : (
        <>
          {caption ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-app-fg">{caption}</p>
          ) : (
            <p className="text-xs text-app-fg-subtle">{t("noCaptionYet")}</p>
          )}
          {hashtags.length > 0 && (
            <p className="mt-3 text-xs text-app-fg-muted">{hashtags.join(" ")}</p>
          )}
        </>
      )}
    </div>
  );
}

/** Parse a free-typed hashtag line into a clean string[]. */
export function parseHashtagInput(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : `#${t}`));
}
