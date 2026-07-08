"use client";

import type { ScrapedReelRow } from "@/lib/api";
import { getContentApiBase } from "@/lib/env";
import { clientApiHeaders, contentApiFetch } from "./client-context";
import { formatFastApiError } from "./format-error";

const DASHBOARD_LANE_LIMIT = 12;

async function fetchDashboardLaneClient(
  path: "fresh-niche" | "competitor-wins",
  clientSlug: string,
  orgSlug: string,
  days: number,
  limit: number,
): Promise<{ ok: true; data: ScrapedReelRow[] } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/dashboard/${path}?days=${days}&limit=${limit}`,
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
    return { ok: true, data: Array.isArray(json) ? (json as ScrapedReelRow[]) : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export function fetchDashboardFreshNicheClient(
  clientSlug: string,
  orgSlug: string,
  days = 3,
  limit = DASHBOARD_LANE_LIMIT,
) {
  return fetchDashboardLaneClient("fresh-niche", clientSlug, orgSlug, days, limit);
}

export function fetchDashboardCompetitorWinsClient(
  clientSlug: string,
  orgSlug: string,
  days = 3,
  limit = DASHBOARD_LANE_LIMIT,
) {
  return fetchDashboardLaneClient("competitor-wins", clientSlug, orgSlug, days, limit);
}

export type HomeSummaryExport = {
  session_id: string;
  thumbnail_url: string | null;
  hook_text: string | null;
};

export type HomeSummaryRow = {
  scout: {
    watching_accounts: number;
    new_this_week: number;
    top_opportunity_reel_id: string | null;
    working: boolean;
  };
  writer: {
    drafts_ready: number;
    in_progress: number;
    latest_draft_session_id: string | null;
    last_export: HomeSummaryExport | null;
    working: boolean;
  };
  analyst: {
    reels_studied: number;
    avg_views: number | null;
    outliers: number;
    trend_pct: number | null;
    working: boolean;
  };
  state: {
    phase: string;
    setup_complete: boolean;
    onboarding_step: string;
    is_building: boolean;
  };
  momentum: {
    posts_made: number;
    last_export: HomeSummaryExport | null;
  };
};

export async function fetchHomeSummaryClient(
  clientSlug: string,
  orgSlug: string,
): Promise<{ ok: true; data: HomeSummaryRow } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/home/summary`,
      { headers },
    );
    const json = (await res.json().catch(() => ({}))) as HomeSummaryRow & { detail?: unknown };
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`),
      };
    }
    return { ok: true, data: json as HomeSummaryRow };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function fetchAdaptPreviewReels(
  clientSlug: string,
  orgSlug: string,
  limit: number = 15,
): Promise<{ ok: true; data: ScrapedReelRow[] } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels/adapt-preview?limit=${limit}`,
      { headers },
    );
    const json = (await res.json().catch(() => [])) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Request failed (${res.status})`),
      };
    }
    return { ok: true, data: Array.isArray(json) ? (json as ScrapedReelRow[]) : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function fetchReplicateSuggestions(
  clientSlug: string,
  orgSlug: string,
  hours: number = 24,
  limit: number = 8,
): Promise<{ ok: true; data: ScrapedReelRow[] } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels/replicate-suggestions?hours=${hours}&limit=${limit}`,
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
    return { ok: true, data: Array.isArray(json) ? (json as ScrapedReelRow[]) : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}
