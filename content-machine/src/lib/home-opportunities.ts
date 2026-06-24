import type { ScrapedReelRow } from "@/lib/api";

/** Merge fresh-niche and competitor-win lanes into one de-duped opportunity list. */
export function mergeOpportunities(
  fresh: ScrapedReelRow[],
  wins: ScrapedReelRow[],
  limit = 12,
): ScrapedReelRow[] {
  const seen = new Set<string>();
  const out: ScrapedReelRow[] = [];

  function add(row: ScrapedReelRow) {
    const key = row.id?.trim() || row.post_url?.trim() || "";
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(row);
  }

  const maxLen = Math.max(fresh.length, wins.length);
  for (let i = 0; i < maxLen && out.length < limit; i++) {
    if (i < wins.length) add(wins[i]!);
    if (out.length < limit && i < fresh.length) add(fresh[i]!);
  }

  return out.slice(0, limit);
}

/** Normalize Instagram post URLs for session idempotency checks. */
export function canonicalPostUrl(url: string | null | undefined): string {
  const raw = (url ?? "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname}${path}`;
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
}

export function opportunityTitle(reel: ScrapedReelRow): string {
  const h = (reel.hook_text || reel.caption || "").trim().replace(/\s+/g, " ");
  if (h.length > 72) return `${h.slice(0, 70)}…`;
  if (h.length > 0) return h;
  const user = reel.account_username?.trim() || "creator";
  return `@${user} reel`;
}

export function opportunityWhy(reel: ScrapedReelRow): string {
  const fromApi = reel.provenance?.reason?.trim();
  if (fromApi) return fromApi;
  if (reel.competitor_id) {
    return "This style is outperforming for a creator we track in your niche.";
  }
  if (reel.source === "keyword_similarity") {
    return "Trending in your niche this week — close match to your content.";
  }
  return "A proven format worth adapting to your voice.";
}

/** Merge strict dashboard lanes with broader adapt-preview fallback. */
export function buildOpportunityPool(
  fresh: ScrapedReelRow[],
  wins: ScrapedReelRow[],
  adapt: ScrapedReelRow[],
  limit = 16,
): ScrapedReelRow[] {
  const merged = mergeOpportunities(fresh, wins, limit);
  const seen = new Set(merged.map((r) => r.id));
  for (const row of adapt) {
    if (merged.length >= limit) break;
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

export type HeroKind = "draft_ready" | "next_post" | "building" | "start";

export type HeroResolved =
  | { kind: "draft_ready"; sessionId: string; hookText: string; thumbnailUrl: string | null }
  | { kind: "next_post"; reel: ScrapedReelRow }
  | { kind: "building"; phase: string }
  | { kind: "start" };

export function resolveHeroState(
  pool: ScrapedReelRow[],
  opts: {
    latestDraftSessionId: string | null;
    draftHook?: string | null;
    draftThumb?: string | null;
    topOpportunityReelId: string | null;
    isBuilding: boolean;
    phase: string;
    setupComplete: boolean;
  },
): HeroResolved {
  if (opts.latestDraftSessionId) {
    return {
      kind: "draft_ready",
      sessionId: opts.latestDraftSessionId,
      hookText: opts.draftHook?.trim() || "Your draft is ready to review",
      thumbnailUrl: opts.draftThumb ?? null,
    };
  }
  if (opts.isBuilding && !opts.setupComplete) {
    return { kind: "building", phase: opts.phase || "pipeline" };
  }
  const topId = opts.topOpportunityReelId?.trim();
  let reel: ScrapedReelRow | undefined;
  if (topId) reel = pool.find((r) => r.id === topId);
  if (!reel && pool.length > 0) reel = pool[0];
  if (reel) return { kind: "next_post", reel };
  if (opts.isBuilding) {
    return { kind: "building", phase: opts.phase || "pipeline" };
  }
  return { kind: "start" };
}
