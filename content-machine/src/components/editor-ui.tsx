"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { VideoSpec } from "@/lib/video-spec";

export type ScopeMode = "slide" | "all";
export type CarouselTab = "text" | "background" | "slide";
export type CoverTab = "content" | "style" | "image";
export type VideoEditorTab = "text" | "background" | "look" | "timing";

/**
 * Single, shared "is my work safe?" indicator used by every editor surface
 * (video spec, cover spec, carousel slides, text blocks, layer text).
 *
 * States:
 *  - `inFlight > 0` -> animated "Saving…" pill
 *  - just-completed -> "Saved" pill, decays after a few seconds
 *  - error          -> red "Save failed — retry" pill (passes onRetry)
 *  - idle           -> nothing rendered (avoid visual noise when nothing's happening)
 *
 * The pill is intentionally tiny and never disables the surrounding controls;
 * users keep editing while we round-trip in the background.
 */
export function SaveStatusPill({
  inFlight,
  error,
  onRetry,
  className = "",
}: {
  inFlight: number;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  const [showSaved, setShowSaved] = useState(false);
  const lastInFlight = useRef(0);
  useEffect(() => {
    if (lastInFlight.current > 0 && inFlight === 0 && !error) {
      setShowSaved(true);
      const t = setTimeout(() => setShowSaved(false), 2200);
      return () => clearTimeout(t);
    }
    lastInFlight.current = inFlight;
  }, [inFlight, error]);

  if (error) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-300 ${className}`}
        title={error}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-300" />
        Save failed
        {onRetry ? (
          <button
            type="button"
            className="ml-1 underline-offset-2 hover:underline"
            onClick={onRetry}
          >
            retry
          </button>
        ) : null}
      </span>
    );
  }
  if (inFlight > 0) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md bg-sky-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-300 ${className}`}
        title="Saving your latest changes"
      >
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />
        Saving
      </span>
    );
  }
  if (showSaved) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-300 ${className}`}
        title="All edits saved"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />
        Saved
      </span>
    );
  }
  return null;
}

/**
 * Small `(?)` tooltip primitive for non-obvious labels (Hook, Block, Wash,
 * Apply to, Template, etc.). Tooltip body is the `children`; trigger label is
 * a tiny circle so it stays visually low-noise next to a control label.
 *
 * Keep tooltip text short (one line ideally, two max). Anything longer should
 * be a help doc, not a tooltip.
 */
/**
 * HelpHint — small "?" affordance with a hover/focus popover.
 *
 * Renders the popover ABOVE the trigger by default — most help hints sit
 * next to a label that has an input or list immediately below it, and
 * opening downward used to cover those controls. We also use a solid
 * background (no transparency) so the text is readable when the popover
 * crosses busy backgrounds (carousel previews, dark cards, etc.).
 */
export function HelpHint({
  children,
  label = "What's this?",
  className = "",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <span className={`group/help relative inline-flex items-center align-middle ${className}`}>
      <button
        type="button"
        aria-label={label}
        tabIndex={0}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-app-divider/70 text-[9px] font-bold leading-none text-app-fg-muted transition hover:border-amber-500/60 hover:text-amber-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-[70] mb-2 w-max max-w-[260px] -translate-x-1/2 rounded-lg border border-app-divider bg-zinc-900 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white opacity-0 shadow-[0_10px_30px_rgba(0,0,0,0.55)] transition-opacity duration-100 group-hover/help:visible group-hover/help:opacity-100 group-focus-within/help:visible group-focus-within/help:opacity-100 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {children}
        <span
          aria-hidden
          className="absolute left-1/2 top-full -mt-px h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-app-divider bg-zinc-900 dark:bg-zinc-100"
        />
      </span>
    </span>
  );
}

const CHIP_ON =
  "border-amber-500 bg-amber-500/15 text-amber-200 shadow-[0_0_0_1px_rgba(245,158,11,0.4)]";
const CHIP_OFF = "border-app-divider text-app-fg-muted hover:border-amber-500/40 hover:text-app-fg";

const LOOK_THEME_FONT: Record<VideoSpec["themeId"], string> = {
  "bold-modern": "Inter",
  editorial: "Playfair",
  "casual-hand": "Hand",
  "clean-minimal": "Inter",
};

const LOOK_LABEL: Record<VideoSpec["themeId"], string> = {
  "bold-modern": "Bold",
  editorial: "Editorial",
  "casual-hand": "Hand",
  "clean-minimal": "Minimal",
};

export function resolvedThemeFontLabel(themeId: VideoSpec["themeId"]): string {
  return LOOK_THEME_FONT[themeId] ?? "Playfair";
}

export function resolvedThemeLookLabel(themeId: VideoSpec["themeId"]): string {
  return LOOK_LABEL[themeId] ?? themeId;
}

export function EditorShell({
  preview,
  controls,
  previewMaxWidth = 400,
  embedded = false,
}: {
  preview: ReactNode;
  controls: ReactNode;
  previewMaxWidth?: number;
  /** Relaxed height when inside the Home studio overlay. */
  embedded?: boolean;
}) {
  return (
    <div
      className="grid gap-6 lg:items-start"
      style={{
        gridTemplateColumns: `minmax(0, ${previewMaxWidth}px) minmax(280px, 1fr)`,
      }}
    >
      <div className="flex flex-col items-center gap-3 md:sticky md:top-4 md:self-start lg:items-start">
        {preview}
      </div>
      <div
        className={
          embedded
            ? "flex min-w-0 flex-col overflow-visible rounded-2xl border border-app-divider/90 bg-app-chip-bg/25 shadow-sm"
            : "flex min-h-0 max-h-[calc(100vh-12rem)] min-w-0 flex-col overflow-hidden rounded-2xl border border-app-divider/90 bg-app-chip-bg/25 shadow-sm lg:max-h-[calc(100vh-12rem)]"
        }
      >
        {controls}
      </div>
    </div>
  );
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  tabs,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { id: T; label: string; icon?: ReactNode; badge?: string }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Editor sections"
      className={`inline-flex flex-wrap gap-0.5 rounded-lg border border-app-divider bg-app-chip-bg/40 p-0.5 ${className}`}
    >
      {tabs.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${
              active ? "bg-white/10 text-app-fg shadow-sm" : "text-app-fg-muted hover:text-app-fg"
            }`}
          >
            {t.icon}
            {t.label}
            {t.badge ? (
              <span className="rounded bg-app-divider/80 px-1 py-px text-[8px] font-bold text-app-fg-subtle">
                {t.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function ScopeToggle({
  value,
  onChange,
  slideLabel,
  allLabel,
}: {
  value: ScopeMode;
  onChange: (v: ScopeMode) => void;
  slideLabel: string;
  allLabel: string;
}) {
  return (
    <div className="space-y-1">
      <p className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-app-fg-muted">
        Apply to
        <HelpHint label="Apply to scope">
          Choose whether your edits affect only the slide you have open, or every slide at once.
        </HelpHint>
      </p>
      <div
        role="group"
        aria-label="Apply to"
        className="inline-flex w-full rounded-lg border border-app-divider bg-app-chip-bg/40 p-0.5"
      >
        <button
          type="button"
          aria-pressed={value === "slide"}
          onClick={() => onChange("slide")}
          className={`flex-1 rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition ${
            value === "slide" ? CHIP_ON : CHIP_OFF
          }`}
        >
          {slideLabel}
        </button>
        <button
          type="button"
          aria-pressed={value === "all"}
          onClick={() => onChange("all")}
          className={`flex-1 rounded-md px-2.5 py-1.5 text-[10px] font-semibold transition ${
            value === "all" ? CHIP_ON : CHIP_OFF
          }`}
        >
          {allLabel}
        </button>
      </div>
    </div>
  );
}

export function ControlGroupHeader({
  title,
  scope,
  slideIdx,
  slideCount,
}: {
  title: string;
  scope: ScopeMode;
  slideIdx: number;
  slideCount: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-app-fg-muted">{title}</p>
      <span
        className={
          scope === "all"
            ? "shrink-0 text-[10px] font-semibold text-amber-500"
            : "shrink-0 text-[10px] text-app-fg-subtle"
        }
      >
        {scope === "all" ? `All ${slideCount} slides` : `Slide ${slideIdx + 1} only`}
      </span>
    </div>
  );
}

const ALIGN_GRID: { x: number; y: number }[] = [
  { x: 0.2, y: 0.22 },
  { x: 0.5, y: 0.22 },
  { x: 0.8, y: 0.22 },
  { x: 0.2, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.8, y: 0.5 },
  { x: 0.2, y: 0.82 },
  { x: 0.5, y: 0.82 },
  { x: 0.8, y: 0.82 },
];

function cellActive(x: number, y: number, cx: number, cy: number): boolean {
  return Math.abs(x - cx) < 0.12 && Math.abs(y - cy) < 0.12;
}

export function AlignmentPad({
  x,
  y,
  disabled,
  onPick,
}: {
  x: number;
  y: number;
  disabled?: boolean;
  onPick: (xy: { x: number; y: number }) => void;
}) {
  return (
    <div
      className="grid h-24 w-24 grid-cols-3 grid-rows-3 gap-0.5 rounded-lg border border-app-divider p-1"
      role="group"
      aria-label="Text position on slide"
    >
      {ALIGN_GRID.map((cell, i) => {
        const active = cellActive(cell.x, cell.y, x, y);
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            title={`Position ${Math.round(cell.x * 100)}% × ${Math.round(cell.y * 100)}%`}
            onClick={() => onPick(cell)}
            className={`rounded-sm border transition disabled:opacity-40 ${
              active ? CHIP_ON : "border-transparent bg-app-chip-bg/50 hover:border-amber-500/35"
            }`}
          >
            <span className="sr-only">
              {active ? "Selected" : "Set"} position
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ScopeLockedHint({ message }: { message?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-app-chip-bg/60 px-1.5 py-0.5 text-[9px] font-semibold text-app-fg-subtle"
      title={message ?? "Switch Apply to back to This slide to edit just this one."}
    >
      <svg className="h-3 w-3 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M7 11V8a5 5 0 0110 0v3M6 11h12v10H6V11z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      This slide only
    </span>
  );
}

export function CarouselEditableEmptyState({
  busy,
  converting,
  onConvert,
}: {
  busy?: boolean;
  converting?: boolean;
  onConvert: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/10 px-4 py-6 text-center">
      <p className="text-[11px] leading-relaxed text-app-fg-muted">
        This slide is a flat image. Enable text editing to unlock the text box, fonts and layout controls.
      </p>
      <button
        type="button"
        disabled={busy || converting}
        onClick={onConvert}
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-zinc-950 hover:opacity-90 disabled:opacity-50"
      >
        {converting ? (
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-950/30 border-t-zinc-950" />
        ) : null}
        {converting ? "Converting…" : "Enable text editing"}
      </button>
    </div>
  );
}

export function InheritanceHint({ children }: { children: ReactNode }) {
  return <p className="text-[10px] leading-snug text-app-fg-subtle">{children}</p>;
}

export function resolvedContrastLabel(
  contrast: "auto" | "light" | "dark",
  themeId: VideoSpec["themeId"],
): string {
  if (contrast === "light") return "Light text on dark background";
  if (contrast === "dark") return "Dark text on light background";
  return `Auto — inferred from ${resolvedThemeLookLabel(themeId)} look`;
}
