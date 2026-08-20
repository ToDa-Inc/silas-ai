"use client";

import type { Operation } from "fast-json-patch";
import type { VideoSpec, VideoSpecAppearance, VideoSpecLayout } from "@/lib/video-spec";
import { getContentApiBase } from "@/lib/env";
import {
  type SelectedCarouselTemplatePayload,
  type SelectedCoverTemplatePayload,
  type SelectedCtaPayload,
  clientApiHeaders,
  contentApiFetch,
} from "./client-context";
import { formatFastApiError } from "./format-error";

export type TextBlock = { text: string; isCTA?: boolean };

export type ThumbnailEditOptions = {
  cropY?: number;
  zoom?: number;
  wash?: boolean;
  templateId?: VideoSpec["templateId"];
  themeId?: VideoSpec["themeId"];
  textTreatment?: "bold-outline" | null;
  layout?: VideoSpecLayout;
  appearance?: VideoSpecAppearance;
};

export type GenerationSession = {
  id: string;
  client_id: string;
  source_type: string;
  source_analysis_ids?: string[] | null;
  source_reel_ids?: string[] | null;
  source_format_key?: string | null;
  source_url?: string | null;
  source_idea?: string | null;
  source_script?: string | null;
  synthesized_patterns?: Record<string, unknown> | null;
  angles?: Array<Record<string, unknown>> | null;
  chosen_angle_index?: number | null;
  hooks?: Array<{ text: string; tier?: number }> | null;
  script?: string | null;
  caption_body?: string | null;
  hashtags?: string[] | null;
  story_variants?: string[] | null;
  text_blocks?: TextBlock[] | null;
  video_spec?: Record<string, unknown> | null;
  cover_text_options?: string[] | null;
  background_type?: string | null;
  broll_clip_id?: string | null;
  client_image_id?: string | null;
  background_url?: string | null;
  rendered_video_url?: string | null;
  thumbnail_url?: string | null;
  cover_spec?: Record<string, unknown> | null;
  alternates?: GenerationAlternates | null;
  render_status?: string | null;
  render_error?: string | null;
  render_progress_pct?: number | null;
  carousel_slides?: CarouselSlide[] | null;
  /** Snapshot of the CTA the user picked under the format selector. See ``ClientCta``. */
  selected_cta?: SelectedCtaPayload | null;
  selected_carousel_template?: SelectedCarouselTemplatePayload | null;
  selected_cover_template?: SelectedCoverTemplatePayload | null;
  /** 3–10; set at session start for carousel sessions */
  carousel_slide_count?: number | null;
  status: string;
  feedback?: string | null;
  last_error?: string | null;
  prompt_version?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type VariantOption = {
  id: string;
  text: string;
  source?: "auto" | "variants" | "refine";
  created_at?: string;
};

export type GenerationAlternates = Partial<
  Record<"hook" | "block" | "cover" | "caption", VariantOption[]>
>;

export type GenerateVariantsBody = {
  kind: "hook" | "block" | "cover" | "caption";
  element_id?: string;
  n?: number;
  feedback?: string;
};

export type GenerateVariantsResponse = {
  kind: "hook" | "block" | "cover" | "caption";
  element_id?: string | null;
  variants: VariantOption[];
};

/** Normalized text frame for carousel composition (mirrors backend ``CarouselTextBox``). */
export type CarouselTextBox = {
  x: number;
  y: number;
  width: number;
  align: "left" | "center" | "right";
  scale: number;
  card: boolean;
  font?: "playfair" | "inter" | "poppins" | "georgia";
};

export type CarouselBackgroundStyle = {
  overlay_color: string;
  overlay_opacity: number;
};

export type CarouselSlide = {
  idx: number;
  text: string;
  /** Background without burned-in text — editor preview + ZIP compose base. */
  base_image_url?: string | null;
  image_url?: string | null;
  prompt?: string | null;
  /** Legacy slide typography (pre–text_box). When present without ``text_box``, re-render uses layout overlay. */
  layout?: VideoSpecLayout | null;
  text_box?: CarouselTextBox | null;
  background_style?: CarouselBackgroundStyle | null;
};

export type FormatDigestSummary = {
  format_key: string;
  reel_count?: number | null;
  mature_count?: number | null;
  avg_engagement?: number | null;
  /** Mean views ÷ comments over mature reels in this format. */
  avg_comment_view_ratio?: number | null;
  avg_save_rate?: number | null;
  avg_share_rate?: number | null;
  avg_duration_s?: number | null;
  /** Carousel-only: mean of scraped_reels.outlier_likes_ratio (likes vs account avg). */
  avg_outlier_likes_ratio?: number | null;
  /** Carousel-only: fallback ranking metric when likes outlier is null. */
  avg_outlier_comments_ratio?: number | null;
  computed_at?: string | null;
};
export async function fetchFormatDigests(
  clientSlug: string,
  orgSlug: string,
  refresh = false,
): Promise<{ ok: true; data: FormatDigestSummary[] } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  const q = refresh ? "?refresh=true" : "";
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/format-digests${q}`,
      { headers },
    );
    const json = (await res.json().catch(() => [])) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(
          json as Record<string, unknown>,
          `Request failed (${res.status})`,
        ),
      };
    }
    return { ok: true, data: Array.isArray(json) ? (json as FormatDigestSummary[]) : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export type FormatRecommendation = {
  format_key?: string;
  score?: number;
  reasoning?: string;
  suggested_angle_hint?: string;
};

export async function recommendFormatForIdea(
  clientSlug: string,
  orgSlug: string,
  idea: string,
): Promise<{ ok: true; data: FormatRecommendation[] } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/recommend-format`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      recommendations?: FormatRecommendation[];
      detail?: unknown;
    };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    return { ok: true, data: Array.isArray(json.recommendations) ? json.recommendations : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export type AutoVideoIdea = {
  idea: string;
  suggested_format_key: string;
  reasoning: string;
};

export async function generateAutoVideoIdea(
  clientSlug: string,
  orgSlug: string,
): Promise<{ ok: true; data: AutoVideoIdea } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/auto-video-idea`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
    const json = (await res.json().catch(() => ({}))) as Partial<AutoVideoIdea> & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    if (!json.idea || !json.suggested_format_key) {
      return { ok: false, error: "Empty response from auto-video-idea" };
    }
    return {
      ok: true,
      data: {
        idea: String(json.idea),
        suggested_format_key: String(json.suggested_format_key),
        reasoning: String(json.reasoning ?? ""),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}
export async function generationStart(
  clientSlug: string,
  orgSlug: string,
  body: {
    source_type:
      | "outlier"
      | "patterns"
      | "manual"
      | "format_pick"
      | "idea_match"
      | "url_adapt"
      | "script_adapt";
    source_analysis_ids?: string[];
    max_analyses?: number;
    extra_instruction?: string;
    format_key?: string;
    idea_text?: string;
    url?: string;
    source_script?: string;
    selected_cta?: SelectedCtaPayload;
    selected_carousel_template?: SelectedCarouselTemplatePayload;
    selected_cover_template?: SelectedCoverTemplatePayload;
    carousel_slide_count?: number;
    recreate_mode?: "one_to_one" | "adapt";
  },
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/start`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as GenerationSession & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    return { ok: true, data: json as GenerationSession };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function generationChooseAngle(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  angleIndex: number,
  options?: { extra_instruction?: string },
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  const body: { angle_index: number; extra_instruction?: string } = { angle_index: angleIndex };
  const extra = options?.extra_instruction?.trim();
  if (extra) body.extra_instruction = extra;
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/sessions/${encodeURIComponent(sessionId)}/choose-angle`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as GenerationSession & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    return { ok: true, data: json as GenerationSession };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function generationRegenerate(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  body: {
    scope: "hooks" | "script" | "caption" | "story" | "text_blocks" | "all";
    feedback?: string;
  },
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/sessions/${encodeURIComponent(sessionId)}/regenerate`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as GenerationSession & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    if (!json || typeof json !== "object" || typeof (json as GenerationSession).id !== "string") {
      return { ok: false, error: "Invalid response from server after regenerate." };
    }
    return { ok: true, data: json as GenerationSession };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** Re-roll the AI cover headlines for a session without touching hooks/script/caption.
 *  Cheap, dedicated endpoint — see backend run_cover_text_options. */
export async function generationRegenerateCovers(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/sessions/${encodeURIComponent(sessionId)}/regenerate-covers`,
      { method: "POST", headers },
    );
    const json = (await res.json().catch(() => ({}))) as GenerationSession & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    if (!json || typeof json !== "object" || typeof (json as GenerationSession).id !== "string") {
      return { ok: false, error: "Invalid response from server after regenerate-covers." };
    }
    return { ok: true, data: json as GenerationSession };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function generationListSessions(
  clientSlug: string,
  orgSlug: string,
  limit = 20,
): Promise<{ ok: true; data: GenerationSession[] } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/sessions?limit=${limit}`,
      { headers },
    );
    const json = (await res.json().catch(() => [])) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(
          json as Record<string, unknown>,
          `Failed (${res.status})`,
        ),
      };
    }
    return { ok: true, data: Array.isArray(json) ? (json as GenerationSession[]) : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** GET …/generate/sessions/{sessionId} — resume a saved session. */
export async function generationGetSession(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/sessions/${encodeURIComponent(sessionId)}`,
      { headers },
    );
    const json = (await res.json().catch(() => ({}))) as GenerationSession & { detail?: unknown };
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`),
      };
    }
    return { ok: true, data: json as GenerationSession };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** PATCH …/generate/sessions/{sessionId} — e.g. swap carousel reference template before slides exist. */
export async function generationPatchSession(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  body: {
    selected_carousel_template: SelectedCarouselTemplatePayload;
    /** When slides already exist, must be true to apply a new template (server clears slides). */
    clear_carousel_slides?: boolean;
  },
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as GenerationSession & { detail?: unknown };
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`),
      };
    }
    return { ok: true, data: json as GenerationSession };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** PATCH …/generate/sessions/{sessionId}/cover-spec — autosave cover editor state. */
export async function patchCoverSpec(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  coverSpec: import("../cover-edit").CoverSpecPayload,
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/sessions/${encodeURIComponent(sessionId)}/cover-spec`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ cover_spec: coverSpec }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as GenerationSession & { detail?: unknown };
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`),
      };
    }
    return { ok: true, data: json as GenerationSession };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** POST …/generate/sessions/{sessionId}/variants — generate N alternates for the Studio inspector. */
export async function generationGenerateVariants(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  body: GenerateVariantsBody,
): Promise<{ ok: true; data: GenerateVariantsResponse } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/sessions/${encodeURIComponent(sessionId)}/variants`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as GenerateVariantsResponse & { detail?: unknown };
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`),
      };
    }
    if (!json || typeof json !== "object" || !Array.isArray(json.variants)) {
      return { ok: false, error: "Invalid response from server after variants generation." };
    }
    return { ok: true, data: json as GenerateVariantsResponse };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function generationDeleteSession(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE", headers },
    );
    if (res.status === 204 || res.ok) {
      return { ok: true };
    }
    const json = (await res.json().catch(() => ({}))) as { detail?: unknown };
    return {
      ok: false,
      error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}
export async function creationListSessions(
  clientSlug: string,
  orgSlug: string,
  limit = 50,
): Promise<{ ok: true; data: GenerationSession[] } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions?limit=${limit}`,
      { headers },
    );
    const json = (await res.json().catch(() => [])) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`),
      };
    }
    return { ok: true, data: Array.isArray(json) ? (json as GenerationSession[]) : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function patchCreateSession(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  body: {
    text_blocks?: TextBlock[];
    script?: string;
    caption_body?: string;
    hashtags?: string[];
  },
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as GenerationSession & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    return { ok: true, data: json as GenerationSession };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function patchSessionVideoSpec(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  body: { ops: Operation[] },
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions/${encodeURIComponent(sessionId)}/spec`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as GenerationSession & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    return { ok: true, data: json as GenerationSession };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** Shrink block read-times so hook + gaps + blocks fit ``background.durationSec``. */
export async function postFitSessionSpecToBroll(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions/${encodeURIComponent(sessionId)}/spec/fit-to-broll`,
      {
        method: "POST",
        headers: { ...headers },
      },
    );
    const json = (await res.json().catch(() => ({}))) as GenerationSession & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    return { ok: true, data: json as GenerationSession };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function promptEditSessionVideoSpec(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  body: { instruction: string },
): Promise<
  | { ok: true; data: { ops: Operation[]; summary: string; preview_spec: VideoSpec } }
  | { ok: false; error: string }
> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions/${encodeURIComponent(sessionId)}/spec/prompt-edit`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      ops?: Operation[];
      summary?: string;
      preview_spec?: VideoSpec;
      detail?: unknown;
    };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    if (!Array.isArray(json.ops) || !json.preview_spec) {
      return { ok: false, error: "Invalid prompt-edit response" };
    }
    return {
      ok: true,
      data: {
        ops: json.ops,
        summary: String(json.summary ?? ""),
        preview_spec: json.preview_spec as VideoSpec,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}
export async function generationGenerateThumbnail(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  hookText?: string,
  options?: ThumbnailEditOptions,
): Promise<{ ok: true; data: { thumbnail_url: string } } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/sessions/${encodeURIComponent(sessionId)}/generate-thumbnail`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          hook_text: hookText ?? null,
          wash: options?.wash ?? false,
          template_id: options?.templateId ?? "centered-pop",
          theme_id: options?.themeId ?? "bold-modern",
          text_treatment: options?.textTreatment ?? null,
          layout: options?.layout ?? null,
          appearance: options?.appearance ?? null,
        }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as { thumbnail_url?: string; detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    if (!json.thumbnail_url) {
      return { ok: false, error: "No thumbnail URL returned" };
    }
    return { ok: true, data: { thumbnail_url: json.thumbnail_url } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}
export async function generationSetStatus(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  action: "approve" | "reject",
  feedback?: string,
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  const path =
    action === "approve" ? "approve" : "reject";
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/sessions/${encodeURIComponent(sessionId)}/${path}`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback ?? null }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as GenerationSession & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    return { ok: true, data: json as GenerationSession };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}
