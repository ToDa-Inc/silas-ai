/**
 * CarouselEditor — slide deck editor for the `carousel` format.
 *
 * Renamed from the in-workspace `CarouselSection`. Same prop interface so the
 * host can swap them with no behavior change. Owns its own UI state
 * (selected slide, tab, scope) but NOT persistence — the workspace still
 * drives the carousel autosave loop and passes commit callbacks in via props.
 *
 * The server-rendered ZIP (`carouselSlidesZipUrl`) is the canonical export —
 * same Pillow path as the live preview (`compose_carousel_final_png`).
 * The Fabric-based live canvas (`CarouselTextLayerEditor`) is the editing
 * surface; export goes through the server so there's no preview/export drift.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  AlignmentPad,
  CarouselEditableEmptyState,
  ControlGroupHeader,
  EditorShell,
  SaveStatusPill,
  ScopeLockedHint,
  ScopeToggle,
  SegmentedTabs,
  type CarouselTab,
  type ScopeMode,
} from "@/components/editor-ui";
import { LayoutSlider } from "@/components/layout-slider";
import { ClientImagesPicker } from "@/components/editors/shared/ClientImagesPicker";
import { StepHeader } from "@/components/editors/shared/StepHeader";
import {
  STYLE_CHIP_OFF,
  STYLE_CHIP_ON,
} from "@/components/editors/shared/style-helpers";
import {
  CAROUSEL_FONT_LABELS,
  CAROUSEL_FONT_STACKS,
  CAROUSEL_MIN_SLIDES,
  type CarouselFontId,
  carouselDisplayImageUrl,
  carouselFontId,
  clientImageIdForSlide,
  mergeCarouselBackgroundStyle,
  mergeCarouselTextBox,
} from "@/components/editors/carousel/carousel-helpers";
import { CarouselTextLayerEditor } from "@/components/editors/carousel/CarouselTextLayerEditor";
import {
  carouselSlidesZipUrl,
  clientApiHeaders,
  contentApiFetch,
  type CarouselBackgroundStyle,
  type CarouselSlide,
  type CarouselTextBox,
  type ClientImageRow,
} from "@/lib/api-client";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Props = {
  clientSlug: string;
  orgSlug: string;
  sessionId: string;
  slides: CarouselSlide[];
  images: ClientImageRow[];
  busy: boolean;
  /** In-flight count for slide PATCHes — drives the SaveStatusPill in the header. */
  inFlight: number;
  bgCacheRevByIdx: Record<number, number>;
  regeneratingIdx: number | null;
  generating: boolean;
  convertingEditable: boolean;
  count: number;
  /** When true, slide count comes from the saved carousel recipe (backend matches template). */
  countLocked?: boolean;
  countHint?: string;
  onCountChange: (n: number) => void;
  onGenerateAll: () => void | Promise<void>;
  onConvertToEditable: () => void | Promise<void>;
  onRegenerateOne: (
    idx: number,
    text: string,
    source: "ai" | "client_image",
    clientImageId?: string,
  ) => void | Promise<void>;
  onTextEdit: (idx: number, text: string) => void;
  onLayoutCommit: (idx: number) => void | Promise<void>;
  onTextBoxAdjust: (idx: number, text_box: CarouselTextBox) => void;
  onBackgroundStyleAdjust: (idx: number, background_style: CarouselBackgroundStyle) => void;
  onBroadcastTextBoxField: <K extends keyof CarouselTextBox>(
    field: K,
    value: CarouselTextBox[K],
  ) => void | Promise<void>;
  onBroadcastBackgroundField: <K extends keyof CarouselBackgroundStyle>(
    field: K,
    value: CarouselBackgroundStyle[K],
  ) => void | Promise<void>;
  onBroadcastTextBoxDraft: <K extends keyof CarouselTextBox>(field: K, value: CarouselTextBox[K]) => void;
  onBroadcastBackgroundDraft: <K extends keyof CarouselBackgroundStyle>(
    field: K,
    value: CarouselBackgroundStyle[K],
  ) => void;
  onApplyTextStyleToAll: (sourceIdx: number) => void | Promise<void>;
  onApplyBackgroundToAll: (sourceIdx: number) => void | Promise<void>;
  onRemoveSlide: (idx: number) => void | Promise<void>;
  onError: (message: string) => void;
  embedded?: boolean;
};

export function CarouselEditor({
  clientSlug,
  orgSlug,
  sessionId,
  slides,
  images,
  busy,
  bgCacheRevByIdx,
  regeneratingIdx,
  generating,
  convertingEditable,
  count,
  countLocked,
  countHint,
  onCountChange,
  onGenerateAll,
  onConvertToEditable,
  onRegenerateOne,
  onTextEdit,
  onLayoutCommit,
  onTextBoxAdjust,
  onBackgroundStyleAdjust,
  onBroadcastTextBoxField,
  onBroadcastBackgroundField,
  onBroadcastTextBoxDraft,
  onBroadcastBackgroundDraft,
  onApplyTextStyleToAll,
  onApplyBackgroundToAll,
  onRemoveSlide,
  onError,
  inFlight,
  embedded = false,
}: Props) {
  const [exportBusy, setExportBusy] = useState(false);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scope, setScope] = useState<ScopeMode>("slide");
  const [tab, setTab] = useState<CarouselTab>("text");
  const slideCountLabel = `${slides.length} slide${slides.length === 1 ? "" : "s"}`;
  const needsEditableConversion = slides.some((s) => !(s.base_image_url || "").trim());
  const selectedSlide = slides.find((s) => s.idx === selectedIdx) ?? slides[0] ?? null;
  const selectedTextBox = selectedSlide ? mergeCarouselTextBox(selectedSlide, slides.length) : null;
  const selectedBackgroundStyle = selectedSlide ? mergeCarouselBackgroundStyle(selectedSlide) : null;
  const selectedHasCleanBase = Boolean((selectedSlide?.base_image_url || "").trim());
  const selectedBgRev = selectedSlide ? bgCacheRevByIdx[selectedSlide.idx] ?? 0 : 0;
  const slideBusy = busy && regeneratingIdx === selectedSlide?.idx;
  const selectedClientImageId = selectedSlide ? clientImageIdForSlide(selectedSlide, images) : "";
  const canRemoveSlide = slides.length > CAROUSEL_MIN_SLIDES;

  useEffect(() => {
    if (slides.length === 0) return;
    if (!slides.some((s) => s.idx === selectedIdx)) {
      const sorted = [...slides].sort((a, b) => a.idx - b.idx);
      const pos = Math.min(Math.max(0, selectedIdx), sorted.length - 1);
      setSelectedIdx(sorted[pos]?.idx ?? 0);
    }
  }, [selectedIdx, slides]);

  useEffect(() => {
    setScope("slide");
  }, [selectedIdx]);

  const writeTextBox = useCallback(
    <K extends keyof CarouselTextBox>(key: K, value: CarouselTextBox[K], commit = true) => {
      if (!selectedSlide || !selectedTextBox) return;
      if (scope === "all") {
        onBroadcastTextBoxDraft(key, value);
        if (commit) void onBroadcastTextBoxField(key, value);
      } else {
        onTextBoxAdjust(selectedSlide.idx, { ...selectedTextBox, [key]: value });
        if (commit) void onLayoutCommit(selectedSlide.idx);
      }
    },
    [
      onBroadcastTextBoxDraft,
      onBroadcastTextBoxField,
      onLayoutCommit,
      onTextBoxAdjust,
      scope,
      selectedSlide,
      selectedTextBox,
    ],
  );

  const writeBackground = useCallback(
    <K extends keyof CarouselBackgroundStyle>(key: K, value: CarouselBackgroundStyle[K], commit = true) => {
      if (!selectedSlide || !selectedBackgroundStyle) return;
      if (scope === "all") {
        onBroadcastBackgroundDraft(key, value);
        if (commit) void onBroadcastBackgroundField(key, value);
      } else {
        onBackgroundStyleAdjust(selectedSlide.idx, { ...selectedBackgroundStyle, [key]: value });
        if (commit) void onLayoutCommit(selectedSlide.idx);
      }
    },
    [
      onBroadcastBackgroundDraft,
      onBroadcastBackgroundField,
      onBackgroundStyleAdjust,
      onLayoutCommit,
      scope,
      selectedSlide,
      selectedBackgroundStyle,
    ],
  );

  const onDownloadZip = useCallback(async () => {
    if (slides.length === 0 || needsEditableConversion) return;
    setExportBusy(true);
    try {
      const url = carouselSlidesZipUrl(clientSlug, sessionId);
      const headers = await clientApiHeaders({ orgSlug });
      const res = await contentApiFetch(url, { headers });
      if (!res.ok) {
        throw new Error(`Carousel ZIP failed (${res.status})`);
      }
      const blob = await res.blob();
      downloadBlob(blob, `carousel_${sessionId}.zip`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not export carousel.");
    } finally {
      setExportBusy(false);
    }
  }, [clientSlug, needsEditableConversion, onError, orgSlug, sessionId, slides.length]);

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl border border-app-divider/80 p-5 md:p-6">
        <StepHeader n={1} label="Carousel slides" done={slides.length > 0}>
          <SaveStatusPill inFlight={inFlight} />
        </StepHeader>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {slides.length > 0 ? (
            <>
              <div className="relative ml-auto">
                <button
                  type="button"
                  aria-expanded={toolbarMenuOpen}
                  aria-haspopup="true"
                  onClick={() => setToolbarMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-app-divider px-3 py-2 text-xs font-semibold text-app-fg-muted hover:text-app-fg"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  More
                </button>
                {toolbarMenuOpen ? (
                  <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-xl border border-app-divider bg-app-bg p-3 shadow-lg">
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wide text-app-fg-muted">
                          Slide count (3–10)
                        </label>
                        {countLocked ? (
                          <p className="mt-0.5 text-[10px] text-app-fg-subtle">
                            Fixed by your carousel template
                          </p>
                        ) : null}
                        <div className="mt-1.5 flex items-center gap-2">
                          <input
                            type="range"
                            min={3}
                            max={10}
                            step={1}
                            value={count}
                            onChange={(e) => onCountChange(Number(e.target.value))}
                            className="flex-1 accent-amber-500 disabled:opacity-50"
                            disabled={generating || busy || countLocked}
                          />
                          <span className="min-w-[2ch] text-sm font-bold text-app-fg">{count}</span>
                        </div>
                        {countHint ? (
                          <p className="mt-1 text-[10px] leading-relaxed text-app-fg-subtle">{countHint}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={generating || busy}
                        onClick={() => {
                          setToolbarMenuOpen(false);
                          void onGenerateAll();
                        }}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-bold text-app-on-amber-title hover:bg-amber-500/25 disabled:opacity-50"
                      >
                        {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {generating ? "Generating…" : slides.length > 0 ? "Regenerate all slides" : "Generate slides"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                disabled={busy || exportBusy || needsEditableConversion}
                onClick={() => void onDownloadZip()}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-zinc-950 shadow-md shadow-emerald-900/25 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                title={needsEditableConversion ? "Make slides editable before downloading" : "Download exactly what you see"}
              >
                {exportBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {exportBusy ? "Exporting..." : "Download all (.zip)"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={generating || busy}
              onClick={() => void onGenerateAll()}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2 text-xs font-bold text-app-on-amber-title hover:bg-amber-500/25 disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {generating ? "Generating…" : "Generate slides"}
            </button>
          )}
        </div>

        {slides.length === 0 ? (
          <p className="rounded-xl border border-dashed border-app-divider/60 py-8 text-center text-xs text-app-fg-subtle">
            No slides yet — pick a count and hit Generate slides. Slide&nbsp;1 becomes your Instagram cover automatically.
          </p>
        ) : selectedSlide && selectedTextBox && selectedBackgroundStyle ? (
          <>
            {needsEditableConversion ? (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-app-fg-muted">
                  This carousel is a flat PNG. Make it editable once, then the center canvas becomes the source of truth.
                </p>
                <button
                  type="button"
                  disabled={busy || convertingEditable}
                  onClick={() => void onConvertToEditable()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-zinc-950 hover:opacity-90 disabled:opacity-50"
                >
                  {convertingEditable ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {convertingEditable ? "Converting..." : "Enable text editing"}
                </button>
              </div>
            ) : (
              <p className="mb-3 text-[11px] text-app-fg-muted">
                {slideCountLabel} · Select a slide, drag the text on the big canvas, then download exactly that render.
              </p>
            )}
            <nav
              aria-label="Carousel slides"
              className="mb-1 flex items-end gap-2.5 overflow-x-auto pb-2 [scrollbar-width:thin]"
            >
              {slides.map((slide) => {
                const active = slide.idx === selectedSlide.idx;
                const thumbRaw = (slide.base_image_url || "").trim() || (slide.image_url || "").trim();
                const thumbUrl = carouselDisplayImageUrl(thumbRaw, bgCacheRevByIdx[slide.idx] ?? 0);
                const isRegenerating = busy && regeneratingIdx === slide.idx;
                return (
                  <div key={slide.idx} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedIdx(slide.idx)}
                      className={`block w-[3.75rem] rounded-xl border-2 p-1 text-left transition sm:w-[4.25rem] ${
                        active
                          ? "border-amber-500 bg-amber-500/12"
                          : "border-app-divider/80 bg-app-chip-bg/40 hover:border-amber-500/45"
                      }`}
                    >
                      <div className="relative overflow-hidden rounded-lg bg-black/15" style={{ aspectRatio: "9/16" }}>
                        {thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={`thumb-${slide.idx}-${thumbUrl}`}
                            src={thumbUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-[9/16] min-h-[52px] items-center justify-center text-[9px] text-app-fg-subtle">
                            —
                          </div>
                        )}
                        {isRegenerating ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-white/90" aria-hidden />
                          </div>
                        ) : null}
                        <span
                          className={`absolute bottom-0.5 left-0.5 rounded px-1 py-px text-[8px] font-bold leading-none ${
                            active ? "bg-amber-500 text-zinc-950" : "bg-black/55 text-white"
                          }`}
                        >
                          {slide.idx + 1}
                        </span>
                      </div>
                    </button>
                    {canRemoveSlide ? (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Remove slide ${slide.idx + 1}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void onRemoveSlide(slide.idx);
                        }}
                        className="absolute right-2 top-2 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black/65 text-white/90 shadow-sm hover:bg-red-600 disabled:opacity-40"
                      >
                        <Trash2 className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </nav>

            <EditorShell
              embedded={embedded}
              preview={
                <CarouselTextLayerEditor
                  key={`editor-${selectedSlide.idx}-${selectedBgRev}`}
                  slide={selectedSlide}
                  totalSlides={slides.length}
                  busy={slideBusy}
                  bgCacheRev={selectedBgRev}
                  onTextBoxAdjust={(next) => {
                    if (scope === "all") {
                      const keys: (keyof CarouselTextBox)[] = ["x", "y", "width", "scale", "align", "card", "font"];
                      for (const k of keys) {
                        if (next[k] !== undefined && next[k] !== selectedTextBox[k]) {
                          onBroadcastTextBoxDraft(k, next[k] as CarouselTextBox[typeof k]);
                        }
                      }
                    } else {
                      onTextBoxAdjust(selectedSlide.idx, next);
                    }
                  }}
                  onCommit={() => {
                    void onLayoutCommit(selectedSlide.idx);
                  }}
                />
              }
              controls={
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="sticky top-0 z-10 shrink-0 space-y-3 border-b border-app-divider/60 bg-app-chip-bg/95 p-4 backdrop-blur-sm">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-app-fg-muted">
                        Slide {selectedSlide.idx + 1}
                        {selectedSlide.idx === 0 ? (
                          <span className="ml-2 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                            Cover
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[10px] leading-relaxed text-app-fg-subtle">
                        Drag text on the canvas. Tabs group controls so the panel stays aligned with the preview.
                      </p>
                    </div>
                    <ScopeToggle
                      value={scope}
                      onChange={setScope}
                      slideLabel="This slide"
                      allLabel={`All ${slides.length} slides`}
                    />
                    <SegmentedTabs<CarouselTab>
                      value={tab}
                      onChange={setTab}
                      tabs={[
                        { id: "text", label: "Text" },
                        { id: "background", label: "Background" },
                        { id: "slide", label: "Slide" },
                      ]}
                    />
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:thin]">
                    {tab === "text" ? (
                      <div className="space-y-4">
                        <label className="block space-y-2">
                          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-app-fg-muted">
                            Slide text
                            {scope === "all" ? <ScopeLockedHint /> : null}
                          </span>
                          <div
                            className={`overflow-hidden rounded-xl border border-app-divider bg-app-bg/40 ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-amber-500/40 ${scope === "all" ? "opacity-50" : ""}`}
                          >
                            <textarea
                              key={`carousel-text-${selectedSlide.idx}`}
                              value={selectedSlide.text}
                              onChange={(e) => onTextEdit(selectedSlide.idx, e.target.value)}
                              rows={5}
                              disabled={slideBusy || scope === "all"}
                              placeholder="Write the headline for this slide…"
                              className="block min-h-[6rem] w-full resize-y border-0 bg-transparent px-3.5 py-3 text-sm leading-relaxed text-app-fg placeholder:text-app-fg-subtle focus:outline-none disabled:cursor-not-allowed"
                            />
                          </div>
                        </label>

                        {!selectedHasCleanBase ? (
                          <CarouselEditableEmptyState
                            busy={busy}
                            converting={convertingEditable}
                            onConvert={() => void onConvertToEditable()}
                          />
                        ) : (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <ControlGroupHeader
                                title="Position"
                                scope={scope}
                                slideIdx={selectedSlide.idx}
                                slideCount={slides.length}
                              />
                              <div className="flex items-start gap-3">
                                <AlignmentPad
                                  x={selectedTextBox.x}
                                  y={selectedTextBox.y}
                                  disabled={busy}
                                  onPick={(xy) => {
                                    if (scope === "all") {
                                      onBroadcastTextBoxDraft("x", xy.x);
                                      onBroadcastTextBoxDraft("y", xy.y);
                                      void onLayoutCommit(selectedSlide.idx);
                                    } else {
                                      onTextBoxAdjust(selectedSlide.idx, {
                                        ...selectedTextBox,
                                        x: xy.x,
                                        y: xy.y,
                                      });
                                      void onLayoutCommit(selectedSlide.idx);
                                    }
                                  }}
                                />
                                <p className="max-w-[10rem] text-[10px] leading-relaxed text-app-fg-subtle">
                                  Drag on the canvas for fine placement. Grid sets a starting anchor.
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <ControlGroupHeader
                                title="Font"
                                scope={scope}
                                slideIdx={selectedSlide.idx}
                                slideCount={slides.length}
                              />
                              <div className="flex flex-wrap gap-1.5">
                                {(Object.keys(CAROUSEL_FONT_STACKS) as CarouselFontId[]).map((font) => {
                                  const active = carouselFontId(selectedTextBox) === font;
                                  return (
                                    <button
                                      key={font}
                                      type="button"
                                      aria-pressed={active}
                                      disabled={busy}
                                      onClick={() => writeTextBox("font", font)}
                                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                                        active ? STYLE_CHIP_ON : STYLE_CHIP_OFF
                                      }`}
                                      style={{ fontFamily: CAROUSEL_FONT_STACKS[font] }}
                                    >
                                      {CAROUSEL_FONT_LABELS[font]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <ControlGroupHeader
                                title="Alignment"
                                scope={scope}
                                slideIdx={selectedSlide.idx}
                                slideCount={slides.length}
                              />
                              <div className="flex flex-wrap gap-1.5">
                                {(["left", "center", "right"] as const).map((align) => {
                                  const active = selectedTextBox.align === align;
                                  return (
                                    <button
                                      key={align}
                                      type="button"
                                      aria-pressed={active}
                                      disabled={busy}
                                      onClick={() => writeTextBox("align", align)}
                                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                                        active ? STYLE_CHIP_ON : STYLE_CHIP_OFF
                                      }`}
                                    >
                                      {align}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <ControlGroupHeader
                                title="Card behind text"
                                scope={scope}
                                slideIdx={selectedSlide.idx}
                                slideCount={slides.length}
                              />
                              <div className="flex flex-wrap gap-1.5">
                                {([false, true] as const).map((cardOn) => {
                                  const active = selectedTextBox.card === cardOn;
                                  return (
                                    <button
                                      key={String(cardOn)}
                                      type="button"
                                      aria-pressed={active}
                                      disabled={busy}
                                      onClick={() => writeTextBox("card", cardOn)}
                                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                                        active ? STYLE_CHIP_ON : STYLE_CHIP_OFF
                                      }`}
                                    >
                                      {cardOn ? "Card on" : "Card off"}
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="text-[10px] text-app-fg-subtle">
                                {selectedTextBox.card
                                  ? "White card behind text for readability."
                                  : "Text floats directly on the background."}
                              </p>
                            </div>

                            <div className="space-y-2">
                              <ControlGroupHeader
                                title="Text box width"
                                scope={scope}
                                slideIdx={selectedSlide.idx}
                                slideCount={slides.length}
                              />
                              <LayoutSlider
                                label="Width"
                                leftHint="Narrow"
                                rightHint="Wide"
                                min={0.25}
                                max={1}
                                step={0.01}
                                value={selectedTextBox.width}
                                disabled={busy}
                                formatValue={(v) => `${Math.round(v * 100)}% of slide`}
                                onChange={(v) => writeTextBox("width", v, false)}
                                onCommit={() => writeTextBox("width", selectedTextBox.width)}
                              />
                            </div>

                            <div className="space-y-2">
                              <ControlGroupHeader
                                title="Text size"
                                scope={scope}
                                slideIdx={selectedSlide.idx}
                                slideCount={slides.length}
                              />
                              <LayoutSlider
                                label="Size"
                                leftHint="Smaller"
                                rightHint="Larger"
                                min={0.4}
                                max={2}
                                step={0.05}
                                value={selectedTextBox.scale}
                                disabled={busy}
                                formatValue={(v) => `${Math.round(v * 100)}% — ${v.toFixed(2)}× theme default`}
                                onChange={(v) => writeTextBox("scale", v, false)}
                                onCommit={() => writeTextBox("scale", selectedTextBox.scale)}
                              />
                            </div>

                            <div className="flex flex-wrap gap-2 border-t border-app-divider/50 pt-3">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void onApplyTextStyleToAll(selectedSlide.idx)}
                                className="rounded-lg border border-app-divider px-3 py-1.5 text-xs font-semibold text-app-fg-muted hover:text-app-fg disabled:opacity-40"
                              >
                                Sync full text style from this slide → all
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {tab === "background" ? (
                      <div className="space-y-4">
                        {!selectedHasCleanBase ? (
                          <CarouselEditableEmptyState
                            busy={busy}
                            converting={convertingEditable}
                            onConvert={() => void onConvertToEditable()}
                          />
                        ) : (
                          <>
                            <div className="space-y-2">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-app-fg-muted">
                                  Background image
                                </p>
                                {scope === "all" ? <ScopeLockedHint /> : null}
                              </div>
                              <p className="text-[10px] leading-relaxed text-app-fg-subtle">
                                Each slide keeps its own photo. Switch to This slide to change it.
                              </p>
                              <div className={scope === "all" ? "pointer-events-none opacity-50" : ""}>
                                <ClientImagesPicker
                                  images={images}
                                  selectedImageId={selectedClientImageId}
                                  busy={busy}
                                  compact
                                  onPick={(id) => {
                                    void onRegenerateOne(
                                      selectedSlide.idx,
                                      selectedSlide.text || "",
                                      "client_image",
                                      id,
                                    );
                                  }}
                                  emptyHint="Upload images in Media → Images, then pick one here."
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void onRegenerateOne(selectedSlide.idx, selectedSlide.text || "", "ai")}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-app-divider px-3 py-2 text-xs font-bold text-app-fg-muted hover:text-app-fg disabled:opacity-40"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              Regenerate background with AI
                            </button>

                            <div className="space-y-2">
                              <ControlGroupHeader
                                title="Background darken"
                                scope={scope}
                                slideIdx={selectedSlide.idx}
                                slideCount={slides.length}
                              />
                              <LayoutSlider
                                label="Darken"
                                leftHint="Original"
                                rightHint="Darker"
                                min={0}
                                max={1}
                                step={0.025}
                                value={selectedBackgroundStyle.overlay_opacity}
                                disabled={busy}
                                formatValue={(v) => `${Math.round(v * 100)}% overlay`}
                                onChange={(v) => writeBackground("overlay_opacity", v, false)}
                                onCommit={() =>
                                  writeBackground("overlay_opacity", selectedBackgroundStyle.overlay_opacity)
                                }
                              />
                            </div>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void onApplyBackgroundToAll(selectedSlide.idx)}
                              className="rounded-lg border border-app-divider px-3 py-1.5 text-xs font-semibold text-app-fg-muted hover:text-app-fg disabled:opacity-40"
                            >
                              Apply darken setting to all slides
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}

                    {tab === "slide" ? (
                      <div className="space-y-4">
                        {needsEditableConversion ? (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3">
                            <p className="mb-2 text-[11px] leading-relaxed text-app-fg-muted">
                              Whole carousel is flat PNG. Convert once so every slide can be edited on the canvas.
                            </p>
                            <button
                              type="button"
                              disabled={busy || convertingEditable}
                              onClick={() => void onConvertToEditable()}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-zinc-950 hover:opacity-90 disabled:opacity-50"
                            >
                              {convertingEditable ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                              )}
                              {convertingEditable ? "Converting..." : "Enable text editing on all slides"}
                            </button>
                          </div>
                        ) : null}

                        <p className="text-xs text-app-fg-muted">
                          {slideCountLabel} · Slide {selectedSlide.idx + 1}
                          {selectedSlide.idx === 0 ? " is your Instagram cover." : "."}
                        </p>

                        {canRemoveSlide ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onRemoveSlide(selectedSlide.idx)}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-500/30 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/10 disabled:opacity-40 dark:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove slide {selectedSlide.idx + 1}
                          </button>
                        ) : (
                          <p className="text-[10px] text-app-fg-subtle">
                            Minimum {CAROUSEL_MIN_SLIDES} slides required.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              }
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
