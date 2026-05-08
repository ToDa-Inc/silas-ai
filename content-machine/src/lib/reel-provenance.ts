/**
 * Central UX model for scraped reels: where they came from, why they surface, and what to do next.
 * Mirrors backend `services/reel_provenance.py` when API sends `provenance`; otherwise computed client-side.
 */

import type { ApiReelProvenance, ScrapedReelRow } from "@/lib/api";

export type { ApiReelProvenance };

/** Stable key for grouping and analytics (not shown verbatim to users). */
export type ProvenanceKind =
  | "your_reel"
  | "tracked_competitor"
  | "found_in_niche"
  | "saved_manual"
  | "legacy_niche"
  | "unknown";

export type RecommendedAction =
  | "recreate"
  | "analyze"
  | "add_competitor"
  | "view_history"
  | "open_analysis"
  | "ignore";

export type TrustLevel = "high" | "medium" | "exploratory";

/**
 * Stored `similarity_score` is 0–100 from keyword_similarity jobs; older rows may use 0–1.
 * Returns a whole-number percent 0–100 for display only.
 */
export function normalizeNicheSimilarityToPercent(
  raw: number | null | undefined,
): number | null {
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  const n = Number(raw);
  if (n < 0) return null;
  if (n <= 1) return Math.round(n * 100);
  return Math.round(Math.min(100, n));
}

/** Hover copy for niche fit % on reels discovered for this niche. */
export const NICHE_SIMILARITY_SCORE_TOOLTIP =
  "How well this reel fits your client’s niche and style (0–100). Higher means a closer match.";

export type ReelProvenanceUi = {
  kind: ProvenanceKind;
  sourceLabel: string;
  reason: string;
  trust: TrustLevel;
  trustHint: string;
  primaryAction: RecommendedAction;
  secondaryActions: RecommendedAction[];
};

function pickPrimaryForKind(kind: ProvenanceKind): RecommendedAction {
  switch (kind) {
    case "tracked_competitor":
      return "recreate";
    case "found_in_niche":
    case "legacy_niche":
      return "add_competitor";
    case "your_reel":
      return "analyze";
    case "saved_manual":
      return "open_analysis";
    default:
      return "analyze";
  }
}

function inferKind(row: ScrapedReelRow): ProvenanceKind {
  const src = (row.source ?? "").trim();
  if (src === "url_paste") return "saved_manual";
  if (src === "keyword_similarity") return "found_in_niche";
  if (src === "niche_search") return "legacy_niche";
  if (src === "client_baseline") return "your_reel";
  if (src === "profile") return "tracked_competitor";
  if (row.competitor_id) return "tracked_competitor";
  return "unknown";
}

function inferReason(row: ScrapedReelRow, kind: ProvenanceKind): string {
  if (kind === "saved_manual") {
    return row.analysis ? "Recently analyzed" : "Saved by you";
  }
  if (kind === "found_in_niche" || kind === "legacy_niche") {
    const pct = normalizeNicheSimilarityToPercent(row.similarity_score);
    if (pct != null) {
      return `High niche match (${pct}%)`;
    }
    return "Matches your niche";
  }
  if (kind === "your_reel") {
    if (row.growth_views != null && Number(row.growth_views) > 0) {
      return "Still gaining since last sync";
    }
    return "Your latest reels";
  }
  if (kind === "tracked_competitor") {
    const isBo =
      row.is_outlier === true ||
      row.is_outlier_views ||
      row.is_outlier_likes ||
      row.is_outlier_comments;
    if (isBo || (row.outlier_ratio != null && Number(row.outlier_ratio) >= 1)) {
      return "Fresh competitor breakout";
    }
    return "From a tracked competitor";
  }
  return "Needs review";
}

function inferTrust(kind: ProvenanceKind): { trust: TrustLevel; hint: string } {
  switch (kind) {
    case "tracked_competitor":
      return {
        trust: "high",
        hint: "From a competitor you follow — performance is compared using your latest refreshed data.",
      };
    case "your_reel":
      return {
        trust: "high",
        hint: "From your connected Instagram account.",
      };
    case "saved_manual":
      return {
        trust: "high",
        hint: "You added this link yourself.",
      };
    case "found_in_niche":
      return {
        trust: "exploratory",
        hint: "Found while searching your niche — check the account feels right before you treat it like a competitor.",
      };
    case "legacy_niche":
      return {
        trust: "medium",
        hint: "From an older niche search — worth a quick relevance check.",
      };
    default:
      return {
        trust: "medium",
        hint: "Limited context on this reel.",
      };
  }
}

function labelForKind(kind: ProvenanceKind): string {
  switch (kind) {
    case "your_reel":
      return "Your reel";
    case "tracked_competitor":
      return "Tracked competitor";
    case "found_in_niche":
      return "Found in niche";
    case "saved_manual":
      return "Saved";
    case "legacy_niche":
      return "Found in niche";
    default:
      return "Reel";
  }
}

function secondaryForKind(kind: ProvenanceKind): RecommendedAction[] {
  switch (kind) {
    case "tracked_competitor":
      return ["analyze", "view_history"];
    case "found_in_niche":
    case "legacy_niche":
      return ["analyze", "recreate"];
    case "your_reel":
      return ["view_history", "recreate"];
    case "saved_manual":
      return ["recreate", "analyze"];
    default:
      return ["analyze"];
  }
}

function apiToUi(api: ApiReelProvenance): ReelProvenanceUi {
  return {
    kind: api.kind as ProvenanceKind,
    sourceLabel: api.source_label,
    reason: api.reason,
    trust: api.trust as TrustLevel,
    trustHint: api.trust_hint,
    primaryAction: api.primary_action as RecommendedAction,
    secondaryActions: (api.secondary_actions ?? []) as RecommendedAction[],
  };
}

/**
 * Resolve provenance for any scraped reel row. Prefer API-provided object when present.
 */
export function getReelProvenance(row: ScrapedReelRow): ReelProvenanceUi {
  const api = row.provenance;
  if (api && typeof api === "object") {
    return apiToUi(api);
  }

  const kind = inferKind(row);
  const { trust, hint } = inferTrust(kind);
  const primary = pickPrimaryForKind(kind);

  return {
    kind,
    sourceLabel: labelForKind(kind),
    reason: inferReason(row, kind),
    trust,
    trustHint: hint,
    primaryAction: primary,
    secondaryActions: secondaryForKind(kind),
  };
}

/** Plain-language multiplier for competitor-style ratios (cards, not dense tables). */
export function formatTheirUsualMultiplier(ratio: number | null | undefined, decimals = 1): string | null {
  if (ratio == null || !Number.isFinite(Number(ratio))) return null;
  const n = Number(ratio);
  return `${n.toFixed(decimals)}× their usual`;
}

/** Tooltip: views vs this account’s typical performance. */
export function theirUsualMultiplierTooltip(mode: {
  variant: "lifetime_avg" | "milestone" | "win_ratio" | "trending" | "generic";
  hours?: number;
}): string {
  switch (mode.variant) {
    case "milestone":
      return mode.hours != null
        ? `Views compared with this account’s usual performance about ${mode.hours} hours after posting.`
        : "Views compared with this account’s usual early performance.";
    case "win_ratio":
      return "Views compared with this competitor’s recent average for their posts.";
    case "trending":
      return "Views compared with this account’s usual reach after your last data refresh.";
    case "lifetime_avg":
      return "Views compared with this account’s overall average when we don’t have an early snapshot yet.";
    default:
      return "Views compared with this account’s recent average.";
  }
}

/** Niche similarity badge label (e.g. "92% match") — use {@link NICHE_SIMILARITY_SCORE_TOOLTIP} on hover. */
export function formatNicheMatchPercent(similarityScore: number | null | undefined): string | null {
  const pct = normalizeNicheSimilarityToPercent(similarityScore);
  if (pct == null) return null;
  return `${pct}% match`;
}
