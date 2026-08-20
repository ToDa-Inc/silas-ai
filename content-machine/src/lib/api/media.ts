"use client";

import type { VideoSpecLayout } from "@/lib/video-spec";
import { getContentApiBase } from "@/lib/env";
import { clientApiHeaders, contentApiFetch } from "./client-context";
import { formatFastApiError } from "./format-error";
import type {
  CarouselSlide,
  CarouselTextBox,
  GenerationSession,
  ThumbnailEditOptions,
} from "./generate";

export async function creationGenerateBackground(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions/${encodeURIComponent(sessionId)}/generate-background`,
      { method: "POST", headers },
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

export async function creationSetBroll(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  brollClipId: string,
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions/${encodeURIComponent(sessionId)}/set-broll`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ broll_clip_id: brollClipId }),
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

export async function creationRenderVideo(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
): Promise<{ ok: true; job_id: string } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions/${encodeURIComponent(sessionId)}/render`,
      { method: "POST", headers },
    );
    const json = (await res.json().catch(() => ({}))) as { job_id?: string; detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    const jobId = json.job_id;
    if (!jobId) return { ok: false, error: "No job_id returned" };
    return { ok: true, job_id: jobId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export type BrollClipRow = {
  id: string;
  file_url: string;
  thumbnail_url?: string | null;
  label?: string | null;
  created_at?: string | null;
};

export async function brollList(
  clientSlug: string,
  orgSlug: string,
): Promise<{ ok: true; data: BrollClipRow[] } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/broll`,
      { headers },
    );
    const json = (await res.json().catch(() => [])) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`),
      };
    }
    return { ok: true, data: Array.isArray(json) ? (json as BrollClipRow[]) : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function brollDelete(
  clientSlug: string,
  orgSlug: string,
  clipId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/broll/${encodeURIComponent(clipId)}`,
      { method: "DELETE", headers },
    );
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export type BackgroundJobRow = {
  id: string;
  job_type?: string | null;
  status: string;
  result?: Record<string, unknown> | null;
  error_message?: string | null;
};

export async function fetchBackgroundJob(
  orgSlug: string,
  jobId: string,
): Promise<{ ok: true; data: BackgroundJobRow } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(`${base}/api/v1/jobs/${encodeURIComponent(jobId)}`, { headers });
    const json = (await res.json().catch(() => ({}))) as BackgroundJobRow & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`) };
    }
    return { ok: true, data: json as BackgroundJobRow };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}
// ── Client image library (cover + video background, alternative to AI) ──────────

export type ClientImageRow = {
  id: string;
  client_id?: string;
  file_url: string;
  label?: string | null;
  width?: number | null;
  height?: number | null;
  created_at?: string | null;
};

export async function clientImagesList(
  clientSlug: string,
  orgSlug: string,
): Promise<{ ok: true; data: ClientImageRow[] } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/images`,
      { headers },
    );
    const json = (await res.json().catch(() => [])) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`),
      };
    }
    return { ok: true, data: Array.isArray(json) ? (json as ClientImageRow[]) : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function clientImagesDelete(
  clientSlug: string,
  orgSlug: string,
  imageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/images/${encodeURIComponent(imageId)}`,
      { method: "DELETE", headers },
    );
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function creationSetBackgroundImage(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  clientImageId: string,
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions/${encodeURIComponent(sessionId)}/set-background-image`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ client_image_id: clientImageId }),
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

export async function generationComposeThumbnail(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  clientImageId: string,
  hookText?: string,
  options?: ThumbnailEditOptions,
): Promise<{ ok: true; data: { thumbnail_url: string } } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/generate/sessions/${encodeURIComponent(sessionId)}/compose-thumbnail`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          client_image_id: clientImageId,
          hook_text: hookText ?? null,
          wash: options?.wash ?? false,
          crop_y: options?.cropY ?? 0.5,
          zoom: options?.zoom ?? 1,
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

// ── Carousel slides ────────────────────────────────────────────────────────

export async function carouselSlidesGenerate(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  count: number,
  style?: string,
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions/${encodeURIComponent(
        sessionId,
      )}/carousel-slides/generate`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ count, style: style ?? null }),
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

export async function carouselSlideRegenerate(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  args: {
    idx: number;
    text?: string;
    prompt?: string;
    image_source?: "ai" | "client_image";
    client_image_id?: string;
    layout?: VideoSpecLayout | null;
    text_box?: CarouselTextBox | null;
  },
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions/${encodeURIComponent(
        sessionId,
      )}/carousel-slides/regenerate`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          idx: args.idx,
          text: args.text ?? null,
          prompt: args.prompt ?? null,
          image_source: args.image_source ?? "ai",
          client_image_id: args.client_image_id ?? null,
          layout: args.layout ?? null,
          text_box: args.text_box ?? null,
        }),
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

export async function carouselSlidesPatch(
  clientSlug: string,
  orgSlug: string,
  sessionId: string,
  slides: CarouselSlide[],
): Promise<{ ok: true; data: GenerationSession } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions/${encodeURIComponent(
        sessionId,
      )}/carousel-slides`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ slides }),
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

export function carouselSlidesZipUrl(clientSlug: string, sessionId: string): string {
  const base = getContentApiBase();
  return `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/create/sessions/${encodeURIComponent(
    sessionId,
  )}/carousel-slides/zip`;
}
