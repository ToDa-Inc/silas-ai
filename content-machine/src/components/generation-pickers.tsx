"use client";

import Link from "next/link";
import type { ClientCarouselTemplate, ClientCoverTemplate, ClientCta } from "@/lib/api";
import { cn } from "@/lib/cn";

export const CTA_TYPE_LABEL: Record<string, string> = {
  website: "Website",
  newsletter: "Newsletter",
  video: "Video",
  lead_magnet: "Free resource",
  booking: "Booking",
  other: "Other",
};

export const FORMAT_OPTIONS = [
  {
    key: "text_overlay" as const,
    label: "Text on video",
    hint: "B-roll or images with bold on-screen text — great for tips and lists.",
  },
  {
    key: "talking_head" as const,
    label: "You on camera",
    hint: "You speak directly to camera for the whole reel.",
  },
  {
    key: "carousel" as const,
    label: "Carousel",
    hint: "Swipeable image slides — like a mini slideshow on Instagram.",
  },
];

export const RECREATION_MODES = [
  {
    key: "one_to_one" as const,
    label: "Exact copy",
    hint: "Same on-screen text as the original, translated. Skips angle picking — straight to the editor.",
  },
  {
    key: "adapt" as const,
    label: "Adapt for me",
    hint: "Rework the idea into new angles tailored to your audience. You'll pick one next.",
  },
] as const;

function ctaDestinationLine(cta: ClientCta): string {
  const dest = (cta.destination || "").trim();
  if (dest) return dest;
  if (cta.type === "lead_magnet") return "Comment keyword in caption";
  return cta.traffic_goal?.trim() || "";
}

function TemplatePreviewThumb({
  src,
  alt,
  active,
}: {
  src: string | null | undefined;
  alt: string;
  active: boolean;
}) {
  if (!src) {
    return (
      <span
        className={cn(
          "flex h-14 w-10 shrink-0 items-center justify-center rounded-md border border-dashed border-app-divider bg-app-chip-bg/40 text-[9px] text-app-fg-subtle",
          active && "border-amber-500/50",
        )}
      >
        No img
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- user media URLs
    <img
      src={src}
      alt={alt}
      className={cn(
        "h-14 w-10 shrink-0 rounded-md border border-app-divider object-cover",
        active && "ring-2 ring-amber-500/60",
      )}
      loading="lazy"
      decoding="async"
    />
  );
}

export function CtaPicker({
  library,
  selectedId,
  onSelect,
  settingsHref = "/settings#content-defaults",
}: {
  library: ClientCta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  settingsHref?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-app-fg-subtle">
          Where should viewers go? <span className="font-normal text-app-fg-muted">(required)</span>
        </p>
        <Link
          href={settingsHref}
          className="text-[11px] font-semibold text-amber-600 hover:underline dark:text-amber-400"
        >
          Edit next steps →
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Next step">
        {library.map((cta) => {
          const active = selectedId === cta.id;
          const typeLabel = CTA_TYPE_LABEL[cta.type] ?? cta.type;
          const destination = ctaDestinationLine(cta);
          return (
            <button
              key={cta.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(cta.id)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left text-xs transition-colors",
                active
                  ? "border-amber-500/50 bg-amber-500/10 text-app-fg"
                  : "border-app-divider bg-app-chip-bg/40 text-app-fg-muted hover:bg-app-chip-bg/70",
              )}
            >
              <span className="font-semibold text-app-fg">{cta.label}</span>
              <span className="mt-0.5 block text-[10px] font-medium text-app-fg-subtle">
                {typeLabel}
                {destination ? ` · ${destination}` : ""}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-app-fg-muted">
        Caption, script, and on-screen text will point viewers to this destination.
      </p>
    </div>
  );
}

export function CtaPickerEmpty({
  settingsHref = "/settings#content-defaults",
}: {
  settingsHref?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-app-divider bg-app-chip-bg/20 p-3 text-[11px] leading-relaxed text-app-fg-muted">
      No next steps configured yet.{" "}
      <Link
        href={settingsHref}
        className="font-semibold text-amber-600 hover:underline dark:text-amber-400"
      >
        Add one in Settings
      </Link>{" "}
      so posts know where to send viewers.
    </div>
  );
}

export function CarouselSlideCountPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const presets = [5, 7, 10];
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-app-fg-subtle">
        How many slides? <span className="font-normal text-app-fg-muted">(3–10)</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
              value === n
                ? "border-amber-500/50 bg-amber-500/10 text-app-fg"
                : "border-app-divider bg-app-chip-bg/40 text-app-fg-muted hover:bg-app-chip-bg/70",
            )}
          >
            {n} slides
          </button>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={3}
            max={10}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-28 max-w-full accent-amber-500"
            aria-label="Number of carousel slides"
          />
          <span className="min-w-[2ch] text-sm font-bold text-app-fg">{value}</span>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-app-fg-muted">
        Most carousels work well with 5–7 slides. The style below sets the look — not the count.
      </p>
    </div>
  );
}

export function CarouselTemplatePicker({
  templates,
  selectedId,
  onSelect,
  settingsHref = "/settings#content-defaults",
}: {
  templates: ClientCarouselTemplate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  settingsHref?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-app-fg-subtle">
          Carousel look <span className="font-normal text-app-fg-muted">(required)</span>
        </p>
        <Link
          href={settingsHref}
          className="text-[11px] font-semibold text-amber-600 hover:underline dark:text-amber-400"
        >
          Edit styles →
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Carousel style">
        {templates.map((template) => {
          const active = selectedId === template.id;
          const previewUrl = template.slides[0]?.reference_image_url;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(template.id)}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-amber-500/50 bg-amber-500/10"
                  : "border-app-divider bg-app-chip-bg/40 hover:bg-app-chip-bg/70",
              )}
            >
              <TemplatePreviewThumb src={previewUrl} alt={template.name} active={active} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-app-fg">{template.name}</span>
                <span className="mt-0.5 block text-[10px] text-app-fg-muted">
                  {template.slides.length} example image{template.slides.length === 1 ? "" : "s"}
                </span>
                {template.description ? (
                  <span className="mt-1 block line-clamp-2 text-[10px] leading-snug text-app-fg-subtle">
                    {template.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CarouselTemplatePickerEmpty({
  settingsHref = "/settings#content-defaults",
}: {
  settingsHref?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-app-divider bg-app-chip-bg/20 p-3 text-[11px] leading-relaxed text-app-fg-muted">
      No carousel styles yet.{" "}
      <Link href={settingsHref} className="font-semibold text-amber-600 hover:underline dark:text-amber-400">
        Add one in Settings
      </Link>{" "}
      using example images from Media.
    </div>
  );
}

export function CoverTemplatePicker({
  templates,
  selectedId,
  onSelect,
  settingsHref = "/settings#content-defaults",
}: {
  templates: ClientCoverTemplate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  settingsHref?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-app-fg-subtle">
          Thumbnail / cover look <span className="font-normal text-app-fg-muted">(required)</span>
        </p>
        <Link
          href={settingsHref}
          className="text-[11px] font-semibold text-amber-600 hover:underline dark:text-amber-400"
        >
          Edit styles →
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Cover style">
        {templates.map((template) => {
          const active = selectedId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(template.id)}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-amber-500/50 bg-amber-500/10"
                  : "border-app-divider bg-app-chip-bg/40 hover:bg-app-chip-bg/70",
              )}
            >
              <TemplatePreviewThumb
                src={template.reference_image_url}
                alt={template.name}
                active={active}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-app-fg">{template.name}</span>
                <span className="mt-0.5 block text-[10px] text-app-fg-muted">
                  {template.reference_label ?? "1 example image"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-app-fg-muted">
        This is the frame people see before they tap play on your reel.
      </p>
    </div>
  );
}

export function CoverTemplatePickerEmpty({
  settingsHref = "/settings#content-defaults",
}: {
  settingsHref?: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-app-divider bg-app-chip-bg/20 p-3 text-[11px] leading-relaxed text-app-fg-muted">
      No cover styles yet.{" "}
      <Link href={settingsHref} className="font-semibold text-amber-600 hover:underline dark:text-amber-400">
        Add one in Settings
      </Link>{" "}
      using an example from Media.
    </div>
  );
}

export function RecreationModePicker({
  value,
  onChange,
}: {
  value: "one_to_one" | "adapt";
  onChange: (mode: "one_to_one" | "adapt") => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-app-fg-subtle">
        How should we recreate it?
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Recreation mode">
        {RECREATION_MODES.map(({ key, label, hint }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(key)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-amber-500/55 bg-amber-500/10"
                  : "border-app-divider bg-app-chip-bg/20 hover:border-amber-500/30",
              )}
            >
              <span className="block text-xs font-semibold text-app-fg">{label}</span>
              <span className="mt-1 block text-[11px] leading-relaxed text-app-fg-muted">{hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RecreateFormatPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (key: "text_overlay" | "talking_head" | "carousel") => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-app-fg-subtle">
        Post type <span className="font-normal text-app-fg-muted">(required)</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Target format">
        {FORMAT_OPTIONS.map(({ key, label, hint }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(key)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-amber-500/50 bg-amber-500/10"
                  : "border-app-divider bg-app-chip-bg/40 hover:bg-app-chip-bg/70",
              )}
            >
              <span className="block text-xs font-semibold text-app-fg">{label}</span>
              <span className="mt-1 block text-[10px] leading-relaxed text-app-fg-muted">{hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
