/**
 * StudioShell — 2-pane editor layout (preview center-left, inspector right).
 *
 * Slot-based primitive. Each format editor (VideoEditor, CoverEditor,
 * CarouselEditor, TalkingHeadEditor) renders into the same shell, so the
 * structural redesign is one component instead of N. Respects the global app
 * sidebar (the shell is itself the second column of the dashboard) — no
 * second left rail, no stepper.
 *
 * Layout (desktop):
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ topChrome:  [topTabs]   [topStatus]   [topActions]                  │
 *   ├──────────────────────────────────────────┬──────────────────────────┤
 *   │ preview   (sticky, fluid width)          │ inspector  (~340px)      │
 *   │                                          │                          │
 *   │ [timeline] (optional, under preview)     │ (selection-driven)       │
 *   └──────────────────────────────────────────┴──────────────────────────┘
 *
 * On narrow viewports, preview and inspector stack vertically; topTabs and
 * topActions stay pinned at the top.
 */

import type { ReactNode } from "react";

export type StudioShellProps = {
  /** Format-aware tab toggle (e.g. `[Reel] [Cover]`). Optional — single-canvas
   *  formats like carousel/cover-only don't render top tabs. */
  topTabs?: ReactNode;
  /** Save status pill (single global indicator, replaces per-section pills). */
  topStatus?: ReactNode;
  /** Top-right action area: usually `<PreviewPostButton/> <ExportButton/>` */
  topActions?: ReactNode;

  /** The main canvas: VideoSpecPreview, CoverTextLayerEditor, CarouselTextLayerEditor, etc. */
  preview: ReactNode;
  /** Optional row under the preview — video timeline strip, carousel slide reel. */
  timeline?: ReactNode;
  /** Right pane: contextual controls driven by the editor's current selection. */
  inspector: ReactNode;
};

export function StudioShell({
  topTabs,
  topStatus,
  topActions,
  preview,
  timeline,
  inspector,
}: StudioShellProps) {
  return (
    <div className="flex flex-col gap-3">
      {(topTabs || topStatus || topActions) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-app-divider/60 pb-3">
          <div className="min-w-0 flex-1">{topTabs}</div>
          {topStatus ? (
            <div className="shrink-0 text-[10px] text-app-fg-muted">{topStatus}</div>
          ) : null}
          {topActions ? (
            <div className="flex shrink-0 items-center gap-2">{topActions}</div>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
        {/* Preview column — sticky on desktop so it stays in view while
            scrolling inspector controls. The `lg:basis-*` mirrors the layout
            the inline video pipeline already uses (Step 2 in the legacy
            workspace), so switching a format from inline → StudioShell is
            visually a no-op. */}
        <div className="mx-auto flex w-full max-w-[360px] shrink-0 flex-col gap-3 lg:sticky lg:top-4 lg:mx-0 lg:basis-[360px] lg:max-w-none lg:self-start xl:basis-[400px]">
          {preview}
          {timeline ? <div className="w-full">{timeline}</div> : null}
        </div>

        {/* Inspector column — scrollable, capped to viewport height so
            controls don't push the layout when the preview is sticky. */}
        <div className="flex min-h-0 max-h-[calc(100vh-9rem)] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-app-divider/80 bg-app-chip-bg/20 shadow-sm">
          <div className="min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:thin]">
            {inspector}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Top tab bar primitive — used inside `topTabs` slot. Each format that has
 * multiple canvases (video → Reel / Cover, talking_head → Script / Cover)
 * passes its tab set; single-canvas formats omit the slot entirely.
 */
export function StudioFormatTabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { id: T; label: string }[];
}) {
  return (
    <div
      role="tablist"
      aria-label="Editor canvas"
      className="inline-flex rounded-xl border border-app-divider bg-app-chip-bg/40 p-1"
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
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "bg-white/10 text-app-fg shadow-sm"
                : "text-app-fg-muted hover:text-app-fg"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
