"use client";

import { useCallback, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { buildLayerRows, type VideoLayerRow } from "@/lib/video-spec-layer-timeline";

const DRAG_THRESHOLD_PX = 3;

function formatSecondsShort(sec: number): string {
  if (!Number.isFinite(sec)) return "0s";
  return `${sec.toFixed(sec >= 10 ? 0 : 1)}s`;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Professional interval ticks builder (e.g. 0s, 2s, 4s... instead of decimals like 1.9s) */
function getNiceRulerMarks(totalSec: number): { sec: number; leftPct: number }[] {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30];
  let step = 2;
  const targetCount = 6;
  
  let minDiff = Infinity;
  for (const s of steps) {
    const count = totalSec / s;
    const diff = Math.abs(count - targetCount);
    if (diff < minDiff) {
      minDiff = diff;
      step = s;
    }
  }
  
  const marks: { sec: number; leftPct: number }[] = [];
  for (let sec = 0; sec <= totalSec; sec += step) {
    const roundedSec = Math.round(sec * 10) / 10;
    marks.push({
      sec: roundedSec,
      leftPct: (roundedSec / totalSec) * 100,
    });
  }
  
  if (totalSec - (marks[marks.length - 1]?.sec ?? 0) > step / 2) {
    const finalSec = Math.round(totalSec * 10) / 10;
    marks.push({
      sec: finalSec,
      leftPct: 100,
    });
  }
  return marks;
}

/** Circle handle used on clip trim and beat timing strips. */
export function TimelineCircleHandle({
  leftPct,
  ariaLabel,
  title,
  disabled,
  onPointerDown,
}: {
  leftPct: number;
  ariaLabel: string;
  title: string;
  disabled?: boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      onPointerDown={onPointerDown}
      className="group absolute top-1/2 z-20 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center bg-transparent p-0 outline-none disabled:cursor-not-allowed disabled:opacity-40"
      style={{ left: `${leftPct}%` }}
    >
      <span className="block h-3.5 w-3.5 rounded-full border-2 border-white/70 bg-white/30 shadow group-hover:border-white group-hover:bg-white/90" />
    </button>
  );
}

/** Trim which part of the source video is used as background. */
export function ClipTrimStrip({
  sourceDurationSec,
  trimStartSec,
  trimEndSec,
  timelineSec,
  disabled,
  onChange,
  onCommit,
  compact = false,
}: {
  sourceDurationSec: number;
  trimStartSec: number;
  trimEndSec: number;
  timelineSec: number;
  disabled?: boolean;
  onChange: (start: number, end: number) => void;
  onCommit: (start: number, end: number) => void;
  /** Tighter layout when stacked under preview. */
  compact?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const start = Math.max(0, Math.min(sourceDurationSec - 0.5, trimStartSec));
  const end = Math.max(start + 0.5, Math.min(sourceDurationSec, trimEndSec));
  const activeDur = Math.max(0.5, end - start);
  const leftPct = (start / sourceDurationSec) * 100;
  const widthPct = (activeDur / sourceDurationSec) * 100;
  const beatsOver = timelineSec > activeDur + 0.25;

  const valueFromPointer = (e: PointerEvent | ReactPointerEvent) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    return Math.round((x / Math.max(1, rect.width)) * sourceDurationSec * 10) / 10;
  };

  const beginDrag = (kind: "start" | "end") => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    let latestStart = start;
    let latestEnd = end;
    let moved = false;
    const startClientX = e.clientX;
    const apply = (clientEvent: PointerEvent | ReactPointerEvent) => {
      const v = valueFromPointer(clientEvent);
      if (kind === "start") {
        latestStart = Math.max(0, Math.min(v, latestEnd - 0.5));
      } else {
        latestEnd = Math.min(sourceDurationSec, Math.max(v, latestStart + 0.5));
      }
      if (Math.abs(clientEvent.clientX - startClientX) >= DRAG_THRESHOLD_PX) moved = true;
      onChange(latestStart, latestEnd);
    };
    apply(e);
    const onMove = (mv: PointerEvent) => apply(mv);
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      if (moved) onCommit(latestStart, latestEnd);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  const rulerMarks = useMemo(() => {
    return getNiceRulerMarks(sourceDurationSec);
  }, [sourceDurationSec]);

  return (
    <div className="space-y-2 text-left">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-app-fg-muted">Background clip</p>
        <span className="rounded-sm bg-app-chip-bg/50 px-1.5 py-px text-[9px] font-bold tabular-nums text-app-fg-muted">
          {formatSecondsShort(activeDur)} active · {formatSecondsShort(sourceDurationSec)} file
        </span>
      </div>
      <div
        className="relative overflow-visible rounded-lg border border-app-divider/60 bg-app-chip-bg/25 p-2"
        title="Drag the circles to set which part of the source video plays behind the reel"
      >
        {/* Safety horizontal margins wrapper inside the bordered container */}
        <div ref={trackRef} className="relative mx-3 overflow-visible">
          <div className="relative mb-1 h-4 border-b border-app-divider/40">
            {rulerMarks.map((m) => (
              <span
                key={m.sec.toFixed(2)}
                className="absolute top-0 h-full border-l border-white/15 pl-0.5 text-[8px] font-semibold tabular-nums text-app-fg-subtle"
                style={{ left: `${m.leftPct}%` }}
              >
                {formatSecondsShort(m.sec)}
              </span>
            ))}
          </div>
          <div className="relative h-8 rounded-md bg-black/15">
            <div className="absolute inset-y-0 left-0 bg-white/5" style={{ width: `${leftPct}%` }} />
            <div
              className="absolute inset-y-0 rounded-md border border-amber-400/60 bg-amber-500/25"
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            />
            <div className="absolute inset-y-0 right-0 bg-white/5" style={{ left: `${Math.min(100, leftPct + widthPct)}%` }} />
            <TimelineCircleHandle
              leftPct={leftPct}
              disabled={disabled}
              ariaLabel="Set clip start"
              title="Drag clip in"
              onPointerDown={beginDrag("start")}
            />
            <TimelineCircleHandle
              leftPct={leftPct + widthPct}
              disabled={disabled}
              ariaLabel="Set clip end"
              title="Drag clip out"
              onPointerDown={beginDrag("end")}
            />
          </div>
        </div>
      </div>
      {compact ? (
        <p className="text-[9px] text-app-fg-subtle">
          <span className="font-semibold tabular-nums text-app-fg">
            {formatSecondsShort(start)}–{formatSecondsShort(end)}
          </span>
          {" · "}
          <span className={beatsOver ? "font-semibold text-amber-200" : "text-app-fg-subtle"}>
            beats {formatSecondsShort(timelineSec)}/{formatSecondsShort(activeDur)}
          </span>
        </p>
      ) : (
        <p className="text-[9px] text-app-fg-subtle">
          Active window{" "}
          <span className="font-semibold tabular-nums text-app-fg">
            {formatSecondsShort(start)}–{formatSecondsShort(end)}
          </span>
          {" · "}
          Beats{" "}
          <span className={beatsOver ? "font-semibold text-amber-200" : "font-semibold text-emerald-300"}>
            {formatSecondsShort(timelineSec)} / {formatSecondsShort(activeDur)}
          </span>
        </p>
      )}
    </div>
  );
}

type LayerStripProps = {
  layers: VideoLayerRow[];
  timelineSec: number;
  selectedSegmentId: string | null;
  disabled?: boolean;
  onSelectSegment?: (id: string) => void;
  onResizeLayerTimingDraft?: (id: string, timing: { startSec?: number; endSec?: number }) => void;
  onResizeLayerTimingCommit?: (id: string, timing: { startSec?: number; endSec?: number }) => void;
  /** Playhead position 0–100; omit to hide. */
  playheadPct?: number | null;
  /** Drag playhead to scrub preview (seconds on reel timeline). */
  onScrubPlayhead?: (sec: number) => void;
  /** Hide section title when stacked under preview. */
  compact?: boolean;
};

/** Beat timing strip — same circle-on-line controls as under the preview. */
export function LayerTimingStrip({
  layers,
  timelineSec,
  selectedSegmentId,
  disabled,
  onSelectSegment,
  onResizeLayerTimingDraft,
  onResizeLayerTimingCommit,
  playheadPct = null,
  onScrubPlayhead,
  compact = false,
}: LayerStripProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    layer: VideoLayerRow;
    edge: "start" | "end";
    startClientX: number;
    pixelsPerSec: number;
    moved: boolean;
    lastTiming: { startSec?: number; endSec?: number };
  } | null>(null);
  const dragJustEndedRef = useRef(false);

  const trackOrderRef = useRef<string[]>([]);
  const activeIds = useMemo(() => layers.map((l) => l.id), [layers]);

  // Stable row tracking so tracks never swap vertical rows during drag / save
  useEffect(() => {
    const currentOrder = trackOrderRef.current;
    const nextOrder = currentOrder.filter((id) => activeIds.includes(id));
    for (const id of activeIds) {
      if (!nextOrder.includes(id)) {
        nextOrder.push(id);
      }
    }
    trackOrderRef.current = nextOrder;
  }, [activeIds]);

  const sortedLayers = useMemo(() => {
    const order = trackOrderRef.current;
    return [...layers].sort((a, b) => {
      const idxA = order.indexOf(a.id);
      const idxB = order.indexOf(b.id);
      if (idxA === -1 || idxB === -1) return 0;
      return idxA - idxB;
    });
  }, [layers]);

  // Compute completely stationary, stable labels (Hook, Text 1, Text 2, CTA...)
  const blockLabelMap = useMemo(() => {
    const order = trackOrderRef.current;
    const map: Record<string, string> = { hook: "Hook" };
    let textCount = 0;
    order.forEach((id) => {
      if (id === "hook") return;
      const lay = layers.find((l) => l.id === id);
      if (!lay) return;
      if (lay.isCTA) {
        map[id] = "CTA";
      } else {
        textCount++;
        map[id] = `Text ${textCount}`;
      }
    });
    return map;
  }, [layers]);

  const rulerMarks = useMemo(() => {
    return getNiceRulerMarks(timelineSec);
  }, [timelineSec]);

  const onLayerEdgeResizeStart = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, layer: VideoLayerRow, edge: "start" | "end") => {
      const stripEl = stripRef.current;
      if (!stripEl || disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const stripRect = stripEl.getBoundingClientRect();
      const pxPerSec = stripRect.width / timelineSec;

      // Define snapping targets: snap to 0.0s, the video end, and other layers' startSec/endSec
      const snapTargets: number[] = [0, timelineSec];
      layers.forEach((l) => {
        if (l.id !== layer.id) {
          snapTargets.push(l.startSec);
          snapTargets.push(l.endSec);
        }
      });
      const SNAP_THRESHOLD_SEC = 0.15;

      const snapValue = (val: number): number => {
        for (const target of snapTargets) {
          if (Math.abs(val - target) <= SNAP_THRESHOLD_SEC) {
            return target;
          }
        }
        return val;
      };

      dragStateRef.current = {
        layer,
        edge,
        startClientX: e.clientX,
        pixelsPerSec: pxPerSec,
        moved: false,
        lastTiming: edge === "start" ? { startSec: layer.startSec } : { endSec: layer.endSec },
      };
      const onMove = (mv: PointerEvent) => {
        const st = dragStateRef.current;
        if (!st) return;
        const deltaPx = mv.clientX - st.startClientX;
        if (!st.moved && Math.abs(deltaPx) >= DRAG_THRESHOLD_PX) st.moved = true;
        if (!st.moved) return;
        const deltaSec = deltaPx / st.pixelsPerSec;
        
        let nextVal =
          st.edge === "start"
            ? Math.round((st.layer.startSec + deltaSec) * 10) / 10
            : Math.round((st.layer.endSec + deltaSec) * 10) / 10;

        nextVal = snapValue(nextVal);

        let nextTiming: { startSec?: number; endSec?: number };
        if (st.edge === "start") {
          // Clamp start to [0, currentEnd - 0.1]
          const clampedStart = Math.max(0, Math.min(nextVal, st.layer.endSec - 0.1));
          nextTiming = { startSec: clampedStart };
        } else {
          // Clamp end to [currentStart + 0.1, timelineSec]
          const clampedEnd = Math.min(timelineSec, Math.max(nextVal, st.layer.startSec + 0.1));
          nextTiming = { endSec: clampedEnd };
        }

        if (nextTiming.startSec !== st.lastTiming.startSec || nextTiming.endSec !== st.lastTiming.endSec) {
          st.lastTiming = nextTiming;
          onResizeLayerTimingDraft?.(st.layer.id, nextTiming);
        }
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        const st = dragStateRef.current;
        dragStateRef.current = null;
        if (!st) return;
        if (st.moved) {
          dragJustEndedRef.current = true;
          window.setTimeout(() => {
            dragJustEndedRef.current = false;
          }, 50);
          onResizeLayerTimingCommit?.(st.layer.id, st.lastTiming);
        }
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    },
    [disabled, onResizeLayerTimingCommit, onResizeLayerTimingDraft, timelineSec, layers],
  );

  const onBlockSlideStart = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, layer: VideoLayerRow) => {
      const stripEl = stripRef.current;
      if (!stripEl || disabled) return;

      const isHook = layer.id === "hook";
      if (isHook) {
        onSelectSegment?.(layer.id);
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      const stripRect = stripEl.getBoundingClientRect();
      const pxPerSec = stripRect.width / timelineSec;

      const duration = layer.endSec - layer.startSec;
      const startClientX = e.clientX;
      let moved = false;
      let latestStart = layer.startSec;
      let latestEnd = layer.endSec;

      // Define snapping targets for sliding blocks
      const snapTargets: number[] = [0, timelineSec];
      layers.forEach((l) => {
        if (l.id !== layer.id) {
          snapTargets.push(l.startSec);
          snapTargets.push(l.endSec);
        }
      });
      const SNAP_THRESHOLD_SEC = 0.15;

      const snapValueForSlide = (startVal: number, endVal: number): { start: number; end: number } => {
        // Try snapping the leading edge first
        for (const target of snapTargets) {
          if (Math.abs(startVal - target) <= SNAP_THRESHOLD_SEC) {
            return { start: target, end: Math.round((target + duration) * 10) / 10 };
          }
        }
        // Try snapping the trailing edge second
        for (const target of snapTargets) {
          if (Math.abs(endVal - target) <= SNAP_THRESHOLD_SEC) {
            return { start: Math.round((target - duration) * 10) / 10, end: target };
          }
        }
        return { start: startVal, end: endVal };
      };

      const apply = (clientEvent: PointerEvent) => {
        const deltaPx = clientEvent.clientX - startClientX;
        if (!moved && Math.abs(deltaPx) >= DRAG_THRESHOLD_PX) {
          moved = true;
          dragJustEndedRef.current = true;
        }
        if (!moved) return;

        const deltaSec = deltaPx / pxPerSec;
        const rawStart = Math.round((layer.startSec + deltaSec) * 10) / 10;
        const rawEnd = Math.round((rawStart + duration) * 10) / 10;

        const snapped = snapValueForSlide(rawStart, rawEnd);
        let nextStart = snapped.start;
        let nextEnd = snapped.end;

        if (nextStart < 0) {
          nextStart = 0;
          nextEnd = Math.round(duration * 10) / 10;
        } else if (nextEnd > timelineSec) {
          nextEnd = Math.round(timelineSec * 10) / 10;
          nextStart = Math.round((nextEnd - duration) * 10) / 10;
        }

        latestStart = nextStart;
        latestEnd = nextEnd;

        onResizeLayerTimingDraft?.(layer.id, { startSec: nextStart, endSec: nextEnd });
      };

      const onMove = (mv: PointerEvent) => apply(mv);
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);

        if (moved) {
          onResizeLayerTimingCommit?.(layer.id, { startSec: latestStart, endSec: latestEnd });
          window.setTimeout(() => {
            dragJustEndedRef.current = false;
          }, 50);
        } else {
          dragJustEndedRef.current = false;
          onSelectSegment?.(layer.id);
        }
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    },
    [disabled, onResizeLayerTimingCommit, onResizeLayerTimingDraft, onSelectSegment, timelineSec],
  );

  const onPlayheadScrubStart = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement | HTMLDivElement>) => {
      const stripEl = stripRef.current;
      if (!stripEl || disabled || !onScrubPlayhead) return;
      e.preventDefault();
      e.stopPropagation();
      const scrubFromClientX = (clientX: number) => {
        const rect = stripEl.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const sec = Math.round((x / Math.max(1, rect.width)) * timelineSec * 10) / 10;
        onScrubPlayhead(Math.max(0, Math.min(timelineSec, sec)));
      };
      scrubFromClientX(e.clientX);
      const onMove = (mv: PointerEvent) => scrubFromClientX(mv.clientX);
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    },
    [disabled, onScrubPlayhead, timelineSec],
  );

  if (layers.length === 0) return null;

  const showPlayhead = playheadPct != null;
  const playheadDraggable = showPlayhead && onScrubPlayhead != null && !disabled;

  return (
    <div className="space-y-2 text-left">
      {compact ? null : (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-app-fg-muted">Text beats</p>
          <span className="rounded-sm bg-app-chip-bg/50 px-1.5 py-px text-[9px] font-bold tabular-nums text-app-fg-muted">
            {formatSecondsShort(timelineSec)} reel
          </span>
        </div>
      )}
      <div
        className="relative overflow-visible rounded-lg border border-app-divider/60 bg-app-chip-bg/25 p-2"
      >
        {/* Safety horizontal margins wrapper inside the bordered container */}
        <div ref={stripRef} className="relative mx-3 overflow-visible">
          {/* Scrubbable timeline header / ruler band */}
          <div
            onPointerDown={onPlayheadScrubStart}
            className="relative mb-1 h-5 border-b border-app-divider/40 cursor-ew-resize select-none"
          >
            {rulerMarks.map((m) => (
              <span
                key={m.sec.toFixed(2)}
                className="absolute top-0 h-full border-l border-white/15 pl-0.5 text-[8px] font-semibold tabular-nums text-app-fg-subtle"
                style={{ left: `${m.leftPct}%` }}
              >
                {m.sec.toFixed(m.sec >= 10 ? 0 : 1)}s
              </span>
            ))}
          </div>
          <div className="space-y-1 relative">
            {sortedLayers.map((s) => {
              const isSelected = selectedSegmentId === s.id;
              const canDragStart = s.kind !== "hook";
              const cursorClass = s.id === "hook" ? "cursor-pointer" : "cursor-grab active:cursor-grabbing";
              const stableLabel = blockLabelMap[s.id] || s.label;
              return (
                <div key={s.id} className="relative h-8 rounded-md bg-black/15">
                  {/* Visual card content wrapped inside an overflow-hidden mask to guarantee it never extends past boundaries */}
                  <div
                    className="absolute inset-y-1 overflow-hidden rounded-md pointer-events-none"
                    style={{ left: `${s.leftPct}%`, width: `${s.widthPct}%` }}
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      onPointerDown={(e) => onBlockSlideStart(e, s)}
                      className={`w-full h-full pointer-events-auto overflow-hidden whitespace-nowrap px-1.5 text-left leading-none transition disabled:opacity-40 ${cursorClass} ${
                        isSelected ? "ring-2 ring-amber-300 ring-offset-1 ring-offset-app-chip-bg/40 font-bold" : ""
                      } ${
                        s.isCTA
                          ? "bg-amber-500/55 text-amber-50 hover:bg-amber-500/70"
                          : s.kind === "hook"
                            ? "bg-violet-500/45 text-violet-50 hover:bg-violet-500/60"
                            : "bg-fuchsia-500/45 text-fuchsia-50 hover:bg-fuchsia-500/60"
                      }`}
                      title={`${stableLabel} · ${s.startSec.toFixed(1)}s → ${s.endSec.toFixed(1)}s`}
                    >
                      <div className="pointer-events-none flex h-full items-center gap-1.5">
                        <span className="shrink-0 text-[8.5px] font-black uppercase tracking-wide">{stableLabel}</span>
                        <span className="min-w-0 truncate text-[9px] font-semibold opacity-90">{s.text}</span>
                        <span className="ml-auto shrink-0 text-[8.5px] font-bold tabular-nums opacity-80">
                          {s.startSec.toFixed(1)}→{s.endSec.toFixed(1)}s
                        </span>
                      </div>
                    </button>
                  </div>
                  {canDragStart && onResizeLayerTimingDraft && onResizeLayerTimingCommit && s.widthPct >= 14 ? (
                    <TimelineCircleHandle
                      leftPct={s.leftPct}
                      disabled={disabled}
                      ariaLabel={`Set start for ${stableLabel}`}
                      title="Drag to change when this text appears"
                      onPointerDown={(e) => onLayerEdgeResizeStart(e, s, "start")}
                    />
                  ) : null}
                  {onResizeLayerTimingDraft && onResizeLayerTimingCommit && s.widthPct >= 14 ? (
                    <TimelineCircleHandle
                      leftPct={s.leftPct + s.widthPct}
                      disabled={disabled}
                      ariaLabel={`Set end for ${stableLabel}`}
                      title="Drag to change when this text disappears"
                      onPointerDown={(e) => onLayerEdgeResizeStart(e, s, "end")}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          {showPlayhead ? (
            <>
            {/* Elegant vertical playhead line spanning from top ruler to bottom track */}
            <span
              aria-hidden
              className="pointer-events-none absolute top-1 bottom-1 z-30 w-[1.5px] -translate-x-1/2 bg-app-accent/90 shadow-[0_0_4px_var(--shadow-accent)]"
              style={{ left: `${playheadPct}%` }}
            />
            {playheadDraggable ? (
              <button
                type="button"
                aria-label="Scrub playhead — drag to move through the reel"
                title="Drag to scrub the preview"
                onPointerDown={onPlayheadScrubStart}
                className="absolute top-0 bottom-0 z-40 w-4 -translate-x-1/2 cursor-ew-resize flex flex-col items-center bg-transparent p-0 outline-none"
                style={{ left: `${playheadPct}%` }}
              >
                  {/* Standard amber diamond pin sitting beautifully in the ruler band */}
                  <span className="block h-2.5 w-2.5 rotate-45 border border-amber-300 bg-amber-400 shadow-[0_0_2px_rgba(0,0,0,0.5)]" style={{ marginTop: "-2px" }} />
                  {/* An invisible wider drag area extending down the entire track height */}
                  <span className="w-1.5 h-full opacity-0 bg-white" />
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { buildLayerRows };
