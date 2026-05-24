"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Images, Loader2, Sparkles, UserRound, Video, X } from "lucide-react";
import { ReelThumbnail } from "@/components/reel-thumbnail";
import type { ClientCarouselTemplate, ClientCoverTemplate, ClientCta, ScrapedReelRow } from "@/lib/api";
import {
  CONTENT_DEFAULTS_UPDATED_EVENT,
  fetchClientGenerationLibraries,
  generationStart,
  readClientGenerationLibrariesSnapshot,
  type ClientGenerationLibraryBundle,
} from "@/lib/api-client";
import { generateSessionHref } from "@/lib/generate-session-url";

type Props = {
  open: boolean;
  onClose: () => void;
  reel: ScrapedReelRow | null;
  clientSlug: string;
  orgSlug: string;
  disabled?: boolean;
  disabledHint?: string | null;
};

/** Target production format — explicit choice only (server routes by format_key). */
type RecreateFormatChoice = "text_overlay" | "talking_head" | "carousel";

const RECREATE_FORMAT_OPTIONS: ReadonlyArray<{ key: RecreateFormatChoice; label: string; hint: string }> = [
  { key: "text_overlay", label: "Text overlay", hint: "Static visuals + on-screen text blocks" },
  { key: "talking_head", label: "Talking head", hint: "You speak to camera the whole reel" },
  { key: "carousel", label: "Carousel", hint: "Swipeable image slides (Instagram carousel)" },
];

const CTA_TYPE_LABEL: Record<string, string> = {
  website: "Website",
  newsletter: "Newsletter",
  video: "Video",
  lead_magnet: "Free resource",
  booking: "Booking",
  other: "Other",
};

function sourceMediaLabel(reel: ScrapedReelRow): {
  icon: typeof Video;
  label: string;
  detail: string;
} {
  const rawFormat = (reel.format ?? "").trim();
  const format = rawFormat.toLowerCase();
  const duration = typeof reel.video_duration === "number" && reel.video_duration > 0
    ? Math.round(reel.video_duration)
    : null;

  if (format === "carousel") {
    return {
      icon: Images,
      label: "Carousel source",
      detail: rawFormat || "Instagram carousel",
    };
  }
  if (duration != null && duration < 15) {
    return {
      icon: FileText,
      label: "Short video source",
      detail: `${duration}s · under 15s`,
    };
  }
  if (duration != null) {
    return {
      icon: UserRound,
      label: "Long video source",
      detail: `${duration}s · 15s+`,
    };
  }
  if (rawFormat) {
    return {
      icon: Video,
      label: "Source format",
      detail: rawFormat.replace(/_/g, " "),
    };
  }
  return {
    icon: Video,
    label: "Source media",
    detail: "Duration/type unavailable",
  };
}

function CarouselTemplatePicker({
  templates,
  selectedId,
  onSelect,
  disabled,
}: {
  templates: ClientCarouselTemplate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-app-fg">
          Carousel style <span className="font-normal text-app-fg-muted">(required)</span>
        </p>
        <Link
          href="/settings#content-defaults"
          className="text-[10px] font-semibold text-amber-700 hover:underline dark:text-amber-400"
        >
          Edit styles →
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Carousel style">
        {templates.map((template) => {
          const active = selectedId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onSelect(template.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                active
                  ? "border-amber-500/55 bg-amber-500/10 text-app-fg"
                  : "border-zinc-200/90 bg-white text-zinc-700 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900/60 dark:text-app-fg-muted dark:hover:border-white/20"
              }`}
            >
              {template.name}
              <span className="ml-1 font-normal text-app-fg-subtle">
                · {template.slides.length} slides
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CoverTemplatePicker({
  templates,
  selectedId,
  onSelect,
  disabled,
}: {
  templates: ClientCoverTemplate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-app-fg">
          Cover style <span className="font-normal text-app-fg-muted">(required)</span>
        </p>
        <Link
          href="/settings#content-defaults"
          className="text-[10px] font-semibold text-amber-700 hover:underline dark:text-amber-400"
        >
          Edit styles →
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cover style">
        {templates.map((template) => {
          const active = selectedId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onSelect(template.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                active
                  ? "border-amber-500/55 bg-amber-500/10 text-app-fg"
                  : "border-zinc-200/90 bg-white text-zinc-700 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900/60 dark:text-app-fg-muted dark:hover:border-white/20"
              }`}
            >
              {template.name}
              <span className="ml-1 font-normal text-app-fg-subtle">
                · {template.reference_label ?? "1 image"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NextStepPicker({
  library,
  selectedId,
  onSelect,
  disabled,
}: {
  library: ClientCta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-app-fg">
          Next step <span className="font-normal text-app-fg-muted">(required)</span>
        </p>
        <Link
          href="/settings#content-defaults"
          className="text-[10px] font-semibold text-amber-700 hover:underline dark:text-amber-400"
        >
          Edit next steps →
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Next step">
        {library.map((cta) => {
          const active = selectedId === cta.id;
          const typeLabel = CTA_TYPE_LABEL[cta.type] ?? cta.type;
          return (
            <button
              key={cta.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={cta.traffic_goal ? `${typeLabel} · ${cta.traffic_goal}` : typeLabel}
              disabled={disabled}
              onClick={() => onSelect(cta.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                active
                  ? "border-amber-500/55 bg-amber-500/10 text-app-fg"
                  : "border-zinc-200/90 bg-white text-zinc-700 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900/60 dark:text-app-fg-muted dark:hover:border-white/20"
              }`}
            >
              {cta.label}
              <span className="ml-1 font-normal text-app-fg-subtle">· {typeLabel}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-app-fg-subtle">
        Caption, script, and on-screen text will adapt to this destination.
      </p>
    </div>
  );
}

function isLikelyInstagramReelUrl(s: string): boolean {
  const t = s.trim().toLowerCase();
  return (
    t.includes("instagram.com/reel") ||
    t.includes("instagram.com/reels/") ||
    t.includes("instagram.com/p/") ||
    t.includes("instagram.com/tv/")
  );
}

const PHASE_TICK_MS = 6000;

export function RecreateReelModal({
  open,
  onClose,
  reel,
  clientSlug,
  orgSlug,
  disabled,
  disabledHint,
}: Props) {
  const [extraInstruction, setExtraInstruction] = useState("");
  const [formatChoice, setFormatChoice] = useState<RecreateFormatChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [carouselTemplates, setCarouselTemplates] = useState<ClientCarouselTemplate[]>([]);
  const [selectedCarouselTemplateId, setSelectedCarouselTemplateId] = useState<string | null>(null);
  const [coverTemplates, setCoverTemplates] = useState<ClientCoverTemplate[]>([]);
  const [selectedCoverTemplateId, setSelectedCoverTemplateId] = useState<string | null>(null);
  const [ctaLibrary, setCtaLibrary] = useState<ClientCta[]>([]);
  const [selectedCtaId, setSelectedCtaId] = useState<string | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAnalysis = Boolean(reel?.analysis);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, busy, onClose]);

  useEffect(() => {
    if (!open) {
      setExtraInstruction("");
      setFormatChoice(null);
      setMsg(null);
      setPhase(null);
      setSessionId(null);
      setCarouselTemplates([]);
      setSelectedCarouselTemplateId(null);
      setCoverTemplates([]);
      setSelectedCoverTemplateId(null);
      setCtaLibrary([]);
      setSelectedCtaId(null);
      setTemplatesLoading(false);
      setBusy(false);
      if (phaseTimerRef.current) {
        clearInterval(phaseTimerRef.current);
        phaseTimerRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open || !clientSlug.trim() || !orgSlug.trim()) return;
    let cancelled = false;
    setTemplatesLoading(true);
    void fetchClientGenerationLibraries(clientSlug, orgSlug).then((res) => {
      if (cancelled) return;
      setTemplatesLoading(false);
      if (!res.ok) return;
      setCarouselTemplates(res.data.carouselTemplates);
      if (res.data.carouselTemplates.length === 1) {
        setSelectedCarouselTemplateId(res.data.carouselTemplates[0].id);
      }
      setCoverTemplates(res.data.coverTemplates);
      if (res.data.coverTemplates.length === 1) {
        setSelectedCoverTemplateId(res.data.coverTemplates[0].id);
      }
      setCtaLibrary(res.data.ctaLibrary);
      if (res.data.ctaLibrary.length === 1) {
        setSelectedCtaId(res.data.ctaLibrary[0].id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, clientSlug, orgSlug]);

  useEffect(() => {
    if (!open) return;

    const applyLibraries = (bundle: ClientGenerationLibraryBundle) => {
      setCarouselTemplates(bundle.carouselTemplates);
      setSelectedCarouselTemplateId((current) => {
        if (current && bundle.carouselTemplates.some((template) => template.id === current)) return current;
        return bundle.carouselTemplates.length === 1 ? bundle.carouselTemplates[0].id : null;
      });
      setCoverTemplates(bundle.coverTemplates);
      setSelectedCoverTemplateId((current) => {
        if (current && bundle.coverTemplates.some((template) => template.id === current)) return current;
        return bundle.coverTemplates.length === 1 ? bundle.coverTemplates[0].id : null;
      });
      setCtaLibrary(bundle.ctaLibrary);
      setSelectedCtaId((current) => {
        if (current && bundle.ctaLibrary.some((cta) => cta.id === current)) return current;
        return bundle.ctaLibrary.length === 1 ? bundle.ctaLibrary[0].id : null;
      });
    };

    const refresh = (event?: Event) => {
      if (event instanceof CustomEvent && event.detail) {
        applyLibraries(event.detail as ClientGenerationLibraryBundle);
        return;
      }
      const snapshot = readClientGenerationLibrariesSnapshot();
      if (snapshot) applyLibraries(snapshot);
    };

    window.addEventListener(CONTENT_DEFAULTS_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(CONTENT_DEFAULTS_UPDATED_EVENT, refresh);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function clearPhaseTimer() {
    if (phaseTimerRef.current) {
      clearInterval(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
  }

  function startPhaseRotation() {
    clearPhaseTimer();
    const phases = hasAnalysis
      ? [
          "Using your existing analysis…",
          "Extracting adaptation patterns for your client…",
          "Generating angle options…",
        ]
      : [
          "Fetching the reel…",
          "Studying what made it work…",
          "Pulling out patterns you can reuse…",
          "Preparing angle options…",
        ];
    let i = 0;
    setPhase(phases[0] ?? "Working…");
    phaseTimerRef.current = setInterval(() => {
      i = (i + 1) % phases.length;
      setPhase(phases[i] ?? "Still working…");
    }, PHASE_TICK_MS);
  }

  async function submit() {
    const url = reel?.post_url?.trim() ?? "";
    if (disabled || !clientSlug.trim() || !orgSlug.trim()) {
      setMsg(
        disabledHint?.trim() ||
          (!orgSlug.trim()
            ? "No organization context — refresh the page or sign in again."
            : "Pick a creator in the header first."),
      );
      return;
    }
    if (!url || !isLikelyInstagramReelUrl(url)) {
      setMsg("This reel has no valid Instagram link.");
      return;
    }
    if (!formatChoice) {
      setMsg("Pick a target format to recreate the reel as.");
      return;
    }
    if (formatChoice === "carousel" && carouselTemplates.length > 0 && !selectedCarouselTemplateId) {
      setMsg("Pick a carousel style first.");
      return;
    }
    if (formatChoice !== "carousel" && coverTemplates.length > 0 && !selectedCoverTemplateId) {
      setMsg("Pick a cover style first.");
      return;
    }
    if (ctaLibrary.length > 0 && !selectedCtaId) {
      setMsg("Pick a next step first.");
      return;
    }
    const selectedCarouselTemplate =
      formatChoice === "carousel" && selectedCarouselTemplateId
        ? carouselTemplates.find((template) => template.id === selectedCarouselTemplateId) ?? null
        : null;
    const selectedCoverTemplate =
      formatChoice !== "carousel" && selectedCoverTemplateId
        ? coverTemplates.find((template) => template.id === selectedCoverTemplateId) ?? null
        : null;
    const selectedCta =
      selectedCtaId ? ctaLibrary.find((cta) => cta.id === selectedCtaId) ?? null : null;

    setBusy(true);
    setMsg(null);
    setSessionId(null);
    startPhaseRotation();

    try {
      const res = await generationStart(clientSlug, orgSlug, {
        source_type: "url_adapt",
        url,
        extra_instruction: extraInstruction.trim() || undefined,
        format_key: formatChoice,
        selected_carousel_template: selectedCarouselTemplate ?? undefined,
        selected_cover_template: selectedCoverTemplate ?? undefined,
        selected_cta: selectedCta ?? undefined,
      });
      clearPhaseTimer();
      setPhase(null);
      if (!res.ok) {
        setMsg(res.error);
        return;
      }
      setSessionId(res.data.id);
    } catch (e) {
      clearPhaseTimer();
      setPhase(null);
      setMsg(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open || !reel) {
    return null;
  }

  const postUrl = reel.post_url?.trim() ?? "";
  const excerpt =
    (reel.hook_text || reel.caption || "").trim().slice(0, 160) ||
    "No caption stored — structure still comes from video when analyzed.";
  const mediaLabel = sourceMediaLabel(reel);
  const MediaIcon = mediaLabel.icon;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm dark:bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recreate-reel-title"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200/90 bg-zinc-50 p-5 shadow-2xl dark:border-white/12 dark:bg-zinc-950/95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 id="recreate-reel-title" className="text-sm font-semibold text-app-fg">
              Adapt this reel for your client
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-app-fg-subtle">
              Same idea as the original reel, rebuilt for your client. Choose the type of post you want, then pick an
              angle in Generate. Carousels get their slides after you choose an angle.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200/80 disabled:opacity-40 dark:text-app-fg-subtle dark:hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-3 rounded-xl border border-zinc-200/80 bg-white/70 p-3 dark:border-white/10 dark:bg-zinc-900/50">
          <div className="shrink-0">
            <ReelThumbnail src={reel.thumbnail_url} alt="" size="md" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-app-fg">@{reel.account_username}</p>
            <p className="mt-0.5 text-[10px] tabular-nums text-app-fg-muted">
              {reel.views != null ? `${reel.views.toLocaleString()} views` : "—"}{" "}
              {reel.comments != null ? `· ${reel.comments.toLocaleString()} comments` : ""}
            </p>
            <div className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-zinc-200/80 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-app-fg-muted dark:border-white/10 dark:bg-zinc-950/70">
              <MediaIcon className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate text-app-fg">{mediaLabel.label}</span>
              <span className="shrink-0 text-app-fg-subtle">·</span>
              <span className="truncate font-medium">{mediaLabel.detail}</span>
            </div>
            <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-app-fg-secondary">{excerpt}</p>
            {hasAnalysis ? (
              <p className="mt-1.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300/90">
                We already studied this reel — this will be quicker.
              </p>
            ) : (
              <p className="mt-1.5 text-[10px] text-app-fg-subtle">
                First time may take about a minute while we study the reel. You can leave this screen once Generate
                opens.
              </p>
            )}
            {postUrl ? (
              <div className="mt-1.5 min-w-0 border-t border-zinc-200/80 pt-1.5 dark:border-white/10">
                <p className="text-[9px] font-bold uppercase tracking-wider text-app-fg-subtle">Source URL</p>
                <p
                  className="mt-0.5 truncate font-mono text-[10px] leading-tight text-app-fg-muted"
                  title={postUrl}
                >
                  {postUrl}
                </p>
                <p className="mt-0.5">
                  <a
                    href={postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-semibold text-amber-600 underline-offset-2 hover:underline dark:text-amber-400"
                  >
                    Open original on Instagram ↗
                  </a>
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {!sessionId ? (
          <>
            <div className="mt-4">
              <p className="mb-1.5 block text-xs font-semibold text-app-fg">
                Recreate as <span className="font-normal text-app-fg-muted">(required)</span>
              </p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Target format">
                {RECREATE_FORMAT_OPTIONS.map(({ key, label, hint }) => {
                  const active = formatChoice === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      title={hint}
                      disabled={busy}
                      onClick={() => setFormatChoice(key)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                        active
                          ? "border-amber-500/55 bg-amber-500/10 text-app-fg"
                          : "border-zinc-200/90 bg-white text-zinc-700 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-900/60 dark:text-app-fg-muted dark:hover:border-white/20"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-app-fg-subtle">
                {formatChoice
                  ? "We keep the source reel's idea and payoff, but rewrite beats and on-screen text for the format you chose."
                  : "Choose the type of post you want — text-on-video, talking head, or carousel."}
              </p>
            </div>

            {templatesLoading ? (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-white/70 px-3 py-3 text-[11px] text-app-fg-muted dark:border-white/10 dark:bg-zinc-900/50">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                Loading styles…
              </div>
            ) : formatChoice === "carousel" ? (
              carouselTemplates.length > 0 ? (
                <CarouselTemplatePicker
                  templates={carouselTemplates}
                  selectedId={selectedCarouselTemplateId}
                  onSelect={setSelectedCarouselTemplateId}
                  disabled={busy || templatesLoading}
                />
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-zinc-200/90 bg-white/60 p-3 text-[11px] leading-relaxed text-app-fg-muted dark:border-white/10 dark:bg-zinc-900/50">
                  No carousel styles configured yet.{" "}
                  <Link
                    href="/settings#content-defaults"
                    className="font-semibold text-amber-700 hover:underline dark:text-amber-400"
                  >
                    Add in Settings
                  </Link>{" "}
                  to reuse a slide structure from example images.
                </div>
              )
            ) : formatChoice ? (
              coverTemplates.length > 0 ? (
                <CoverTemplatePicker
                  templates={coverTemplates}
                  selectedId={selectedCoverTemplateId}
                  onSelect={setSelectedCoverTemplateId}
                  disabled={busy || templatesLoading}
                />
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-zinc-200/90 bg-white/60 p-3 text-[11px] leading-relaxed text-app-fg-muted dark:border-white/10 dark:bg-zinc-900/50">
                  No cover styles configured yet.{" "}
                  <Link
                    href="/settings#content-defaults"
                    className="font-semibold text-amber-700 hover:underline dark:text-amber-400"
                  >
                    Add in Settings
                  </Link>{" "}
                  to start covers from a saved example.
                </div>
              )
            ) : null}

            {ctaLibrary.length > 0 ? (
              <NextStepPicker
                library={ctaLibrary}
                selectedId={selectedCtaId}
                onSelect={setSelectedCtaId}
                disabled={busy || templatesLoading}
              />
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-zinc-200/90 bg-white/60 p-3 text-[11px] leading-relaxed text-app-fg-muted dark:border-white/10 dark:bg-zinc-900/50">
                No next steps configured yet.{" "}
                <Link
                  href="/settings#content-defaults"
                  className="font-semibold text-amber-700 hover:underline dark:text-amber-400"
                >
                  Add in Settings
                </Link>{" "}
                so adapted posts know where to send viewers.
              </div>
            )}

            <label htmlFor="recreate-extra" className="mt-4 block text-xs font-semibold text-app-fg">
              Extra focus <span className="font-normal text-app-fg-muted">(optional)</span>
            </label>
            <textarea
              id="recreate-extra"
              rows={3}
              value={extraInstruction}
              onChange={(e) => setExtraInstruction(e.target.value)}
              disabled={busy}
              placeholder="e.g. Stronger German workplace framing, or keep the list format but change the topic…"
              className="mt-1.5 w-full resize-y rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900/80 dark:text-app-fg dark:placeholder:text-app-fg-faint"
            />

            <button
              type="button"
              disabled={busy || templatesLoading || !postUrl || disabled || !formatChoice}
              onClick={() => void submit()}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
              {busy
                ? "Creating session…"
                : !formatChoice
                ? "Pick a target format above"
                : "Start adaptation"}
            </button>
          </>
        ) : (
          <div className="mt-4 space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <p className="text-sm font-semibold text-app-fg">Angles ready</p>
            <p className="text-xs text-app-fg-muted">
              Open Generate to pick an angle, then get script and captions for your client.
            </p>
            {postUrl ? (
              <p className="truncate font-mono text-[10px] text-app-fg-muted" title={postUrl}>
                {postUrl}
              </p>
            ) : null}
            <Link
              href={generateSessionHref(sessionId)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-zinc-950"
              onClick={onClose}
            >
              Continue in Generate
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="w-full text-center text-xs font-semibold text-app-fg-muted hover:text-app-fg"
            >
              Close
            </button>
          </div>
        )}

        {phase ? (
          <p className="mt-3 text-xs text-zinc-600 dark:text-app-fg-muted" aria-live="polite">
            {phase}
          </p>
        ) : null}
        {msg ? (
          <p className="mt-3 text-xs text-amber-800 dark:text-amber-200/90" role="alert">
            {msg}
          </p>
        ) : null}
      </div>
    </div>
  );
}
