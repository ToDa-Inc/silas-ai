/**
 * ClientImagesPicker — grid / strip selector for the client's uploaded images.
 *
 * Used by Cover editor (compact strip) and Video editor (BackgroundPicker grid).
 * Pure leaf (props in / events out).
 */

import Link from "next/link";
import { Image as ImageIcon, Plus } from "lucide-react";
import type { ClientImageRow } from "@/lib/api-client";

type Props = {
  images: ClientImageRow[];
  selectedImageId: string;
  busy: boolean;
  onPick: (id: string) => void;
  emptyHint?: string;
  /** Horizontal strip — less vertical scroll in dense editors (e.g. reel cover). */
  compact?: boolean;
};

export function ClientImagesPicker({
  images,
  selectedImageId,
  busy,
  onPick,
  emptyHint = "No client images yet.",
  compact = false,
}: Props) {
  return (
    <div>
      <div className={`flex items-center justify-between ${compact ? "mb-1.5" : "mb-3"}`}>
        <p className={`font-semibold text-app-fg ${compact ? "text-[10px]" : "text-xs"}`}>
          Client images{" "}
          <span className="font-normal text-app-fg-muted">
            ({images.length})
          </span>
        </p>
        <Link
          href="/media?tab=images"
          className={`font-semibold text-sky-500 hover:underline dark:text-sky-400 ${compact ? "text-[10px]" : "text-[11px]"}`}
        >
          Media →
        </Link>
      </div>

      {images.length === 0 ? (
        <div
          className={`rounded-xl border border-dashed border-app-divider/60 text-center ${compact ? "py-4" : "py-8"}`}
        >
          <ImageIcon className={`mx-auto text-app-fg-subtle opacity-30 ${compact ? "mb-1 h-5 w-5" : "mb-2 h-6 w-6"}`} />
          <p className={`text-app-fg-subtle ${compact ? "mb-2 text-[10px]" : "mb-3 text-xs"}`}>{emptyHint}</p>
          <Link
            href="/media?tab=images"
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-app-on-amber-title hover:bg-amber-500/25"
          >
            <Plus className="h-3 w-3" />
            Upload
          </Link>
        </div>
      ) : compact ? (
        <div className="-mx-0.5 flex max-h-[11rem] flex-wrap gap-2 overflow-y-auto overflow-x-hidden pb-1 pt-0.5 [scrollbar-width:thin] sm:max-h-none sm:flex-nowrap sm:overflow-x-auto sm:overflow-y-hidden">
          {images.map((img) => {
            const isActive = selectedImageId === img.id;
            return (
              <button
                key={img.id}
                type="button"
                disabled={busy}
                onClick={() => onPick(img.id)}
                className={`w-[4.5rem] shrink-0 overflow-hidden rounded-lg border-2 p-0.5 text-left transition-colors sm:w-16 ${
                  isActive
                    ? "border-amber-500 bg-amber-500/12 ring-1 ring-amber-500/35"
                    : "border-app-divider hover:border-amber-500/40"
                } disabled:opacity-50`}
              >
                <div className="overflow-hidden rounded-md bg-black/10" style={{ aspectRatio: "9/16" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.file_url} alt="" className="h-full w-full object-cover" />
                </div>
                {img.label ? (
                  <p className="mt-0.5 truncate px-0.5 text-[9px] text-app-fg-subtle">{img.label}</p>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {images.map((img) => {
            const isActive = selectedImageId === img.id;
            return (
              <button
                key={img.id}
                type="button"
                disabled={busy}
                onClick={() => onPick(img.id)}
                className={`group flex flex-col gap-1 overflow-hidden rounded-xl border p-1.5 text-left transition-colors ${
                  isActive
                    ? "border-amber-500/45 bg-amber-500/10"
                    : "border-app-divider hover:border-white/20"
                } disabled:opacity-50`}
                title={img.label || "Use this image"}
              >
                <div className="overflow-hidden rounded-lg bg-black/10" style={{ aspectRatio: "9/16" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.file_url} alt="" className="h-full w-full object-cover" />
                </div>
                <span className="line-clamp-1 px-1 text-[10px] text-app-fg-muted">
                  {isActive ? "Active" : img.label || "Use"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
