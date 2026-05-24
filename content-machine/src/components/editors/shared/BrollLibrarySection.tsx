/**
 * BrollLibrarySection — grid / strip of uploaded b-roll clips.
 *
 * Used by the Video editor (background source = "clip" and b_roll_reel) both
 * as a vertical panel (in the Background tab) and as a horizontal strip
 * (under the preview). Pure leaf (props in / events out).
 */

import Link from "next/link";
import { Film, Loader2, Plus, Trash2 } from "lucide-react";
import type { BrollClipRow } from "@/lib/api-client";

type Props = {
  clips: BrollClipRow[];
  loading: boolean;
  deletingClipId: string | null;
  selectedClipId: string;
  sessionBrollClipId?: string | null;
  showClipBanner: boolean;
  clipBannerUrl?: string | null;
  /** `strip`: horizontal row under the preview timeline — saves vertical space in the edit column. */
  variant?: "panel" | "strip";
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
};

export function BrollLibrarySection({
  clips,
  loading,
  deletingClipId,
  selectedClipId,
  sessionBrollClipId,
  showClipBanner,
  clipBannerUrl,
  variant = "panel",
  onPick,
  onDelete,
}: Props) {
  const isStrip = variant === "strip";

  const clipCards = clips.map((c) => {
    const isActive = selectedClipId === c.id || sessionBrollClipId === c.id;
    return (
      <div
        key={c.id}
        className={`group relative flex flex-col gap-1.5 rounded-xl border transition-colors ${
          isStrip ? "min-w-[104px] max-w-[118px] shrink-0 p-2" : "p-3"
        } ${
          isActive
            ? "border-amber-500/45 bg-amber-500/10"
            : "border-app-divider hover:border-white/20"
        }`}
      >
        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-black/30">
          {c.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.thumbnail_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Film className={`text-app-fg-subtle opacity-40 ${isStrip ? "h-4 w-4" : "h-5 w-5"}`} />
          )}
        </div>
        <p className={`line-clamp-1 font-medium text-app-fg ${isStrip ? "text-[10px]" : "text-[11px]"}`}>
          {c.label || `Clip ${c.id.slice(0, 6)}`}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={loading || isActive}
            onClick={() => void onPick(c.id)}
            className={`flex-1 rounded-lg bg-amber-500/15 font-bold text-app-on-amber-title hover:bg-amber-500/25 disabled:opacity-40 ${
              isStrip ? "py-0.5 text-[9px]" : "py-1 text-[10px]"
            }`}
          >
            {isActive ? "Active" : "Use"}
          </button>
          <button
            type="button"
            disabled={deletingClipId === c.id}
            onClick={() => void onDelete(c.id)}
            className="rounded-lg p-1 text-app-fg-subtle hover:bg-red-500/10 hover:text-red-400"
            aria-label="Delete clip"
          >
            {deletingClipId === c.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    );
  });

  return (
    <div>
      {showClipBanner && clipBannerUrl ? (
        <div
          className={`flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] ${
            isStrip ? "mb-2 px-3 py-2" : "mb-4 px-4 py-3"
          }`}
        >
          <Film className={`shrink-0 text-emerald-500 ${isStrip ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
          <div className="min-w-0">
            <p
              className={`font-semibold text-emerald-700 dark:text-emerald-300 ${
                isStrip ? "text-[10px]" : "text-xs"
              }`}
            >
              B-roll set
            </p>
            {!isStrip ? <p className="truncate text-[11px] text-app-fg-muted">{clipBannerUrl}</p> : null}
          </div>
        </div>
      ) : null}

      <div className={`flex items-center justify-between ${isStrip ? "mb-1.5" : "mb-3"}`}>
        <p className={`font-semibold text-app-fg ${isStrip ? "text-[10px]" : "text-xs"}`}>
          {isStrip ? "Pick clip" : "B-roll library"}{" "}
          <span className="font-normal text-app-fg-muted">
            ({clips.length})
          </span>
        </p>
        <Link
          href="/media?tab=broll"
          className={`shrink-0 font-semibold text-sky-500 hover:underline dark:text-sky-400 ${
            isStrip ? "text-[10px]" : "text-[11px]"
          }`}
        >
          Media →
        </Link>
      </div>

      {clips.length === 0 ? (
        <div
          className={`rounded-xl border border-dashed border-app-divider/60 text-center ${
            isStrip ? "py-4" : "py-8"
          }`}
        >
          <Film className={`mx-auto text-app-fg-subtle opacity-30 ${isStrip ? "mb-1 h-5 w-5" : "mb-2 h-6 w-6"}`} />
          <p className={`text-app-fg-subtle ${isStrip ? "mb-2 text-[10px]" : "mb-3 text-xs"}`}>No clips yet.</p>
          <Link
            href="/media?tab=broll"
            className={`inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 font-bold text-app-on-amber-title hover:bg-amber-500/25 ${
              isStrip ? "px-2 py-1 text-[10px]" : "px-3 py-1.5 text-xs"
            }`}
          >
            <Plus className="h-3 w-3" />
            Upload
          </Link>
        </div>
      ) : isStrip ? (
        <div className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-0.5 pt-0.5 [scrollbar-width:thin]">
          {clipCards}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{clipCards}</div>
      )}
    </div>
  );
}
