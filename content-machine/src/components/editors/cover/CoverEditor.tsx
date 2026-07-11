"use client";

/**
 * CoverEditor — Reel cover canvas + Content / Style / Image control tabs.
 *
 * Renamed from the in-workspace `ReelCoverSection`. Same prop interface so the
 * host can swap them with no behavior change. Owns no state of its own; the
 * host workspace still drives `coverEdit` and persists via `cover_spec` PATCH.
 *
 * When the workspace becomes a thin format dispatcher (Phase B.6), this
 * component will be wrapped by `useCoverEditor` which composes the autosave
 * loop. For now it stays purely presentational.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  Download,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import {
  type AppearanceOp,
  mergeAppearanceOpsIntoDraft,
  opsForContrast,
  opsForFontMood,
  inferContrast,
  type VideoThemeId,
} from "@/lib/appearance-style";
import type { ClientImageRow, GenerationSession } from "@/lib/api-client";
import {
  DEFAULT_COVER_EDIT,
  type CoverEditState,
} from "@/lib/cover-edit";
import {
  LAYOUT_VERTICAL_OFFSET_MAX,
  LAYOUT_VERTICAL_OFFSET_MIN,
  type VideoSpecLayout,
} from "@/lib/video-spec";

import {
  EditorShell,
  HelpHint,
  InheritanceHint,
  SaveStatusPill,
  SegmentedTabs,
  resolvedContrastLabel,
  resolvedThemeFontLabel,
  resolvedThemeLookLabel,
  type CoverTab,
} from "@/components/editor-ui";
import { LayoutSlider } from "@/components/layout-slider";
import { StepHeader } from "@/components/editors/shared/StepHeader";
import { ClientImagesPicker } from "@/components/editors/shared/ClientImagesPicker";
import {
  COVER_PATRICK_FONT_FAMILY,
  FormatGlyph,
  LOOK_VISUAL,
  OutlineGlyph,
  STYLE_CHIP_OFF,
  STYLE_CHIP_ON,
  appearanceHasSavedOverrides,
  coverPreviewFontFamily,
  layoutFormatFromTemplateId,
} from "@/components/editors/shared/style-helpers";
import {
  CAROUSEL_FONT_LABELS,
  CAROUSEL_FONT_STACKS,
} from "@/components/editors/carousel/carousel-helpers";
import { CoverTextLayerEditor } from "@/components/editors/cover/CoverTextLayerEditor";

export type CoverMode = "ai" | "image";

type Props = {
  hooks: Array<{ text?: string }>;
  /** AI-written cover headlines (cover_text_options on the session). When present these
   *  drive the chips; otherwise we fall back to spoken-line hooks for legacy sessions. */
  coverOptions: string[];
  coverRegenBusy: boolean;
  onRegenerateCovers: () => void;
  images: ClientImageRow[];
  thumbnailUrl: string | null;
  thumbnailBusy: boolean;
  coverText: string;
  selectedImageId: string;
  selectedCoverTemplate?: GenerationSession["selected_cover_template"] | null;
  coverEdit: CoverEditState;
  /** In-flight count for the autosaved cover_spec PATCH (drives the SaveStatusPill). */
  coverSpecInFlight: number;
  mode: CoverMode;
  onModeChange: (m: CoverMode) => void;
  onCoverTextChange: (s: string) => void;
  onCoverEditChange: (next: CoverEditState) => void;
  onSelectImage: (id: string) => void;
  onGenerateAi: () => void;
  onComposeFromImage: () => void;
  step: number;
  embedded?: boolean;
};

export function CoverEditor({
  hooks,
  coverOptions,
  coverRegenBusy,
  onRegenerateCovers,
  images,
  thumbnailUrl,
  thumbnailBusy,
  coverText,
  selectedImageId,
  selectedCoverTemplate,
  coverEdit,
  coverSpecInFlight,
  mode,
  onModeChange,
  onCoverTextChange,
  onCoverEditChange,
  onSelectImage,
  onGenerateAi,
  onComposeFromImage,
  step,
  embedded = false,
}: Props) {
  const t = useTranslations("editors");
  const usingCoverOptions = coverOptions.length > 0;
  const chipItems: string[] = usingCoverOptions
    ? coverOptions
    : hooks.map((h) => h?.text ?? "").filter(Boolean);
  const selectedImage = images.find((img) => img.id === selectedImageId) ?? null;
  const previewText = coverText.trim() || t("coverHeadline");
  const coverFormat = layoutFormatFromTemplateId(coverEdit.templateId);
  const coverPin =
    coverEdit.templateId === "top-banner" ? "top" : coverEdit.layout.verticalAnchor ?? "center";
  const coverContrast = inferContrast(
    coverEdit.appearance,
    coverEdit.templateId,
    coverEdit.themeId as VideoThemeId,
  );
  const coverHasAppearanceOverrides = appearanceHasSavedOverrides(coverEdit.appearance);
  const coverFontFamily = coverPreviewFontFamily(coverEdit.themeId, coverEdit.appearance);
  const coverTextColor =
    coverEdit.appearance.overlayTextColor ?? (coverContrast === "light" ? "#ffffff" : "#0a0a0a");
  const coverStroke =
    coverEdit.textTreatment === "bold-outline"
      ? coverEdit.appearance.overlayStroke ?? "#000000"
      : "transparent";
  const coverCardBg =
    coverEdit.appearance.cardBg ??
    (coverContrast === "light"
      ? "rgba(20,20,20,0.72)"
      : coverFormat === "center"
        ? "transparent"
        : "rgba(255,255,255,0.88)");
  const setCoverLayout = <K extends keyof VideoSpecLayout>(key: K, value: VideoSpecLayout[K]) =>
    onCoverEditChange({ ...coverEdit, layout: { ...coverEdit.layout, [key]: value } });
  const setCoverAppearanceOps = (ops: AppearanceOp[]) =>
    onCoverEditChange({
      ...coverEdit,
      appearance: mergeAppearanceOpsIntoDraft(coverEdit.appearance, ops),
    });
  const [coverTab, setCoverTab] = useState<CoverTab>("content");
  const themeLookLabel = resolvedThemeLookLabel(coverEdit.themeId as VideoThemeId);
  const themeFontResolved = resolvedThemeFontLabel(coverEdit.themeId as VideoThemeId);

  return (
    <div className="glass rounded-2xl border border-app-divider/80 p-5 md:p-6">
      <StepHeader n={step} label="Reel cover" done={Boolean(thumbnailUrl)}>
        <span className="inline-flex items-center gap-2 text-[10px] text-app-fg-subtle">
          Instagram cover · 9:16
          <SaveStatusPill inFlight={coverSpecInFlight} />
        </span>
      </StepHeader>

      {selectedCoverTemplate ? (
        <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-app-fg-muted">
          <span className="font-semibold text-app-fg">Template:</span>{" "}
          {selectedCoverTemplate.name}
          {selectedCoverTemplate.instruction ? ` · ${selectedCoverTemplate.instruction}` : ""}
        </div>
      ) : null}

      <EditorShell
        previewMaxWidth={360}
        embedded={embedded}
        preview={
          <CoverTextLayerEditor
            layout={coverEdit.layout}
            templateId={coverEdit.templateId}
            coverPin={coverPin}
            previewText={previewText}
            coverTextColor={coverTextColor}
            coverStroke={coverStroke}
            coverCardBg={coverCardBg}
            coverFontFamily={coverFontFamily}
            coverContrast={coverContrast}
            textTreatment={coverEdit.textTreatment}
            mode={mode}
            selectedImage={selectedImage}
            thumbnailUrl={thumbnailUrl}
            thumbnailBusy={thumbnailBusy}
            wash={coverEdit.wash}
            cropY={coverEdit.cropY}
            zoom={coverEdit.zoom}
            onLayoutPatch={(patch: Partial<VideoSpecLayout>) =>
              onCoverEditChange({ ...coverEdit, layout: { ...coverEdit.layout, ...patch } })
            }
          />
        }
        controls={
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="sticky top-0 z-10 shrink-0 border-b border-app-divider/60 bg-app-chip-bg/95 p-3 backdrop-blur-sm">
              <SegmentedTabs<CoverTab>
                value={coverTab}
                onChange={setCoverTab}
                tabs={[
                  { id: "content", label: t("content") },
                  { id: "style", label: t("style") },
                  { id: "image", label: t("image") },
                ]}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
              {coverTab === "content" ? (
                <div className="space-y-3 rounded-xl border border-app-divider bg-app-chip-bg/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex rounded-lg border border-app-divider bg-app-chip-bg/40 p-0.5">
                      <button
                        type="button"
                        onClick={() => onModeChange("ai")}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                          mode === "ai" ? "bg-white/10 text-app-fg shadow-sm" : "text-app-fg-muted hover:text-app-fg"
                        }`}
                      >
                        <Sparkles className="h-3 w-3 shrink-0" /> AI
                      </button>
                      <button
                        type="button"
                        onClick={() => onModeChange("image")}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                          mode === "image" ? "bg-white/10 text-app-fg shadow-sm" : "text-app-fg-muted hover:text-app-fg"
                        }`}
                      >
                        <ImageIcon className="h-3 w-3 shrink-0" /> Photo
                      </button>
                    </div>
                    {usingCoverOptions ? (
                      <button
                        type="button"
                        onClick={onRegenerateCovers}
                        disabled={coverRegenBusy}
                        className="inline-flex items-center gap-1 rounded-md border border-app-divider px-2 py-1 text-[10px] font-semibold text-app-fg-muted transition hover:border-amber-500/40 hover:text-app-fg disabled:opacity-50"
                        title="New headline ideas"
                      >
                        {coverRegenBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Ideas
                      </button>
                    ) : null}
                  </div>

                  {mode === "image" ? (
                    <ClientImagesPicker
                      images={images}
                      selectedImageId={selectedImageId}
                      busy={thumbnailBusy}
                      onPick={onSelectImage}
                      compact
                      emptyHint="No client images yet — upload PNG/JPG in Media."
                    />
                  ) : null}

                  <label className="block space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-app-fg-muted">Headline</span>
                    <textarea
                      value={coverText}
                      onChange={(e) => onCoverTextChange(e.target.value)}
                      rows={3}
                      className="glass-inset w-full resize-y rounded-lg px-2.5 py-1.5 text-sm leading-snug text-app-fg placeholder:text-app-fg-subtle focus:outline-none focus:ring-2 focus:ring-amber-500/35"
                      placeholder={t("coverHeadline")}
                    />
                  </label>
                  <p className="text-[9px] text-app-fg-subtle">
                    Drag the text on the preview to nudge; sliders under Fine-tune.
                  </p>

                  {chipItems.length > 0 && (
                    <div>
                      <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-app-fg-muted">
                        {usingCoverOptions ? "Suggestions" : "Hooks"}
                      </p>
                      <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto [scrollbar-width:thin] pr-0.5">
                        {chipItems.map((txt, i) => {
                          const active = coverText === txt;
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => onCoverTextChange(active ? "" : txt)}
                              className={`max-w-full rounded-md border px-1.5 py-0.5 text-left text-[10px] leading-snug transition-colors ${
                                active
                                  ? "border-amber-500/45 bg-amber-500/10 text-app-fg"
                                  : "border-app-divider text-app-fg-muted hover:border-white/20 hover:text-app-fg"
                              }`}
                            >
                              {txt.length > 56 ? txt.slice(0, 56) + "…" : txt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 border-t border-app-divider/40 pt-3">
                    <button
                      type="button"
                      disabled={thumbnailBusy || (mode === "image" && !selectedImageId)}
                      onClick={mode === "ai" ? onGenerateAi : onComposeFromImage}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2 text-xs font-bold text-app-on-amber-title hover:bg-amber-500/25 disabled:opacity-50"
                      title={mode === "image" && !selectedImageId ? "Pick an image first" : undefined}
                    >
                      {thumbnailBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : mode === "ai" ? (
                        <Sparkles className="h-3.5 w-3.5" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5" />
                      )}
                      {thumbnailBusy
                        ? mode === "ai"
                          ? "Generating…"
                          : "Composing…"
                        : thumbnailUrl
                          ? "Regenerate cover"
                          : mode === "ai"
                            ? "Generate cover"
                            : "Compose cover"}
                    </button>
                    {thumbnailUrl && !thumbnailBusy ? (
                      <a
                        href={thumbnailUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-500 hover:underline dark:text-sky-400"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Open full size
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {coverTab === "style" ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-app-fg-muted">Format</p>
                      <div className="flex flex-wrap gap-1">
                        {(
                          [
                            { id: "center" as const, label: t("layoutCenter"), templateId: "centered-pop" as const, title: t("headlineMiddle") },
                            { id: "card" as const, label: t("layoutCard"), templateId: "bottom-card" as const, title: t("captionOnCard") },
                            { id: "stack" as const, label: t("layoutStack"), templateId: "stacked-cards" as const, title: t("stackedCards") },
                          ] as const
                        ).map((tRow) => {
                          const active = coverFormat === tRow.id;
                          return (
                            <button
                              key={tRow.id}
                              type="button"
                              aria-pressed={active}
                              title={tRow.title}
                              onClick={() => onCoverEditChange({ ...coverEdit, templateId: tRow.templateId })}
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                                active ? STYLE_CHIP_ON : STYLE_CHIP_OFF
                              }`}
                            >
                              <FormatGlyph format={tRow.id} />
                              {tRow.label}
                            </button>
                          );
                        })}
                      </div>
                      {(coverFormat === "card" || coverFormat === "stack") && (
                        <div className="flex flex-wrap items-center gap-1 pt-0.5">
                          <span className="text-[9px] font-bold uppercase text-app-fg-muted">Y</span>
                          {(
                            [
                              { id: "top" as const, label: t("positionTop") },
                              { id: "center" as const, label: t("positionMid") },
                              { id: "bottom" as const, label: t("positionBottom") },
                            ] as const
                          ).map((p) => {
                            const active = coverPin === p.id;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                aria-pressed={active}
                                title="Caption vertical anchor"
                                onClick={() =>
                                  onCoverEditChange({
                                    ...coverEdit,
                                    templateId:
                                      coverFormat === "card" && p.id === "top"
                                        ? "top-banner"
                                        : coverEdit.templateId === "top-banner"
                                          ? "bottom-card"
                                          : coverEdit.templateId,
                                    layout: { ...coverEdit.layout, verticalAnchor: p.id },
                                  })
                                }
                                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                                  active ? STYLE_CHIP_ON : STYLE_CHIP_OFF
                                }`}
                              >
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-app-fg-muted">Look</p>
                      <div className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:thin]">
                        {LOOK_VISUAL.map((t) => {
                          const active = coverEdit.themeId === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              aria-pressed={active}
                              title={t.title}
                              onClick={() => onCoverEditChange({ ...coverEdit, themeId: t.id })}
                              className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                                active ? STYLE_CHIP_ON : STYLE_CHIP_OFF
                              }`}
                            >
                              <span className="flex shrink-0 gap-0.5" aria-hidden>
                                {t.swatches.map((c) => (
                                  <span
                                    key={c}
                                    className="h-2.5 w-1 rounded-sm border border-white/10"
                                    style={{ background: c }}
                                  />
                                ))}
                              </span>
                              <span
                                className="font-bold leading-none text-app-fg-muted"
                                style={{ fontFamily: t.fontFamily }}
                              >
                                Aa
                              </span>
                              <span className="max-w-[5.5rem] truncate">{t.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 border-t border-app-divider/40 pt-3 sm:grid-cols-2">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-app-fg-muted">Font</p>
                        <button
                          type="button"
                          disabled={!coverHasAppearanceOverrides}
                          title="Clear font / color overrides"
                          onClick={() => onCoverEditChange({ ...coverEdit, appearance: {} })}
                          className="rounded p-0.5 text-app-fg-muted transition hover:text-app-fg disabled:opacity-25"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          aria-pressed={!coverEdit.appearance.fontId}
                          onClick={() => setCoverAppearanceOps(opsForFontMood("auto"))}
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                            !coverEdit.appearance.fontId ? STYLE_CHIP_ON : STYLE_CHIP_OFF
                          }`}
                        >
                          Theme
                        </button>
                        {(["playfair", "inter", "poppins"] as const).map((fid) => {
                          const active = coverEdit.appearance.fontId === fid;
                          return (
                            <button
                              key={fid}
                              type="button"
                              aria-pressed={active}
                              style={{ fontFamily: CAROUSEL_FONT_STACKS[fid] }}
                              onClick={() => setCoverAppearanceOps([{ key: "fontId", value: fid }])}
                              className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                                active ? STYLE_CHIP_ON : STYLE_CHIP_OFF
                              }`}
                            >
                              {CAROUSEL_FONT_LABELS[fid]}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          aria-pressed={coverEdit.appearance.fontId === "patrick"}
                          style={{
                            fontFamily: `"${COVER_PATRICK_FONT_FAMILY}", "Segoe Print", "Bradley Hand", cursive`,
                          }}
                          onClick={() => setCoverAppearanceOps([{ key: "fontId", value: "patrick" }])}
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition ${
                            coverEdit.appearance.fontId === "patrick" ? STYLE_CHIP_ON : STYLE_CHIP_OFF
                          }`}
                        >
                          Patrick
                        </button>
                      </div>
                      {!coverEdit.appearance.fontId ? (
                        <InheritanceHint>
                          Theme = {themeFontResolved} (from {themeLookLabel} look)
                        </InheritanceHint>
                      ) : coverEdit.appearance.fontId ? (
                        <InheritanceHint>
                          Override:{" "}
                          {CAROUSEL_FONT_LABELS[
                            coverEdit.appearance.fontId as keyof typeof CAROUSEL_FONT_LABELS
                          ] ?? coverEdit.appearance.fontId}
                        </InheritanceHint>
                      ) : null}
                    </div>
                    <div className="min-w-0 space-y-2">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-app-fg-muted">
                        Align & contrast
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="inline-flex rounded-md border border-app-divider p-0.5">
                          {(
                            [
                              { id: "left" as const, Icon: AlignLeft, label: t("alignLeft") },
                              { id: "center" as const, Icon: AlignCenter, label: t("alignCenter") },
                              { id: "right" as const, Icon: AlignRight, label: t("alignRight") },
                            ] as const
                          ).map(({ id, Icon, label }) => {
                            const active = coverEdit.layout.textAlign === id;
                            return (
                              <button
                                key={id}
                                type="button"
                                aria-pressed={active}
                                aria-label={label}
                                title={label}
                                onClick={() => setCoverLayout("textAlign", id)}
                                className={`rounded p-1 transition ${
                                  active ? "bg-amber-500/20 text-amber-200" : "text-app-fg-muted hover:text-app-fg"
                                }`}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </button>
                            );
                          })}
                        </div>
                        <div className="inline-flex flex-wrap gap-0.5">
                          {(
                            [
                              { id: "auto" as const, label: t("contrastAuto") },
                              { id: "light" as const, label: t("contrastOnDark") },
                              { id: "dark" as const, label: t("contrastOnLight") },
                            ] as const
                          ).map((row) => {
                            const active = coverContrast === row.id;
                            return (
                              <button
                                key={row.id}
                                type="button"
                                aria-pressed={active}
                                title={row.id === "auto" ? "Infer from look" : row.id === "light" ? "Light text" : "Dark text"}
                                onClick={() =>
                                  setCoverAppearanceOps(
                                    opsForContrast(row.id, {
                                      templateId: coverEdit.templateId,
                                      themeId: coverEdit.themeId as VideoThemeId,
                                    }),
                                  )
                                }
                                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition ${
                                  active ? STYLE_CHIP_ON : STYLE_CHIP_OFF
                                }`}
                              >
                                {row.id !== "auto" ? (
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/15"
                                    style={{
                                      background:
                                        row.id === "light"
                                          ? "linear-gradient(90deg,#0a0a0a 50%,#f8fafc 50%)"
                                          : "linear-gradient(90deg,#f8fafc 50%,#0a0a0a 50%)",
                                    }}
                                    aria-hidden
                                  />
                                ) : null}
                                {row.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="inline-flex rounded-md border border-app-divider p-0.5">
                        <button
                          type="button"
                          aria-pressed={!coverEdit.textTreatment}
                          title="Standard lettering"
                          onClick={() => onCoverEditChange({ ...coverEdit, textTreatment: undefined })}
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                            !coverEdit.textTreatment ? "bg-amber-500/20 text-amber-200" : "text-app-fg-muted hover:text-app-fg"
                          }`}
                        >
                          Normal
                        </button>
                        <button
                          type="button"
                          aria-pressed={coverEdit.textTreatment === "bold-outline"}
                          title="Heavy outline"
                          onClick={() => onCoverEditChange({ ...coverEdit, textTreatment: "bold-outline" })}
                          className={`inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                            coverEdit.textTreatment === "bold-outline" ? "bg-amber-500/20 text-amber-200" : "text-app-fg-muted hover:text-app-fg"
                          }`}
                        >
                          <OutlineGlyph />
                          Outline
                        </button>
                      </div>
                      <InheritanceHint>
                        {resolvedContrastLabel(coverContrast, coverEdit.themeId as VideoThemeId)}
                      </InheritanceHint>
                    </div>
                  </div>

                  <details className="group rounded-lg border border-app-divider/60 bg-app-chip-bg/15 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-app-fg-muted hover:text-app-fg">
                      <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-app-fg-subtle" aria-hidden />
                      Adjust layout
                      <ChevronDown
                        className="ml-auto h-3.5 w-3.5 shrink-0 text-app-fg-subtle transition group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <div className="space-y-2 border-t border-app-divider/40 px-2 pb-2 pt-2">
                      <div className="flex items-center justify-between gap-2">
                        {JSON.stringify(coverEdit.layout) !== JSON.stringify(DEFAULT_COVER_EDIT.layout) ? (
                          <span className="rounded-sm bg-emerald-500/15 px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-emerald-300">
                            Adjusted
                          </span>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          disabled={JSON.stringify(coverEdit.layout) === JSON.stringify(DEFAULT_COVER_EDIT.layout)}
                          onClick={() => onCoverEditChange({ ...coverEdit, layout: DEFAULT_COVER_EDIT.layout })}
                          className="text-[9px] font-semibold uppercase tracking-wide text-app-fg-subtle hover:text-app-fg disabled:opacity-30"
                        >
                          Reset layout
                        </button>
                      </div>
                      <LayoutSlider
                        label="Vertical nudge"
                        title="Fraction of frame height"
                        leftHint="Up"
                        rightHint="Down"
                        min={LAYOUT_VERTICAL_OFFSET_MIN}
                        max={LAYOUT_VERTICAL_OFFSET_MAX}
                        step={0.005}
                        value={coverEdit.layout.verticalOffset}
                        formatValue={(v) =>
                          v === 0 ? "0" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`
                        }
                        onChange={(v) => setCoverLayout("verticalOffset", v)}
                        onCommit={(v) => setCoverLayout("verticalOffset", v)}
                        showSteppers
                        stepperStep={0.02}
                      />
                      <LayoutSlider
                        label="Horizontal pan"
                        title="Fraction of frame width"
                        leftHint="Left"
                        rightHint="Right"
                        min={-1}
                        max={1}
                        step={0.005}
                        value={coverEdit.layout.textPanX ?? 0}
                        formatValue={(v) =>
                          v === 0 ? "0" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`
                        }
                        onChange={(v) => setCoverLayout("textPanX", v)}
                        onCommit={(v) => setCoverLayout("textPanX", v)}
                        showSteppers
                        stepperStep={0.02}
                      />
                      <LayoutSlider
                        label="Text size"
                        leftHint="Smaller"
                        rightHint="Larger"
                        min={0.7}
                        max={1.3}
                        step={0.05}
                        value={coverEdit.layout.scale}
                        formatValue={(v) => `${v.toFixed(2)}x`}
                        onChange={(v) => setCoverLayout("scale", v)}
                        onCommit={(v) => setCoverLayout("scale", v)}
                      />
                      <LayoutSlider
                        label="Line width"
                        title="Side inset — higher value = narrower text block"
                        leftHint="Wide"
                        rightHint="Narrow"
                        min={0.02}
                        max={0.12}
                        step={0.005}
                        value={coverEdit.layout.sidePadding}
                        formatValue={(v) => `${Math.round((1 - 2 * v) * 100)}%`}
                        onChange={(v) => setCoverLayout("sidePadding", v)}
                        onCommit={(v) => setCoverLayout("sidePadding", v)}
                      />
                    </div>
                  </details>
                </div>
              ) : null}

              {coverTab === "image" ? (
                <div className="space-y-3">
                  <details
                    className="group rounded-lg border border-app-divider/60 bg-app-chip-bg/15 [&_summary::-webkit-details-marker]:hidden"
                    open
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-app-fg-muted hover:text-app-fg">
                      <ImageIcon className="h-3.5 w-3.5 shrink-0 text-app-fg-subtle" aria-hidden />
                      Background
                      <ChevronDown
                        className="ml-auto h-3.5 w-3.5 shrink-0 text-app-fg-subtle transition group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <div className="space-y-2 border-t border-app-divider/40 px-2 pb-2 pt-2">
                      <label className="flex cursor-pointer items-center gap-2 text-[10px] text-app-fg-muted">
                        <input
                          type="checkbox"
                          checked={coverEdit.wash}
                          onChange={() => onCoverEditChange({ ...coverEdit, wash: !coverEdit.wash })}
                          className="rounded border-app-divider"
                        />
                        Darken background
                        <HelpHint label="Darken background">
                          Mutes the photo so the headline stands out.
                        </HelpHint>
                      </label>
                      {mode === "image" ? (
                        <div className="grid gap-2">
                          <LayoutSlider
                            label="Photo focal (Y)"
                            title="Vertical focus in frame"
                            leftHint="Top"
                            rightHint="Bottom"
                            min={0}
                            max={1}
                            step={0.005}
                            value={coverEdit.cropY}
                            formatValue={(v) => `${Math.round(v * 100)}%`}
                            onChange={(v) => onCoverEditChange({ ...coverEdit, cropY: v })}
                            onCommit={(v) => onCoverEditChange({ ...coverEdit, cropY: v })}
                            showSteppers
                            stepperStep={0.05}
                          />
                          <LayoutSlider
                            label="Photo zoom"
                            title="Scale before crop"
                            leftHint="1×"
                            rightHint="3×"
                            min={1}
                            max={3}
                            step={0.02}
                            value={coverEdit.zoom}
                            formatValue={(v) => `${v.toFixed(2)}×`}
                            onChange={(v) => onCoverEditChange({ ...coverEdit, zoom: v })}
                            onCommit={(v) => onCoverEditChange({ ...coverEdit, zoom: v })}
                            showSteppers
                            stepperStep={0.1}
                          />
                        </div>
                      ) : null}
                    </div>
                  </details>
                </div>
              ) : null}
            </div>
          </div>
        }
      />
    </div>
  );
}
