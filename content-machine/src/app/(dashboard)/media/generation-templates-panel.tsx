"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  clientImagesList,
  fetchClientRowClient,
  normalizeCarouselTemplates,
  normalizeCoverTemplates,
  normalizeGenerationLibrariesFromRow,
  putClientGenerationLibraries,
  type ClientImageRow,
} from "@/lib/api-client";
import type {
  ClientCarouselTemplate,
  ClientCarouselTemplateSlide,
  ClientCarouselTemplateSlideRole,
  ClientCoverTemplate,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast-provider";
import {
  CAROUSEL_TEMPLATE_ROLES,
  generateCarouselTemplateId,
  generateCarouselTemplateSlide,
  generateCoverTemplateFromImage,
} from "./template-helpers";

export type GenerationTemplatesPanelProps = {
  clientSlug: string;
  orgSlug: string;
  disabled?: boolean;
  onTemplatesSaved?: () => void;
};

function templatesSig(
  carousels: ClientCarouselTemplate[],
  covers: ClientCoverTemplate[],
): string {
  return JSON.stringify({
    c: normalizeCarouselTemplates(carousels),
    v: normalizeCoverTemplates(covers),
  });
}

/**
 * Carousel and cover styles: maps Media library images into generation defaults.
 * Persists under ``clients.generation_libraries``.
 */
export function GenerationTemplatesPanel({
  clientSlug,
  orgSlug,
  disabled = false,
  onTemplatesSaved,
}: GenerationTemplatesPanelProps) {
  const { show } = useToast();
  const router = useRouter();

  const [bootstrapDone, setBootstrapDone] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [carouselTemplates, setCarouselTemplates] = useState<ClientCarouselTemplate[]>([]);
  const [coverTemplates, setCoverTemplates] = useState<ClientCoverTemplate[]>([]);
  const [baselineSig, setBaselineSig] = useState("");
  const [clientImages, setClientImages] = useState<ClientImageRow[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);

  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templatePickerSelection, setTemplatePickerSelection] = useState<string[]>([]);
  const [templatePickerPreviewId, setTemplatePickerPreviewId] = useState<string | null>(null);

  const [expandedCoverTemplateId, setExpandedCoverTemplateId] = useState<string | null>(null);
  const [coverTemplatePickerOpen, setCoverTemplatePickerOpen] = useState(false);
  const [coverTemplatePickerSelection, setCoverTemplatePickerSelection] = useState<string | null>(null);
  const [coverTemplatePickerPreviewId, setCoverTemplatePickerPreviewId] = useState<string | null>(null);

  const templatePickerPreview = useMemo(() => {
    if (clientImages.length === 0) return null;
    return (
      clientImages.find((img) => img.id === templatePickerPreviewId) ??
      clientImages.find((img) => img.id === templatePickerSelection[0]) ??
      clientImages[0]
    );
  }, [clientImages, templatePickerPreviewId, templatePickerSelection]);

  const coverTemplatePickerPreview = useMemo(() => {
    if (clientImages.length === 0) return null;
    return (
      clientImages.find((img) => img.id === coverTemplatePickerPreviewId) ??
      clientImages.find((img) => img.id === coverTemplatePickerSelection) ??
      clientImages[0]
    );
  }, [clientImages, coverTemplatePickerPreviewId, coverTemplatePickerSelection]);

  const reload = useCallback(async () => {
    const cs = clientSlug.trim();
    const os = orgSlug.trim();
    if (!cs || !os) return;
    setLoadError(null);
    const [rowRes, imgRes] = await Promise.all([
      fetchClientRowClient(cs, os),
      clientImagesList(cs, os),
    ]);
    if (!rowRes.ok) {
      setLoadError(rowRes.error);
      setBootstrapDone(true);
      return;
    }
    if (imgRes.ok) setClientImages(imgRes.data);
    const libs = normalizeGenerationLibrariesFromRow(rowRes.data);
    const nextCarousels = libs.carouselTemplates;
    const nextCovers = libs.coverTemplates;
    setCarouselTemplates(nextCarousels);
    setCoverTemplates(nextCovers);
    setBaselineSig(templatesSig(nextCarousels, nextCovers));
    setBootstrapDone(true);
  }, [clientSlug, orgSlug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dirty = useMemo(() => {
    if (!bootstrapDone) return false;
    return templatesSig(carouselTemplates, coverTemplates) !== baselineSig;
  }, [baselineSig, bootstrapDone, carouselTemplates, coverTemplates]);

  function openTemplatePicker() {
    if (clientImages.length === 0) return;
    setTemplatePickerSelection([]);
    setTemplatePickerPreviewId(clientImages[0]?.id ?? null);
    setTemplatePickerOpen(true);
  }

  function closeTemplatePicker() {
    setTemplatePickerOpen(false);
    setTemplatePickerSelection([]);
    setTemplatePickerPreviewId(null);
  }

  function toggleTemplatePickerImage(image: ClientImageRow) {
    setTemplatePickerPreviewId(image.id);
    setTemplatePickerSelection((prev) =>
      prev.includes(image.id) ? prev.filter((id) => id !== image.id) : [...prev, image.id],
    );
  }

  function createTemplateFromSelection() {
    const selectedImages = templatePickerSelection
      .map((id) => clientImages.find((img) => img.id === id))
      .filter((img): img is ClientImageRow => Boolean(img));
    if (selectedImages.length === 0) return;
    const newTemplateId = generateCarouselTemplateId();
    setCarouselTemplates((prev) => [
      ...prev,
      {
        id: newTemplateId,
        name: `Carousel sequence ${prev.length + 1}`,
        description: "",
        slides: selectedImages.map((image, idx) => generateCarouselTemplateSlide(idx, image)),
      },
    ]);
    setExpandedTemplateId(newTemplateId);
    closeTemplatePicker();
  }

  function openCoverTemplatePicker() {
    if (clientImages.length === 0) return;
    setCoverTemplatePickerSelection(null);
    setCoverTemplatePickerPreviewId(clientImages[0]?.id ?? null);
    setCoverTemplatePickerOpen(true);
  }

  function closeCoverTemplatePicker() {
    setCoverTemplatePickerOpen(false);
    setCoverTemplatePickerSelection(null);
    setCoverTemplatePickerPreviewId(null);
  }

  function selectCoverTemplateImage(image: ClientImageRow) {
    setCoverTemplatePickerPreviewId(image.id);
    setCoverTemplatePickerSelection(image.id);
  }

  function createCoverTemplateFromSelection() {
    const selectedImage = clientImages.find((img) => img.id === coverTemplatePickerSelection);
    if (!selectedImage) return;
    const newTemplate = generateCoverTemplateFromImage(
      selectedImage,
      `Cover recipe ${coverTemplates.length + 1}`,
    );
    setCoverTemplates((prev) => [...prev, newTemplate]);
    setExpandedCoverTemplateId(newTemplate.id);
    closeCoverTemplatePicker();
  }

  async function handleSave() {
    const cs = clientSlug.trim();
    const os = orgSlug.trim();
    if (!cs || !os || disabled) return;
    setSaveBusy(true);
    try {
      const rowRes = await fetchClientRowClient(cs, os);
      if (!rowRes.ok) {
        show(rowRes.error, "error");
        return;
      }
      const prevLibs = rowRes.data.generation_libraries;
      const merged: Record<string, unknown> =
        prevLibs && typeof prevLibs === "object" ? { ...(prevLibs as Record<string, unknown>) } : {};
      const preserved = normalizeGenerationLibrariesFromRow(rowRes.data);
      if (!("cta_library" in merged) && preserved.ctaLibrary.length > 0) {
        merged.cta_library = preserved.ctaLibrary;
      }

      const cr = normalizeCarouselTemplates(carouselTemplates);
      const cv = normalizeCoverTemplates(coverTemplates);
      if (cr.length > 0) merged.carousel_templates = cr;
      else delete merged.carousel_templates;
      if (cv.length > 0) merged.cover_thumbnail_templates = cv;
      else delete merged.cover_thumbnail_templates;

      const putRes = await putClientGenerationLibraries(cs, os, merged);
      if (!putRes.ok) {
        show(putRes.error, "error");
        return;
      }
      const updatedLibs = normalizeGenerationLibrariesFromRow(putRes.data);
      const nextCarousels = updatedLibs.carouselTemplates;
      const nextCovers = updatedLibs.coverTemplates;
      setCarouselTemplates(nextCarousels);
      setCoverTemplates(nextCovers);
      setBaselineSig(templatesSig(nextCarousels, nextCovers));
      show("Visual styles saved.", "success");
      onTemplatesSaved?.();
      router.refresh();
    } finally {
      setSaveBusy(false);
    }
  }

  if (!bootstrapDone) {
    return (
      <div className="flex min-h-[24vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-app-fg-subtle" aria-hidden />
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-800 dark:text-red-300">
        {loadError}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 dark:bg-emerald-500/[0.08]">
        <p className="text-sm font-semibold text-app-fg">Start from real examples</p>
        <p className="mt-1 text-xs leading-relaxed text-app-fg-muted">
          Upload example images in Media, then use them here to define the structures this creator repeats.
          Strategy copy stays under{" "}
          <Link href="/context" className="font-semibold text-amber-700 hover:underline dark:text-amber-400">
            Context
          </Link>
          .
        </p>
      </div>

      {/* Carousel */}
      <section className="rounded-2xl border border-outline-variant/15 bg-surface-container/80 p-5 dark:border-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface">Carousel styles</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
              Define a reusable slide structure. Example: portrait cover → screenshot slide → quote slide → final action.
            </p>
          </div>
          <button
            type="button"
            disabled={disabled || clientImages.length === 0}
            onClick={openTemplatePicker}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50 dark:text-amber-200/95"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add carousel style
          </button>
        </div>

        {clientImages.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-outline-variant/30 px-4 py-4 text-xs leading-relaxed text-zinc-500">
            Upload example images in the{" "}
            <Link href="/media?tab=images" className="font-semibold text-amber-700 hover:underline dark:text-amber-400">
              Images
            </Link>{" "}
            tab first. Use screenshots, covers, quotes, or past carousel slides that show the style you want.
          </p>
        ) : null}

        {carouselTemplates.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-outline-variant/30 px-4 py-6 text-center text-xs leading-relaxed text-zinc-500">
            <p className="font-semibold text-on-surface">No carousel styles yet</p>
            <p className="mx-auto mt-1 max-w-md">
              Add one when the creator repeats a format, like “photo cover + message screenshots” or
              “big quote slides + final call to action”.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {carouselTemplates.map((template, templateIdx) => {
              const updateTemplate = (patch: Partial<ClientCarouselTemplate>) => {
                setCarouselTemplates((prev) =>
                  prev.map((t, idx) => (idx === templateIdx ? { ...t, ...patch } : t)),
                );
              };
              const updateSlide = (slideIdx: number, patch: Partial<ClientCarouselTemplateSlide>) => {
                updateTemplate({
                  slides: template.slides.map((slide, idx) =>
                    idx === slideIdx ? { ...slide, ...patch } : slide,
                  ),
                });
              };
              return (
                <li
                  key={template.id}
                  className="rounded-xl border border-outline-variant/15 bg-surface-container-low/80 p-2 dark:border-white/10"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTemplateId((prev) => (prev === template.id ? null : template.id))
                      }
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-left text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-500/35 dark:border-white/10"
                      aria-expanded={expandedTemplateId === template.id}
                    >
                      <span className="truncate">{template.name.trim() || "Untitled carousel style"}</span>
                      <span className="flex shrink-0 items-center gap-2 text-[11px] font-normal text-zinc-500">
                        {template.slides.length} slides
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-zinc-400 transition-transform",
                            expandedTemplateId === template.id ? "rotate-180" : "",
                          )}
                          aria-hidden
                        />
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setCarouselTemplates((prev) => prev.filter((_, idx) => idx !== templateIdx));
                        setExpandedTemplateId((prev) => (prev === template.id ? null : prev));
                      }}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                      aria-label="Remove sequence"
                      title="Remove sequence"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {expandedTemplateId === template.id ? (
                    <div className="mt-3 rounded-lg border border-outline-variant/10 bg-surface-container/50 p-3 dark:border-white/10">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                            Style name
                          </label>
                          <input
                            value={template.name}
                            onChange={(e) => updateTemplate({ name: e.target.value })}
                            disabled={disabled}
                            placeholder="Photo cover + screenshot thread"
                            className="mt-1 w-full rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-sm font-semibold text-on-surface placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                            When should this style be used? <span className="font-normal normal-case">(optional)</span>
                          </label>
                          <input
                            value={template.description ?? ""}
                            onChange={(e) => updateTemplate({ description: e.target.value })}
                            disabled={disabled}
                            placeholder="Use for opinion posts that should feel like a short thread."
                            className="mt-1 w-full rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-sm text-on-surface placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                          />
                        </div>
                      </div>

                      <div className="mt-4 space-y-3">
                        {template.slides.map((slide, slideIdx) => {
                          const selectedImage = clientImages.find((img) => img.id === slide.reference_image_id);
                          return (
                            <div
                              key={`${template.id}-${slide.idx}`}
                              className="rounded-xl border border-outline-variant/15 bg-surface-container/70 p-3 dark:border-white/10"
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <p className="text-xs font-semibold text-on-surface">Slide {slideIdx + 1}</p>
                                <button
                                  type="button"
                                  disabled={disabled || template.slides.length <= 1}
                                  onClick={() => {
                                    updateTemplate({
                                      slides: template.slides
                                        .filter((_, idx) => idx !== slideIdx)
                                        .map((s, idx) => ({ ...s, idx })),
                                    });
                                  }}
                                  className="text-[11px] font-semibold text-red-500 hover:underline disabled:opacity-40"
                                >
                                  Remove slide
                                </button>
                              </div>
                              <div className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
                                <div className="overflow-hidden rounded-lg border border-outline-variant/15 bg-black/10">
                                  {selectedImage?.file_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={selectedImage.file_url}
                                      alt={selectedImage.label ?? ""}
                                      className="aspect-[4/5] w-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex aspect-[4/5] items-center justify-center px-2 text-center text-[10px] text-zinc-500">
                                      Pick image
                                    </div>
                                  )}
                                </div>
                                <div className="grid gap-3">
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div>
                                      <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                        Example image
                                      </label>
                                      <select
                                        value={slide.reference_image_id ?? ""}
                                        onChange={(e) => {
                                          const image = clientImages.find((img) => img.id === e.target.value);
                                          updateSlide(slideIdx, {
                                            reference_image_id: image?.id ?? null,
                                            reference_image_url: image?.file_url ?? null,
                                            reference_label: image?.label ?? null,
                                          });
                                        }}
                                        disabled={disabled || clientImages.length === 0}
                                        className="mt-1 w-full rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                                      >
                                        <option value="">Select image</option>
                                        {clientImages.map((img) => (
                                          <option key={img.id} value={img.id}>
                                            {img.label ?? `Image ${img.id.slice(0, 6)}`}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                        What is this slide for?
                                      </label>
                                      <select
                                        value={slide.role}
                                        onChange={(e) =>
                                          updateSlide(slideIdx, {
                                            role: e.target.value as ClientCarouselTemplateSlideRole,
                                          })
                                        }
                                        disabled={disabled}
                                        className="mt-1 w-full rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                                      >
                                        {CAROUSEL_TEMPLATE_ROLES.map((role) => (
                                          <option key={role.id} value={role.id}>
                                            {role.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                      Notes for this slide <span className="font-normal normal-case">(optional)</span>
                                    </label>
                                    <textarea
                                      value={slide.instruction}
                                      onChange={(e) => updateSlide(slideIdx, { instruction: e.target.value })}
                                      disabled={disabled}
                                      rows={2}
                                      placeholder="Example: Make this a screenshot-style message with one strong sentence."
                                      className="mt-1 w-full resize-y rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-sm text-on-surface placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        disabled={disabled || template.slides.length >= 10}
                        onClick={() => {
                          updateTemplate({
                            slides: [
                              ...template.slides,
                              generateCarouselTemplateSlide(template.slides.length, clientImages[0]),
                            ],
                          });
                        }}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-outline-variant/20 px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container disabled:opacity-50 dark:border-white/10"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Add another slide
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Cover */}
      <section className="rounded-2xl border border-outline-variant/15 bg-surface-container/80 p-5 dark:border-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-on-surface">Cover styles</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
              Pick a reusable cover reference so new covers start with the right image direction.
            </p>
          </div>
          <button
            type="button"
            disabled={disabled || clientImages.length === 0}
            onClick={openCoverTemplatePicker}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50 dark:text-amber-200/95"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add cover style
          </button>
        </div>

        {clientImages.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-outline-variant/30 px-4 py-4 text-xs leading-relaxed text-zinc-500">
            Upload images under{" "}
            <Link href="/media?tab=images" className="font-semibold text-amber-700 hover:underline dark:text-amber-400">
              Images
            </Link>{" "}
            before defining cover styles.
          </p>
        ) : null}

        {coverTemplates.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-outline-variant/30 px-4 py-6 text-center text-xs leading-relaxed text-zinc-500">
            <p className="font-semibold text-on-surface">No cover styles yet</p>
            <p className="mx-auto mt-1 max-w-md">
              Add one for covers you use repeatedly, like a face-centered portrait, branded still,
              or screenshot background with headline space.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {coverTemplates.map((template, templateIdx) => {
              const selectedImage = clientImages.find((img) => img.id === template.reference_image_id);
              const updateTemplate = (patch: Partial<ClientCoverTemplate>) => {
                setCoverTemplates((prev) =>
                  prev.map((t, idx) => (idx === templateIdx ? { ...t, ...patch } : t)),
                );
              };
              return (
                <li
                  key={template.id}
                  className="rounded-xl border border-outline-variant/15 bg-surface-container-low/80 p-2 dark:border-white/10"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCoverTemplateId((prev) => (prev === template.id ? null : template.id))
                      }
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-left text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-500/35 dark:border-white/10"
                      aria-expanded={expandedCoverTemplateId === template.id}
                    >
                      <span className="truncate">{template.name.trim() || "Untitled cover style"}</span>
                      <span className="flex shrink-0 items-center gap-2 text-[11px] font-normal text-zinc-500">
                        {template.reference_label ?? selectedImage?.label ?? "1 image"}
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-zinc-400 transition-transform",
                            expandedCoverTemplateId === template.id ? "rotate-180" : "",
                          )}
                          aria-hidden
                        />
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setCoverTemplates((prev) => prev.filter((_, idx) => idx !== templateIdx));
                        setExpandedCoverTemplateId((prev) => (prev === template.id ? null : prev));
                      }}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                      aria-label="Remove cover style"
                      title="Remove cover style"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {expandedCoverTemplateId === template.id ? (
                    <div className="mt-3 rounded-lg border border-outline-variant/10 bg-surface-container/50 p-3 dark:border-white/10">
                      <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                        <div className="overflow-hidden rounded-lg border border-outline-variant/15 bg-black/10">
                          {selectedImage?.file_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={selectedImage.file_url}
                              alt={selectedImage.label ?? ""}
                              className="aspect-[9/16] w-full object-cover"
                            />
                          ) : (
                            <div className="flex aspect-[9/16] items-center justify-center px-2 text-center text-[10px] text-zinc-500">
                              Pick image
                            </div>
                          )}
                        </div>
                        <div className="grid gap-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                Style name
                              </label>
                              <input
                                value={template.name}
                                onChange={(e) => updateTemplate({ name: e.target.value })}
                                disabled={disabled}
                                placeholder="Bold portrait cover"
                                className="mt-1 w-full rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-sm font-semibold text-on-surface placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                Example image
                              </label>
                              <select
                                value={template.reference_image_id}
                                onChange={(e) => {
                                  const image = clientImages.find((img) => img.id === e.target.value);
                                  updateTemplate({
                                    reference_image_id: image?.id ?? template.reference_image_id,
                                    reference_image_url: image?.file_url ?? template.reference_image_url,
                                    reference_label: image?.label ?? null,
                                  });
                                }}
                                disabled={disabled || clientImages.length === 0}
                                className="mt-1 w-full rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                              >
                                {clientImages.map((img) => (
                                  <option key={img.id} value={img.id}>
                                    {img.label ?? `Image ${img.id.slice(0, 6)}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                              Notes for this style <span className="font-normal normal-case">(optional)</span>
                            </label>
                            <textarea
                              value={template.instruction}
                              onChange={(e) => updateTemplate({ instruction: e.target.value })}
                              disabled={disabled}
                              rows={2}
                              placeholder="Example: Keep the face centered and leave clean space for a large headline."
                              className="mt-1 w-full resize-y rounded-lg border border-outline-variant/15 bg-surface-container/80 px-3 py-2 text-sm text-on-surface placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/35 disabled:opacity-50 dark:border-white/10"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Modal: carousel image picker */}
      {templatePickerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Choose sequence images"
          onClick={closeTemplatePicker}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-zinc-50 shadow-2xl dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/15 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-on-surface">Choose example images in order</h3>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
                  The order becomes the carousel structure to reuse.
                </p>
              </div>
              <button
                type="button"
                onClick={closeTemplatePicker}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-200/70 dark:hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="min-h-0">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {clientImages.map((image) => {
                    const selectedIndex = templatePickerSelection.indexOf(image.id);
                    const selected = selectedIndex >= 0;
                    const previewing = templatePickerPreview?.id === image.id;
                    return (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => toggleTemplatePickerImage(image)}
                        onMouseEnter={() => setTemplatePickerPreviewId(image.id)}
                        className={cn(
                          "group relative overflow-hidden rounded-xl border bg-black/10 text-left transition",
                          selected
                            ? "border-amber-500/70 ring-2 ring-amber-500/30"
                            : "border-outline-variant/15 hover:border-amber-500/35",
                          previewing && "border-amber-500/60",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.file_url}
                          alt={image.label ?? ""}
                          className="aspect-[4/5] w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-8 text-[10px] font-medium text-white">
                          {image.label ?? `Image ${image.id.slice(0, 6)}`}
                        </span>
                        {selected ? (
                          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-zinc-950 shadow-lg">
                            {selectedIndex + 1}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className="rounded-xl border border-outline-variant/15 bg-surface-container/70 p-3 dark:border-white/10">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Preview</p>
                {templatePickerPreview ? (
                  <>
                    <div className="overflow-hidden rounded-lg border border-outline-variant/15 bg-black/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={templatePickerPreview.file_url}
                        alt={templatePickerPreview.label ?? ""}
                        className="aspect-[4/5] w-full object-cover"
                      />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-on-surface">
                      {templatePickerPreview.label ?? `Image ${templatePickerPreview.id.slice(0, 6)}`}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                      Selected: {templatePickerSelection.length}. Pick images in the order a carousel should follow.
                    </p>
                  </>
                ) : (
                  <p className="rounded-lg border border-dashed border-outline-variant/20 px-3 py-8 text-center text-xs text-zinc-500">
                    Hover or click an image.
                  </p>
                )}
              </aside>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/15 px-5 py-4">
              <p className="text-xs text-zinc-500">
                {templatePickerSelection.length > 0
                  ? `${templatePickerSelection.length} image${templatePickerSelection.length === 1 ? "" : "s"} selected`
                  : "Select at least one example image."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeTemplatePicker}
                  className="rounded-lg border border-outline-variant/20 px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={templatePickerSelection.length === 0}
                  onClick={createTemplateFromSelection}
                  className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950 disabled:opacity-50"
                >
                  Create carousel style
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal: cover picker */}
      {coverTemplatePickerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Choose cover image"
          onClick={closeCoverTemplatePicker}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-zinc-50 shadow-2xl dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/15 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-on-surface">Choose cover example</h3>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
                  This image becomes the starting reference for new covers.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCoverTemplatePicker}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-200/70 dark:hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="min-h-0">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {clientImages.map((image) => {
                    const selected = coverTemplatePickerSelection === image.id;
                    const previewing = coverTemplatePickerPreview?.id === image.id;
                    return (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => selectCoverTemplateImage(image)}
                        onMouseEnter={() => setCoverTemplatePickerPreviewId(image.id)}
                        className={cn(
                          "group relative overflow-hidden rounded-xl border bg-black/10 text-left transition",
                          selected
                            ? "border-amber-500/70 ring-2 ring-amber-500/30"
                            : "border-outline-variant/15 hover:border-amber-500/35",
                          previewing && "border-amber-500/60",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.file_url}
                          alt={image.label ?? ""}
                          className="aspect-[9/16] w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-8 text-[10px] font-medium text-white">
                          {image.label ?? `Image ${image.id.slice(0, 6)}`}
                        </span>
                        {selected ? (
                          <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-1 text-[10px] font-black uppercase text-zinc-950 shadow-lg">
                            Selected
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className="rounded-xl border border-outline-variant/15 bg-surface-container/70 p-3 dark:border-white/10">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Preview</p>
                {coverTemplatePickerPreview ? (
                  <>
                    <div className="overflow-hidden rounded-lg border border-outline-variant/15 bg-black/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={coverTemplatePickerPreview.file_url}
                        alt={coverTemplatePickerPreview.label ?? ""}
                        className="aspect-[9/16] w-full object-cover"
                      />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-on-surface">
                      {coverTemplatePickerPreview.label ?? `Image ${coverTemplatePickerPreview.id.slice(0, 6)}`}
                    </p>
                  </>
                ) : (
                  <p className="rounded-lg border border-dashed border-outline-variant/20 px-3 py-8 text-center text-xs text-zinc-500">
                    Hover or click an image.
                  </p>
                )}
              </aside>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/15 px-5 py-4">
              <p className="text-xs text-zinc-500">
                {coverTemplatePickerSelection ? "1 example selected" : "Pick one example image."}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeCoverTemplatePicker}
                  className="rounded-lg border border-outline-variant/20 px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!coverTemplatePickerSelection}
                  onClick={createCoverTemplateFromSelection}
                  className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950 disabled:opacity-50"
                >
                  Create cover style
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="-mx-1 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/15 px-1 py-4">
        <span className="text-sm text-app-fg-secondary" aria-live="polite">
          {saveBusy ? (
            <span className="text-zinc-500">Saving visual styles…</span>
          ) : dirty ? (
            <span className="font-medium text-amber-700 dark:text-amber-400">Unsaved visual style changes</span>
          ) : null}
        </span>
        <button
          type="button"
          disabled={disabled || saveBusy || !dirty}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50"
        >
          {saveBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          {saveBusy ? "Saving…" : "Save visual styles"}
        </button>
      </div>
    </div>
  );
}
