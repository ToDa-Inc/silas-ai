import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { computeCoverTextBlockPreview } from "@/lib/cover-text-layout";
import type { ClientImageRow } from "@/lib/api-client";
import {
  LAYOUT_VERTICAL_OFFSET_MAX,
  LAYOUT_VERTICAL_OFFSET_MIN,
  type VideoSpec,
  type VideoSpecLayout,
} from "@/lib/video-spec";
import type { ContrastId } from "@/lib/appearance-style";

/** 9:16 stage. Width drives layout; height derived to keep aspect. */
const REEL_COVER_STAGE_W = 360;
const REEL_COVER_STAGE_H = Math.round((REEL_COVER_STAGE_W * 16) / 9);

function clampRange(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Drag-to-position headline canvas for the cover editor.
 *
 * Renders either the baked thumbnail (AI mode, after `Generate cover`) or a
 * live overlay (always for client-photo mode; for AI mode while the user is
 * still iterating on text / layout before the next bake). Lets the user drag
 * the headline or nudge it with arrow keys; emits the new `textPanX` /
 * `verticalOffset` via `onLayoutPatch`.
 *
 * Pure presentation: parent owns the cover edit state and decides when to
 * trigger a fresh render.
 */
export function CoverTextLayerEditor({
  layout,
  templateId,
  coverPin,
  previewText,
  coverTextColor,
  coverStroke,
  coverCardBg,
  coverFontFamily,
  coverContrast,
  textTreatment,
  mode,
  selectedImage,
  thumbnailUrl,
  thumbnailBusy,
  wash,
  cropY,
  zoom,
  disabled,
  onLayoutPatch,
}: {
  layout: VideoSpecLayout;
  templateId: VideoSpec["templateId"];
  coverPin: "top" | "center" | "bottom";
  previewText: string;
  coverTextColor: string;
  coverStroke: string;
  coverCardBg: string;
  coverFontFamily: string;
  coverContrast: ContrastId;
  textTreatment?: "bold-outline";
  mode: "ai" | "image";
  selectedImage: ClientImageRow | null;
  thumbnailUrl: string | null;
  thumbnailBusy: boolean;
  wash: boolean;
  cropY: number;
  zoom: number;
  disabled?: boolean;
  onLayoutPatch: (patch: Partial<VideoSpecLayout>) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    textPanX0: number;
    verticalOffset0: number;
  } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [stageW, setStageW] = useState(REEL_COVER_STAGE_W);
  const [block, setBlock] = useState<ReturnType<typeof computeCoverTextBlockPreview> | null>(null);
  const thumbUrlRef = useRef(thumbnailUrl);
  const [coverLivePreview, setCoverLivePreview] = useState(true);

  useEffect(() => {
    if (thumbnailUrl !== thumbUrlRef.current) {
      thumbUrlRef.current = thumbnailUrl;
      if (thumbnailUrl) setCoverLivePreview(false);
    }
  }, [thumbnailUrl]);

  useEffect(() => {
    setCoverLivePreview(true);
  }, [previewText, layout, templateId, wash, cropY, zoom, textTreatment]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setStageW(w);
    });
    ro.observe(el);
    const w0 = el.getBoundingClientRect().width;
    if (w0 > 0) setStageW(w0);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!dragActive) return;
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const stage = stageRef.current;
      if (!drag || !stage) return;
      const r = stage.getBoundingClientRect();
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      onLayoutPatch({
        textPanX: clampRange(drag.textPanX0 + dx / w, -1, 1),
        verticalOffset: clampRange(drag.verticalOffset0 + dy / h, LAYOUT_VERTICAL_OFFSET_MIN, LAYOUT_VERTICAL_OFFSET_MAX),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      setDragActive(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragActive, onLayoutPatch]);

  const startDrag = (e: React.PointerEvent) => {
    if (disabled || thumbnailBusy) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      textPanX0: layout.textPanX ?? 0,
      verticalOffset0: layout.verticalOffset,
    };
    setDragActive(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || thumbnailBusy) return;
    const step = e.shiftKey ? 0.04 : 0.015;
    const deltas: Partial<Record<string, { dpx: number; dpy: number }>> = {
      ArrowLeft: { dpx: -step, dpy: 0 },
      ArrowRight: { dpx: step, dpy: 0 },
      ArrowUp: { dpx: 0, dpy: -step },
      ArrowDown: { dpx: 0, dpy: step },
    };
    const d = deltas[e.key];
    if (!d) return;
    e.preventDefault();
    onLayoutPatch({
      textPanX: clampRange((layout.textPanX ?? 0) + d.dpx, -1, 1),
      verticalOffset: clampRange(layout.verticalOffset + d.dpy, LAYOUT_VERTICAL_OFFSET_MIN, LAYOUT_VERTICAL_OFFSET_MAX),
    });
  };

  const sw = stageW > 0 ? stageW : REEL_COVER_STAGE_W;
  const sh = REEL_COVER_STAGE_H;

  useLayoutEffect(() => {
    setBlock(
      computeCoverTextBlockPreview(previewText, sw, sh, {
        templateId,
        layout,
        textPosition: coverPin,
        fontFamily: coverFontFamily,
      }),
    );
  }, [previewText, sw, sh, templateId, layout, coverPin, coverFontFamily]);

  /** Image mode: live overlay on client photo. AI: show baked PNG until headline/layout changes. */
  const showLiveOverlay = mode === "image" || coverLivePreview || !thumbnailUrl;
  const strokePx =
    block && textTreatment === "bold-outline" ? Math.max(2, Math.round(block.fontSizePx / 18)) : 0;
  const dragChrome =
    dragActive ? "outline outline-2 outline-amber-400/80 outline-offset-1" : "outline-none";

  return (
    <div
      ref={stageRef}
      tabIndex={disabled || thumbnailBusy ? -1 : 0}
      onKeyDown={onKeyDown}
      aria-label="Cover text editor. Drag the headline to move it. Arrow keys nudge; Shift+Arrow for larger steps."
      className="relative shrink-0 overflow-hidden rounded-2xl bg-zinc-950 shadow-[0_18px_60px_rgba(0,0,0,0.35)] outline-none ring-1 ring-white/5 focus:ring-2 focus:ring-amber-500/45"
      style={{ width: REEL_COVER_STAGE_W, height: REEL_COVER_STAGE_H }}
    >
      {thumbnailBusy ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/45">
          <Loader2 className="h-6 w-6 animate-spin text-app-fg-subtle" />
          <p className="text-[10px] text-app-fg-muted">{mode === "ai" ? "~30–60s" : "few seconds"}</p>
        </div>
      ) : null}
      {mode === "image" && selectedImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={selectedImage.file_url}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover ${wash ? "grayscale opacity-70" : ""}`}
          style={{
            objectPosition: `50% ${Math.round(cropY * 100)}%`,
            transform: `scale(${zoom})`,
          }}
        />
      ) : thumbnailUrl && !showLiveOverlay ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt="Reel cover" className="absolute inset-0 block h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 h-full w-full bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.9),rgba(245,210,160,0.45),rgba(20,20,20,0.2))]" />
      )}
      {block && showLiveOverlay ? (
        <>
          {block.cardLike ? (
            <div
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: block.cardLeftPx + block.textPanXPx,
                top: block.cardTopPx,
                width: block.cardWidthPx,
                height: block.cardHeightPx,
                background: coverCardBg,
                borderRadius: block.borderRadiusPx,
              }}
            />
          ) : null}
          <div
            className={`absolute font-bold ${disabled || thumbnailBusy ? "cursor-default" : "cursor-grab active:cursor-grabbing"} ${dragChrome}`}
            style={{
              left: block.leftPx,
              top: block.topPx,
              width: block.widthPx,
              transform: `translateX(${block.textPanXPx}px)`,
              textAlign: layout.textAlign,
              fontSize: block.fontSizePx,
              fontFamily: coverFontFamily,
              color: coverTextColor,
            }}
            onPointerDown={startDrag}
            title="Drag to move. Arrow keys to nudge; Shift+Arrow for bigger nudges."
          >
            {block.lines.map((line, i) => (
              <div
                key={`${i}-${line}`}
                style={{
                  marginBottom: i < block.lines.length - 1 ? block.lineGapPx : 0,
                  lineHeight: `${Math.max(block.lineHeightsPx[i] ?? 0, Math.ceil(block.fontSizePx * 1.08))}px`,
                  WebkitTextStroke: strokePx > 0 ? `${strokePx}px ${coverStroke}` : undefined,
                  textShadow:
                    textTreatment !== "bold-outline" && coverContrast === "light"
                      ? "0 2px 8px rgba(0,0,0,0.9)"
                      : undefined,
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export { REEL_COVER_STAGE_W, REEL_COVER_STAGE_H };
