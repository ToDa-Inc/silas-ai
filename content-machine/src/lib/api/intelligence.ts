"use client";

import type {
  OwnReelsMetricsResponse,
  OwnReelsMetricsSeries,
  ReelAnalysisDetail,
} from "@/lib/reel-types";
import type { ReelsListSortBy, ScrapedReelRow } from "@/lib/api";
import { getContentApiBase } from "@/lib/env";
import { clientApiHeaders, contentApiFetch } from "./client-context";
import { formatFastApiError } from "./format-error";

export async function fetchReelAnalysisDetail(
  clientSlug: string,
  orgSlug: string,
  reelId: string,
): Promise<{ ok: true; data: ReelAnalysisDetail } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels/${encodeURIComponent(reelId)}/analysis`,
      { headers },
    );
    if (res.status === 404) {
      return { ok: false, error: "No saved analysis for this reel." };
    }
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Request failed (${res.status})`),
      };
    }
    return { ok: true, data: json as ReelAnalysisDetail };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function fetchReelSourcePreview(
  clientSlug: string,
  orgSlug: string,
  url: string,
): Promise<
  | { ok: true; data: ScrapedReelRow }
  | { ok: false; error: string; status: number }
> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  const u = url.trim();
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels/source-preview?url=${encodeURIComponent(u)}`,
      { headers },
    );
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (res.status === 404) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, "Reel not in workspace"),
        status: 404,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Request failed (${res.status})`),
        status: res.status,
      };
    }
    return { ok: true, data: json as ScrapedReelRow };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed", status: 0 };
  }
}

export async function fetchOwnReelsClient(
  clientSlug: string,
  orgSlug: string,
  limit = 24,
): Promise<{ ok: true; data: ScrapedReelRow[] } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  const params = new URLSearchParams({
    own_reels_only: "true",
    include_analysis: "true",
    limit: String(limit),
    sort_by: "posted_at",
    sort_dir: "desc",
  });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels?${params}`,
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

export type ReelsListClientQuery = {
  limit?: number;
  offset?: number;
  sortBy?: ReelsListSortBy;
  sortDir?: "asc" | "desc";
  source?: string;
  outlierOnly?: boolean;
  ownReelsOnly?: boolean;
  favouritesOnly?: boolean;
  postedAfter?: string;
  includeAnalysis?: boolean;
};

export async function fetchReelsListClient(
  clientSlug: string,
  orgSlug: string,
  query: ReelsListClientQuery = {},
): Promise<
  { ok: true; data: ScrapedReelRow[]; total: number } | { ok: false; error: string }
> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  const params = new URLSearchParams();
  params.set("include_analysis", String(query.includeAnalysis ?? true));
  params.set("limit", String(query.limit ?? 48));
  if (query.offset && query.offset > 0) params.set("offset", String(query.offset));
  if (query.sortBy) params.set("sort_by", query.sortBy);
  if (query.sortDir) params.set("sort_dir", query.sortDir);
  if (query.outlierOnly) params.set("outlier_only", "true");
  if (query.ownReelsOnly) params.set("own_reels_only", "true");
  if (query.source) params.set("source", query.source);
  if (query.favouritesOnly) params.set("bookmarked_only", "true");
  if (query.postedAfter) params.set("posted_after", query.postedAfter);
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels?${params}`,
      { headers },
    );
    const json = (await res.json().catch(() => [])) as unknown;
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Request failed (${res.status})`),
      };
    }
    const data = Array.isArray(json) ? (json as ScrapedReelRow[]) : [];
    const totalHeader = res.headers.get("x-total-count");
    const total = totalHeader != null ? Number.parseInt(totalHeader, 10) : data.length;
    return { ok: true, data, total: Number.isFinite(total) ? total : data.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export type ActiveReelAnalysisJobResponse =
  | { active: false }
  | {
      active: true;
      job_id: string;
      job_type: string;
      status: string | null;
      started_at: string | null;
    };

export async function fetchActiveReelAnalysisJob(
  clientSlug: string,
  orgSlug: string,
): Promise<
  { ok: true; data: ActiveReelAnalysisJobResponse } | { ok: false; error: string }
> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels/active-analysis`,
      { headers },
    );
    const json = (await res.json().catch(() => ({}))) as ActiveReelAnalysisJobResponse & {
      detail?: unknown;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Request failed (${res.status})`),
      };
    }
    return { ok: true, data: json as ActiveReelAnalysisJobResponse };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function fetchOwnReelsMetrics(
  clientSlug: string,
  orgSlug: string,
  opts?: {
    from?: string;
    to?: string;
    reelIds?: string[];
    limit?: number;
    offset?: number;
    postedAfter?: string;
    postedBefore?: string;
  },
): Promise<
  { ok: true; data: OwnReelsMetricsResponse } | { ok: false; error: string }
> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  const sp = new URLSearchParams();
  if (opts?.from) sp.set("from", opts.from);
  if (opts?.to) sp.set("to", opts.to);
  if (opts?.reelIds?.length) sp.set("reel_ids", opts.reelIds.join(","));
  if (opts?.limit != null) sp.set("limit", String(opts.limit));
  if (opts?.offset != null && opts.offset > 0) sp.set("offset", String(opts.offset));
  if (opts?.postedAfter) sp.set("posted_after", opts.postedAfter);
  if (opts?.postedBefore) sp.set("posted_before", opts.postedBefore);
  const q = sp.toString();
  const url = `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels/metrics${q ? `?${q}` : ""}`;
  try {
    const res = await contentApiFetch(url, { headers });
    const json = (await res.json().catch(() => ({}))) as OwnReelsMetricsResponse & {
      detail?: unknown;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Request failed (${res.status})`),
      };
    }
    return {
      ok: true,
      data: {
        reels: json.reels ?? [],
        total: typeof json.total === "number" ? json.total : (json.reels ?? []).length,
        limit: typeof json.limit === "number" ? json.limit : (json.reels ?? []).length,
        offset: typeof json.offset === "number" ? json.offset : 0,
        has_more: Boolean(json.has_more),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function fetchReelMetricsSeries(
  clientSlug: string,
  orgSlug: string,
  reelId: string,
  opts?: { from?: string; to?: string },
): Promise<{ ok: true; data: OwnReelsMetricsSeries } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  const sp = new URLSearchParams();
  if (opts?.from) sp.set("from", opts.from);
  if (opts?.to) sp.set("to", opts.to);
  const q = sp.toString();
  const url = `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels/${encodeURIComponent(reelId)}/metrics${q ? `?${q}` : ""}`;
  try {
    const res = await contentApiFetch(url, { headers });
    const json = (await res.json().catch(() => ({}))) as OwnReelsMetricsSeries & {
      detail?: unknown;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Request failed (${res.status})`),
      };
    }
    return {
      ok: true,
      data: {
        reel_id: String(json.reel_id ?? reelId),
        post_url: json.post_url ?? null,
        thumbnail_url: json.thumbnail_url ?? null,
        hook_text: json.hook_text ?? null,
        points: Array.isArray(json.points) ? json.points : [],
        competitor_id: json.competitor_id ?? null,
        latest_snapshot_at: json.latest_snapshot_at ?? null,
        snapshot_count: typeof json.snapshot_count === "number" ? json.snapshot_count : 0,
        views_delta_24h: json.views_delta_24h ?? null,
        views_delta_7d: json.views_delta_7d ?? null,
        likes_delta_24h: json.likes_delta_24h ?? null,
        likes_delta_7d: json.likes_delta_7d ?? null,
        comments_delta_24h: json.comments_delta_24h ?? null,
        comments_delta_7d: json.comments_delta_7d ?? null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function enqueueReelAnalyzeBulk(
  clientSlug: string,
  orgSlug: string,
  urls: string[],
  opts?: { skip_apify?: boolean },
): Promise<{ ok: true; job_id: string; count: number } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const body: { urls: string[]; skip_apify?: boolean } = { urls };
    if (opts?.skip_apify) body.skip_apify = true;
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels/analyze-bulk`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      job_id?: string;
      count?: number;
      detail?: unknown;
    };
    if (!res.ok) {
      return { ok: false, error: formatFastApiError(json, `Request failed (${res.status})`) };
    }
    const jobId = json.job_id;
    if (!jobId) {
      return { ok: false, error: "No job_id returned from server." };
    }
    return { ok: true, job_id: jobId, count: json.count ?? urls.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function deleteScrapedReel(
  clientSlug: string,
  orgSlug: string,
  reelId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels/${encodeURIComponent(reelId)}`,
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

export async function deleteScrapedReelsBulk(
  clientSlug: string,
  orgSlug: string,
  reelIds: string[],
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels/delete-bulk`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reel_ids: reelIds }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      deleted?: number;
      detail?: unknown;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`),
      };
    }
    return { ok: true, deleted: typeof json.deleted === "number" ? json.deleted : reelIds.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export async function patchScrapedReelBookmark(
  clientSlug: string,
  orgSlug: string,
  reelId: string,
  isBookmarked: boolean,
): Promise<{ ok: true; data: ScrapedReelRow } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reels/${encodeURIComponent(reelId)}`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ is_bookmarked: isBookmarked }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as ScrapedReelRow & { detail?: unknown };
    if (!res.ok) {
      return {
        ok: false,
        error: formatFastApiError(json as Record<string, unknown>, `Failed (${res.status})`),
      };
    }
    return { ok: true, data: json as ScrapedReelRow };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

export type ReelAnalysisListRow = {
  id: string;
  post_url: string;
  owner_username?: string | null;
  total_score?: number | null;
  replicability_rating?: string | null;
};

export async function fetchReelAnalysesList(
  clientSlug: string,
  orgSlug: string,
  limit = 50,
): Promise<{ ok: true; data: ReelAnalysisListRow[] } | { ok: false; error: string }> {
  const base = getContentApiBase();
  const headers = await clientApiHeaders({ orgSlug });
  try {
    const res = await contentApiFetch(
      `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/reel-analyses?limit=${limit}`,
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
    return { ok: true, data: Array.isArray(json) ? (json as ReelAnalysisListRow[]) : [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}
