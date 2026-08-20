"use client";

import type { ScrapedReelRow } from "@/lib/api";
import { getContentApiBase } from "@/lib/env";
import { clientApiHeaders, contentApiFetch } from "./client-context";
import { formatFastApiError } from "./format-error";

export type OnboardingStatus = {
  id: string;
  client_id: string;
  status: string;
  current_step: string;
  completed_steps: string[];
  quiz_answers: Record<string, unknown>;
  pipeline_progress: Record<string, unknown>;
  ig_prefill: Record<string, unknown>;
  voice_transcript: Record<string, unknown>;
  context_preview_locked: boolean;
  job_ids: Record<string, unknown>;
  selected_reel_id: string | null;
  selected_generation_session_id: string | null;
  action_plan: Record<string, unknown> | null;
  last_error: string | null;
  aha_completed_at: string | null;
  aha_complete: boolean;
};

export type OnboardingReelCandidate = {
  reel: ScrapedReelRow;
  analysis: Record<string, unknown> | null;
  score: number;
  already_voted: string | null;
};

export async function fetchOnboardingStatusClient(
  clientSlug: string,
  orgSlug: string,
): Promise<{ ok: true; data: OnboardingStatus } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/onboarding/status`,
      { headers, cache: "no-store" },
    );
    const json = (await res.json().catch(() => ({}))) as OnboardingStatus & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true, data: json as OnboardingStatus };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** Go to the previous onboarding step without clearing progress or jobs. */
export async function goBackInOnboarding(
  clientSlug: string,
  orgSlug: string,
  previousStep: string,
): Promise<{ ok: true; data: OnboardingStatus } | { ok: false; error: string }> {
  return patchOnboardingStatus(clientSlug, orgSlug, { current_step: previousStep });
}

export async function patchOnboardingStatus(
  clientSlug: string,
  orgSlug: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: OnboardingStatus } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/onboarding/status`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as OnboardingStatus & { detail?: unknown };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true, data: json as OnboardingStatus };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function startOnboardingPipeline(
  clientSlug: string,
  orgSlug: string,
  opts?: { broaden?: boolean },
): Promise<{ ok: true; job_id: string } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/onboarding/pipeline/start`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ broaden: Boolean(opts?.broaden) }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as { job_id?: string; detail?: unknown };
    if (!res.ok || !json.job_id) {
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true, job_id: json.job_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

/** Best-effort: kicks off a quick IG read to draft quiz/source answers ahead of those steps. */
export async function startOnboardingIgPrefill(
  clientSlug: string,
  orgSlug: string,
): Promise<{ ok: true; job_id: string } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/onboarding/ig-prefill/start`,
      { method: "POST", headers },
    );
    const json = (await res.json().catch(() => ({}))) as { job_id?: string; detail?: unknown };
    if (!res.ok || !json.job_id) {
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true, job_id: json.job_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function uploadOnboardingVoice(
  clientSlug: string,
  orgSlug: string,
  blob: Blob,
  audioFormat: string,
  language: "de" | "en" | "auto" = "auto",
): Promise<{ ok: true; job_id: string } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  const form = new FormData();
  form.append("file", blob, `onboarding.${audioFormat}`);
  form.append("audio_format", audioFormat);
  form.append("language", language);
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/onboarding/voice/upload`,
      { method: "POST", headers, body: form },
    );
    const json = (await res.json().catch(() => ({}))) as { job_id?: string; detail?: unknown };
    if (!res.ok || !json.job_id) {
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true, job_id: json.job_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "upload failed" };
  }
}

export async function submitOnboardingVoiceText(
  clientSlug: string,
  orgSlug: string,
  text: string,
): Promise<{ ok: true; job_id: string } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/onboarding/voice/submit-text`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as { job_id?: string; detail?: unknown };
    if (!res.ok || !json.job_id) {
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true, job_id: json.job_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "submit failed" };
  }
}

export async function startOnboardingBrainGenerate(
  clientSlug: string,
  orgSlug: string,
  answers: Record<string, string>,
): Promise<{ ok: true; job_id: string } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/onboarding/voice/generate`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as { job_id?: string; detail?: unknown };
    if (!res.ok || !json.job_id) {
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true, job_id: json.job_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function fetchOnboardingReelCandidates(
  clientSlug: string,
  orgSlug: string,
  opts?: { includeRejected?: boolean },
): Promise<{ ok: true; data: OnboardingReelCandidate[] } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  const qs = opts?.includeRejected ? "?include_rejected=true" : "";
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/onboarding/reel-candidates${qs}`,
      { headers, cache: "no-store" },
    );
    const json = (await res.json().catch(() => [])) as OnboardingReelCandidate[];
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true, data: json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function postOnboardingReelFeedback(
  clientSlug: string,
  orgSlug: string,
  items: { scraped_reel_id: string; verdict: "yes" | "no"; reason?: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/onboarding/reel-feedback`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      },
    );
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { detail?: unknown };
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function startOnboardingFirstContent(
  clientSlug: string,
  orgSlug: string,
  scraped_reel_id: string,
  format_key?: string,
): Promise<
  | { ok: true; session: { id: string }; reel_id: string }
  | { ok: false; error: string }
> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/onboarding/first-content/start`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ scraped_reel_id, format_key }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      session?: { id: string };
      reel_id?: string;
      detail?: unknown;
    };
    if (!res.ok || !json.session?.id) {
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true, session: json.session, reel_id: json.reel_id ?? scraped_reel_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function generateOnboardingActionPlan(
  clientSlug: string,
  orgSlug: string,
): Promise<{ ok: true; action_plan: Record<string, unknown> } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/onboarding/action-plan`,
      { method: "POST", headers },
    );
    const json = (await res.json().catch(() => ({}))) as {
      action_plan?: Record<string, unknown>;
      detail?: unknown;
    };
    if (!res.ok || !json.action_plan) {
      return { ok: false, error: formatFastApiError(json, `Failed (${res.status})`) };
    }
    return { ok: true, action_plan: json.action_plan };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}