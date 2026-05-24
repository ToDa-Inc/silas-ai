import type { VideoSpec, VideoSpecAppearance, VideoSpecLayout } from "./video-spec";
import { DEFAULT_LAYOUT } from "./video-spec";

export type CoverEditState = {
  cropY: number;
  zoom: number;
  wash: boolean;
  templateId: VideoSpec["templateId"];
  themeId: VideoSpec["themeId"];
  textTreatment?: "bold-outline";
  layout: VideoSpecLayout;
  appearance: VideoSpecAppearance;
};

export const DEFAULT_COVER_EDIT: CoverEditState = {
  cropY: 0.5,
  zoom: 1,
  wash: false,
  templateId: "centered-pop",
  themeId: "bold-modern",
  layout: { ...DEFAULT_LAYOUT },
  appearance: {},
};

export function coverPayload(edit: CoverEditState) {
  return {
    cropY: edit.cropY,
    zoom: edit.zoom,
    wash: edit.wash,
    templateId: edit.templateId,
    themeId: edit.themeId,
    textTreatment: edit.textTreatment ?? null,
    layout: edit.layout,
    appearance: edit.appearance,
  };
}

/** Persisted shape on `generation_sessions.cover_spec` (snake_case to match backend). */
export type CoverSpecPayload = {
  crop_y: number;
  zoom: number;
  wash: boolean;
  template_id: VideoSpec["templateId"];
  theme_id: VideoSpec["themeId"];
  text_treatment: "bold-outline" | null;
  layout: VideoSpecLayout | null;
  appearance: VideoSpecAppearance | null;
  hook_text?: string | null;
  cover_mode?: "ai" | "image" | null;
  client_image_id?: string | null;
};

/** Editor state -> persisted backend payload. */
export function coverSpecToPayload(
  edit: CoverEditState,
  extras?: { hookText?: string | null; coverMode?: "ai" | "image" | null; clientImageId?: string | null },
): CoverSpecPayload {
  return {
    crop_y: edit.cropY,
    zoom: edit.zoom,
    wash: edit.wash,
    template_id: edit.templateId,
    theme_id: edit.themeId,
    text_treatment: edit.textTreatment ?? null,
    layout: edit.layout,
    appearance: edit.appearance,
    hook_text: extras?.hookText ?? null,
    cover_mode: extras?.coverMode ?? null,
    client_image_id: extras?.clientImageId ?? null,
  };
}

/** Hydrate editor state from a persisted backend payload. Safe against partial / legacy rows. */
export function coverSpecFromPayload(raw: unknown): CoverEditState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const allowedTemplate: VideoSpec["templateId"][] = [
    "centered-pop",
    "bottom-card",
    "top-banner",
    "stacked-cards",
    "capcut-highlight",
  ];
  const allowedTheme: VideoSpec["themeId"][] = [
    "bold-modern",
    "editorial",
    "casual-hand",
    "clean-minimal",
  ];
  const templateId = allowedTemplate.includes(o.template_id as VideoSpec["templateId"])
    ? (o.template_id as VideoSpec["templateId"])
    : DEFAULT_COVER_EDIT.templateId;
  const themeId = allowedTheme.includes(o.theme_id as VideoSpec["themeId"])
    ? (o.theme_id as VideoSpec["themeId"])
    : DEFAULT_COVER_EDIT.themeId;
  const layout =
    o.layout && typeof o.layout === "object"
      ? ({ ...DEFAULT_LAYOUT, ...(o.layout as Partial<VideoSpecLayout>) } as VideoSpecLayout)
      : { ...DEFAULT_LAYOUT };
  const appearance =
    o.appearance && typeof o.appearance === "object"
      ? (o.appearance as VideoSpecAppearance)
      : {};
  return {
    cropY: num(o.crop_y, DEFAULT_COVER_EDIT.cropY, 0, 1),
    zoom: num(o.zoom, DEFAULT_COVER_EDIT.zoom, 1, 3),
    wash: Boolean(o.wash),
    templateId,
    themeId,
    textTreatment: o.text_treatment === "bold-outline" ? "bold-outline" : undefined,
    layout,
    appearance,
  };
}

/** Pull the hook text override the user typed (kept alongside style for round-tripping). */
export function coverHookTextFromPayload(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const v = (raw as Record<string, unknown>).hook_text;
  return typeof v === "string" ? v : "";
}
