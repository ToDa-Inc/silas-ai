/**
 * CarouselTextLayerEditor — drag/resize stage for the carousel's text overlay.
 *
 * Pure-leaf component (props in / events out). All persistence is owned by the
 * host (`CarouselSection` today, `useCarouselEditor` after the full split).
 *
 * Coordinates and sizing match the server-side Pillow renderer
 * (`compose_carousel_final_png`) so the live preview is WYSIWYG with export.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { CarouselSlide, CarouselTextBox } from "@/lib/api-client";
import {
  CAROUSEL_EDIT_H,
  CAROUSEL_EDIT_W,
  CAROUSEL_FONT_RATIO,
  CAROUSEL_FONT_STACKS,
  CAROUSEL_TEXT_COLOR,
  carouselDisplayImageUrl,
  carouselFontId,
  clamp01,
  clampRange,
  mergeCarouselBackgroundStyle,
  mergeCarouselTextBox,
} from "./carousel-helpers";

type Props = {
  slide: CarouselSlide;
  totalSlides: number;
  busy: boolean;
  /** Bumps when this slide's background URL is reused (Supabase overwrite) or replaced. */
  bgCacheRev?: number;
  onTextBoxAdjust?: (textBox: CarouselTextBox) => void;
  onCommit?: () => void | Promise<void>;
};

export function CarouselTextLayerEditor({
  slide,
  totalSlides,
  busy,
  bgCacheRev,
  onTextBoxAdjust,
  onCommit,
}: Props) {
  const rawBgUrl = (slide.base_image_url || "").trim() || (slide.image_url || "").trim();
  const bgUrl = carouselDisplayImageUrl(rawBgUrl, bgCacheRev);
  const tb = mergeCarouselTextBox(slide, totalSlides);
  const bgStyle = mergeCarouselBackgroundStyle(slide);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; tb0: CarouselTextBox } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; tb0: CarouselTextBox; sx: -1 | 1; sy: -1 | 1 } | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    const onMove = (e: PointerEvent) => {
      const stage = stageRef.current;
      if (!stage) return;
      const r = stage.getBoundingClientRect();
      const drag = dragRef.current;
      if (drag) {
        onTextBoxAdjust?.({
          ...drag.tb0,
          x: clamp01(drag.tb0.x + (e.clientX - drag.startX) / Math.max(1, r.width)),
          y: clamp01(drag.tb0.y + (e.clientY - drag.startY) / Math.max(1, r.height)),
        });
        return;
      }
      const resize = resizeRef.current;
      if (resize) {
        onTextBoxAdjust?.({
          ...resize.tb0,
          width: clampRange(resize.tb0.width + resize.sx * ((e.clientX - resize.startX) / Math.max(1, r.width)) * 2, 0.25, 1),
          scale: clampRange(resize.tb0.scale + resize.sy * ((e.clientY - resize.startY) / Math.max(1, r.height)) * 1.6, 0.4, 2),
        });
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
      setActive(false);
      void onCommit?.();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [active, onCommit, onTextBoxAdjust]);

  const startDrag = (e: React.PointerEvent) => {
    if (busy || !slide.base_image_url) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, tb0: { ...tb } };
    setActive(true);
  };
  const startResize = (sx: -1 | 1, sy: -1 | 1) => (e: React.PointerEvent) => {
    if (busy || !slide.base_image_url) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, tb0: { ...tb }, sx, sy };
    setActive(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (busy || !slide.base_image_url) return;
    const step = e.shiftKey ? 0.025 : 0.0075;
    const deltas: Partial<Record<string, { dx: number; dy: number }>> = {
      ArrowLeft: { dx: -step, dy: 0 },
      ArrowRight: { dx: step, dy: 0 },
      ArrowUp: { dx: 0, dy: -step },
      ArrowDown: { dx: 0, dy: step },
    };
    const delta = deltas[e.key];
    if (!delta) return;
    e.preventDefault();
    onTextBoxAdjust?.({
      ...tb,
      x: clamp01(tb.x + delta.dx),
      y: clamp01(tb.y + delta.dy),
    });
  };

  return (
    <div
      ref={stageRef}
      tabIndex={slide.base_image_url && !busy ? 0 : -1}
      onKeyDown={onKeyDown}
      onBlur={() => void onCommit?.()}
      aria-label="Carousel text editor. Use arrow keys to nudge the selected text."
      className="relative overflow-hidden rounded-2xl bg-white shadow-[0_18px_60px_rgba(0,0,0,0.35)] outline-none focus:ring-2 focus:ring-amber-500/45"
      style={{ width: CAROUSEL_EDIT_W, height: CAROUSEL_EDIT_H }}
    >
      {busy ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/40">
          <Loader2 className="h-6 w-6 animate-spin text-white/90" aria-hidden />
          <p className="text-[10px] font-medium text-white/80">Updating background…</p>
        </div>
      ) : null}
      {bgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${slide.idx}-${bgUrl}`}
          src={bgUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-app-soft" />
      )}
      {bgStyle.overlay_opacity > 0 ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: bgStyle.overlay_color,
            opacity: bgStyle.overlay_opacity,
          }}
        />
      ) : null}
      {slide.base_image_url ? (
        <div
          className="absolute cursor-grab outline outline-2 outline-amber-400/90 outline-offset-2 active:cursor-grabbing"
          style={{
            left: `${tb.x * 100}%`,
            top: `${tb.y * 100}%`,
            width: `${tb.width * 100}%`,
            transform: "translate(-50%, -50%)",
            color: CAROUSEL_TEXT_COLOR,
            fontFamily: CAROUSEL_FONT_STACKS[carouselFontId(tb)],
            fontSize: `${Math.round(CAROUSEL_EDIT_W * CAROUSEL_FONT_RATIO * tb.scale)}px`,
            fontWeight: 700,
            lineHeight: 1.18,
            textAlign: tb.align,
            background: tb.card ? "rgba(255,255,255,0.88)" : "transparent",
            borderRadius: tb.card ? "0.45rem" : undefined,
            padding: tb.card ? "0.35em 0.45em" : undefined,
          }}
          onPointerDown={startDrag}
          title="Drag to move. Use arrow keys to nudge, Shift+Arrow for bigger nudges."
        >
          {slide.text || "Text"}
          {([
            ["left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize", -1, -1],
            ["right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize", 1, -1],
            ["left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize", -1, 1],
            ["right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize", 1, 1],
          ] as const).map(([klass, sx, sy]) => (
            <span
              key={klass}
              aria-hidden
              onPointerDown={startResize(sx, sy)}
              className={`absolute h-3.5 w-3.5 rounded-full border border-zinc-950/60 bg-amber-400 shadow ${klass}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
