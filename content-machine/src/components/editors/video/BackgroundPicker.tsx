/**
 * BackgroundPicker — single home for the three video background paradigms.
 *
 * Today the host editor splits these across two visual regions:
 *   - AI image + Client photo render inside the Background tab panel.
 *   - Stock clip renders below the preview as a separate strip.
 *
 * This component collapses both into one place: header tabs (AI / Photo / Clip)
 * plus the matching per-source body. The host still owns the IO (fetch, set,
 * delete) — this is a pure props-in / events-out surface.
 */
"use client";

import Link from "next/link";
import { Film, Image as ImageIcon, Loader2, Sparkles, Trash2 } from "lucide-react";

import type { BrollClipRow, ClientImageRow } from "@/lib/api-client";

export type BackgroundSource = "ai" | "image" | "clip";

type Props = {
  source: BackgroundSource;
  onSourceChange: (source: BackgroundSource) => void;

  /** AI generate */
  aiBusy: boolean;
  hasGeneratedImage: boolean;
  onGenerateAi: () => void | Promise<void>;

  /** Client photo */
  images: ClientImageRow[];
  selectedImageId: string;
  pickerBusy: boolean;
  onPickImage: (id: string) => void;

  /** Stock clip */
  clips: BrollClipRow[];
  selectedClipId: string;
  sessionBrollClipId?: string | null;
  deletingClipId: string | null;
  onPickClip: (id: string) => void;
  onDeleteClip: (id: string) => void;

  /** Optional: link to current asset, if one is set. */
  backgroundUrl?: string | null;

  /** Disable all controls (e.g. while a render is in flight). */
  disabled?: boolean;
};

const SOURCES = [
  { key: "ai", label: "AI image", icon: Sparkles },
  { key: "image", label: "Client photo", icon: ImageIcon },
  { key: "clip", label: "Stock clip", icon: Film },
] as const;

export function BackgroundPicker({
  source,
  onSourceChange,
  aiBusy,
  hasGeneratedImage,
  onGenerateAi,
  images,
  selectedImageId,
  pickerBusy,
  onPickImage,
  clips,
  selectedClipId,
  sessionBrollClipId,
  deletingClipId,
  onPickClip,
  onDeleteClip,
  backgroundUrl,
  disabled,
}: Props) {
  return (
    <div className="space-y-3 rounded-xl border border-app-divider/50 bg-app-chip-bg/15 p-3.5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-app-fg-muted">Background</p>
        <p className="mt-0.5 text-[9px] leading-snug text-app-fg-subtle">
          Pick how the reel’s backdrop is sourced. You can change this any time before render.
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-app-divider bg-app-chip-bg/40 p-1">
        {SOURCES.map(({ key, label, icon: Icon }) => {
          const active = source === key;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onSourceChange(key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                active
                  ? "bg-white/10 text-app-fg shadow-sm"
                  : "text-app-fg-muted hover:text-app-fg"
              }`}
              aria-pressed={active}
            >
              <Icon className="h-3 w-3" /> {label}
            </button>
          );
        })}
      </div>

      {source === "ai" ? (
        <AiPanel
          busy={aiBusy || Boolean(disabled)}
          hasGeneratedImage={hasGeneratedImage}
          onGenerate={onGenerateAi}
        />
      ) : null}

      {source === "image" ? (
        <ImagePanel
          images={images}
          selectedImageId={selectedImageId}
          busy={pickerBusy || Boolean(disabled)}
          onPick={onPickImage}
        />
      ) : null}

      {source === "clip" ? (
        <ClipPanel
          clips={clips}
          selectedClipId={selectedClipId}
          sessionBrollClipId={sessionBrollClipId}
          deletingClipId={deletingClipId}
          busy={pickerBusy || Boolean(disabled)}
          onPick={onPickClip}
          onDelete={onDeleteClip}
        />
      ) : null}

      {backgroundUrl ? (
        <a
          href={backgroundUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex text-[10px] font-semibold text-app-fg-muted underline decoration-app-divider underline-offset-2 hover:text-amber-200/90"
        >
          Open background asset ↗
        </a>
      ) : null}
    </div>
  );
}

function AiPanel({
  busy,
  hasGeneratedImage,
  onGenerate,
}: {
  busy: boolean;
  hasGeneratedImage: boolean;
  onGenerate: () => void | Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onGenerate()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2.5 text-xs font-bold text-app-on-amber-title hover:bg-amber-500/25 disabled:opacity-50 sm:w-auto sm:justify-start"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {busy ? "Generating…" : hasGeneratedImage ? "Regenerate image" : "Generate image"}
      </button>
      <p className="text-[10px] text-app-fg-muted">~30–60s per run.</p>
    </div>
  );
}

function ImagePanel({
  images,
  selectedImageId,
  busy,
  onPick,
}: {
  images: ClientImageRow[];
  selectedImageId: string;
  busy: boolean;
  onPick: (id: string) => void;
}) {
  if (images.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-app-divider/60 py-6 text-center">
        <ImageIcon className="mx-auto mb-2 h-6 w-6 text-app-fg-subtle opacity-30" />
        <p className="mb-3 text-xs text-app-fg-subtle">No client images yet.</p>
        <Link
          href="/media?tab=images"
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-app-on-amber-title hover:bg-amber-500/25"
        >
          Upload to Media →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold text-app-fg">
          Client images <span className="font-normal text-app-fg-muted">({images.length})</span>
        </p>
        <Link
          href="/media?tab=images"
          className="text-[10px] font-semibold text-sky-500 hover:underline dark:text-sky-400"
        >
          Media →
        </Link>
      </div>
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
    </div>
  );
}

function ClipPanel({
  clips,
  selectedClipId,
  sessionBrollClipId,
  deletingClipId,
  busy,
  onPick,
  onDelete,
}: {
  clips: BrollClipRow[];
  selectedClipId: string;
  sessionBrollClipId?: string | null;
  deletingClipId: string | null;
  busy: boolean;
  onPick: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (clips.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-app-divider/60 py-6 text-center">
        <Film className="mx-auto mb-2 h-6 w-6 text-app-fg-subtle opacity-30" />
        <p className="mb-3 text-xs text-app-fg-subtle">No clips yet.</p>
        <Link
          href="/media?tab=broll"
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-app-on-amber-title hover:bg-amber-500/25"
        >
          Upload B-roll →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold text-app-fg">
          B-roll library <span className="font-normal text-app-fg-muted">({clips.length})</span>
        </p>
        <Link
          href="/media?tab=broll"
          className="text-[10px] font-semibold text-sky-500 hover:underline dark:text-sky-400"
        >
          Media →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {clips.map((c) => {
          const isActive = selectedClipId === c.id || sessionBrollClipId === c.id;
          return (
            <div
              key={c.id}
              className={`group relative flex flex-col gap-1.5 rounded-xl border p-3 transition-colors ${
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
                  <Film className="h-5 w-5 text-app-fg-subtle opacity-40" />
                )}
              </div>
              <p className="line-clamp-1 text-[11px] font-medium text-app-fg">
                {c.label || `Clip ${c.id.slice(0, 6)}`}
              </p>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={busy || isActive}
                  onClick={() => onPick(c.id)}
                  className="flex-1 rounded-lg bg-amber-500/15 py-1 text-[10px] font-bold text-app-on-amber-title hover:bg-amber-500/25 disabled:opacity-40"
                >
                  {isActive ? "Active" : "Use"}
                </button>
                <button
                  type="button"
                  disabled={deletingClipId === c.id}
                  onClick={() => onDelete(c.id)}
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
        })}
      </div>
    </div>
  );
}
