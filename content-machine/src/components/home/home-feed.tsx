"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HomeSummaryRow, IntelligenceStatsRow, ScrapedReelRow } from "@/lib/api";
import {
  createTodayPostClient,
  fetchDashboardTodayPicksClient,
  fetchHomeSummaryClient,
  generationListSessions,
  generationStart,
  type GenerationSession,
} from "@/lib/api-client";
import {
  buildOpportunityPool,
  canonicalPostUrl,
  findSessionForReel,
  resolveHeroState,
  type DailyPostMeta,
  type HeroResolved,
} from "@/lib/home-opportunities";
import { useHomeCopy } from "@/lib/home-ui";
import { AgentTeamDrawers } from "./agent-team-drawers";
import { AgentTeamRow, type AgentId } from "./agent-team-row";
import { FreshForYouRow } from "./fresh-for-you-row";
import { HeroCard } from "./hero-card";
import { MakePostFab, type OpportunityCardState } from "./opportunity-card";
import { MomentumLine } from "./momentum-line";
import { StudioOverlay } from "./studio-overlay";

type ReelDraftMeta = {
  state: OpportunityCardState;
  sessionId: string | null;
};

type Props = {
  initialSummary: HomeSummaryRow;
  freshReels: ScrapedReelRow[];
  winReels: ScrapedReelRow[];
  adaptReels: ScrapedReelRow[];
  picksComputedAt?: string | null;
  picksIsFallback?: boolean;
  dailySessionId?: string | null;
  dailyDraftStatus?: string | null;
  primaryReelId?: string | null;
  clientSlug: string;
  orgSlug: string;
  disabled?: boolean;
  stats: IntelligenceStatsRow | null;
  focusReelId?: string;
};

function dailyMetaFrom(
  summary: HomeSummaryRow,
  overrides?: Partial<DailyPostMeta>,
): DailyPostMeta {
  const dp = summary.daily_post;
  return {
    sessionId:
      overrides?.sessionId ??
      dp?.daily_session_id ??
      null,
    status: overrides?.status ?? dp?.draft_status ?? null,
    primaryReelId:
      overrides?.primaryReelId ??
      dp?.primary_reel_id ??
      summary.scout.top_opportunity_reel_id,
  };
}

export function HomeFeed({
  initialSummary,
  freshReels,
  winReels,
  adaptReels,
  picksComputedAt = null,
  picksIsFallback = false,
  dailySessionId = null,
  dailyDraftStatus = null,
  primaryReelId = null,
  clientSlug,
  orgSlug,
  disabled,
  stats,
  focusReelId,
}: Props) {
  const copy = useHomeCopy();
  const pool = useMemo(
    () => buildOpportunityPool(freshReels, winReels, adaptReels),
    [freshReels, winReels, adaptReels],
  );

  const [summary, setSummary] = useState(initialSummary);
  const [dailyPost, setDailyPost] = useState<DailyPostMeta>(() =>
    dailyMetaFrom(initialSummary, {
      sessionId: dailySessionId,
      status: dailyDraftStatus,
      primaryReelId,
    }),
  );
  const [sessions, setSessions] = useState<GenerationSession[]>([]);
  const [heroReel, setHeroReel] = useState<ScrapedReelRow | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [activeAgent, setActiveAgent] = useState<AgentId | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioSessionId, setStudioSessionId] = useState<string | null>(null);
  const [studioPreparing, setStudioPreparing] = useState(false);
  const [heroBusy, setHeroBusy] = useState(false);
  const [draftByReelId, setDraftByReelId] = useState<Record<string, ReelDraftMeta>>({});

  const inFlightUrls = useRef(new Set<string>());
  const draftByReelIdRef = useRef(draftByReelId);
  draftByReelIdRef.current = draftByReelId;

  const displayPool = useMemo(() => {
    if (pool.length === 0) return pool;
    const start = heroIndex % pool.length;
    return [...pool.slice(start), ...pool.slice(0, start)];
  }, [pool, heroIndex]);

  const effectiveDailyPost = useMemo((): DailyPostMeta => {
    const base = dailyPost;
    if (!base.sessionId) return base;
    const live = sessions.find((s) => s.id === base.sessionId);
    if (live?.status === "content_ready" && base.status !== "ready") {
      return { ...base, status: "ready" };
    }
    return base;
  }, [dailyPost, sessions]);

  const hero: HeroResolved = useMemo(() => {
    const latestId =
      effectiveDailyPost.sessionId && effectiveDailyPost.status === "ready"
        ? effectiveDailyPost.sessionId
        : summary.writer.latest_draft_session_id ||
          sessions.find((s) => s.status === "content_ready")?.id ||
          null;
    const latestSession = latestId ? sessions.find((s) => s.id === latestId) : null;
    const dailySession = effectiveDailyPost.sessionId
      ? sessions.find((s) => s.id === effectiveDailyPost.sessionId)
      : null;
    const exportInfo = summary.writer.last_export;
    return resolveHeroState(displayPool, {
      latestDraftSessionId: latestId,
      draftHook:
        exportInfo?.hook_text ||
        (dailySession?.hooks?.[0] && typeof dailySession.hooks[0] === "object"
          ? String((dailySession.hooks[0] as { text?: string }).text ?? "")
          : null) ||
        (latestSession?.hooks?.[0] && typeof latestSession.hooks[0] === "object"
          ? String((latestSession.hooks[0] as { text?: string }).text ?? "")
          : null),
      draftThumb:
        exportInfo?.thumbnail_url ||
        dailySession?.thumbnail_url ||
        dailySession?.rendered_video_url ||
        latestSession?.thumbnail_url ||
        latestSession?.rendered_video_url ||
        null,
      topOpportunityReelId: summary.scout.top_opportunity_reel_id,
      dailyPost: effectiveDailyPost,
      isBuilding: summary.state.is_building,
      phase: summary.state.phase,
      setupComplete: summary.state.setup_complete,
    });
  }, [displayPool, summary, sessions, effectiveDailyPost]);

  useEffect(() => {
    if (hero.kind === "next_post" || hero.kind === "draft_preparing") {
      setHeroReel(hero.reel);
    }
  }, [hero]);

  useEffect(() => {
    if (dailyPost.status === "ready" && dailyPost.sessionId && dailyPost.primaryReelId) {
      setDraftByReelId((prev) => ({
        ...prev,
        [dailyPost.primaryReelId!]: { state: "ready", sessionId: dailyPost.sessionId },
      }));
    }
  }, [dailyPost]);

  const setReelState = useCallback((reelId: string, patch: Partial<ReelDraftMeta>) => {
    setDraftByReelId((prev) => ({
      ...prev,
      [reelId]: {
        state: patch.state ?? prev[reelId]?.state ?? "idle",
        sessionId:
          patch.sessionId !== undefined ? patch.sessionId : (prev[reelId]?.sessionId ?? null),
      },
    }));
  }, []);

  const refreshSummary = useCallback(async () => {
    if (!clientSlug || !orgSlug) return;
    const res = await fetchHomeSummaryClient(clientSlug, orgSlug);
    if (res.ok) {
      setSummary(res.data);
      setDailyPost(dailyMetaFrom(res.data));
    }
  }, [clientSlug, orgSlug]);

  useEffect(() => {
    if (!dailyPost.sessionId) return;
    const live = sessions.find((s) => s.id === dailyPost.sessionId);
    if (live?.status === "content_ready" && dailyPost.status !== "ready") {
      setDailyPost((prev) => ({ ...prev, status: "ready" }));
      void refreshSummary();
    }
  }, [sessions, dailyPost.sessionId, dailyPost.status, refreshSummary]);

  useEffect(() => {
    if (!clientSlug || !orgSlug) return;
    const loadSessions = () => {
      void generationListSessions(clientSlug, orgSlug, 40).then((res) => {
        if (res.ok) setSessions(res.data);
      });
    };
    loadSessions();

    const needsPoll =
      dailyPost.status === "pending" ||
      Boolean(dailyPost.sessionId) ||
      studioPreparing ||
      studioOpen;

    if (!needsPoll) return;
    const id = window.setInterval(loadSessions, 2000);
    return () => window.clearInterval(id);
  }, [
    clientSlug,
    orgSlug,
    dailyPost.status,
    dailyPost.sessionId,
    studioPreparing,
    studioOpen,
  ]);

  useEffect(() => {
    if (!studioSessionId) return;
    const live = sessions.find((s) => s.id === studioSessionId);
    if (live?.status !== "content_ready") return;
    setDraftByReelId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [reelId, meta] of Object.entries(next)) {
        if (meta.sessionId === studioSessionId && meta.state !== "ready") {
          next[reelId] = { ...meta, state: "ready" };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [sessions, studioSessionId]);

  useEffect(() => {
    if (!summary.state.is_building) return;
    const id = window.setInterval(() => void refreshSummary(), 8000);
    return () => window.clearInterval(id);
  }, [summary.state.is_building, refreshSummary]);

  useEffect(() => {
    if (dailyPost.status !== "pending" || !clientSlug || !orgSlug) return;
    const tick = () => {
      void (async () => {
        const res = await fetchDashboardTodayPicksClient(clientSlug, orgSlug);
        if (!res.ok || !res.data) return;
        const st = res.data.draft_status;
        setDailyPost({
          sessionId: res.data.daily_session_id,
          status: st,
          primaryReelId: res.data.primary_reel_id ?? dailyPost.primaryReelId,
        });
        if (st === "ready" || st === "failed") {
          void refreshSummary();
          if (st === "ready") {
            void generationListSessions(clientSlug, orgSlug, 40).then((lr) => {
              if (lr.ok) setSessions(lr.data);
            });
          }
        }
      })();
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, [dailyPost.status, dailyPost.primaryReelId, clientSlug, orgSlug, refreshSummary]);

  const openSession = useCallback((sessionId: string) => {
    setStudioOpen(true);
    setStudioPreparing(false);
    setStudioSessionId(sessionId);
    setActiveAgent(null);
  }, []);

  const closeStudio = useCallback(() => {
    setStudioOpen(false);
    setStudioPreparing(false);
    setStudioSessionId(null);
    void refreshSummary();
  }, [refreshSummary]);

  const draftFromUrl = useCallback(
    async (reel: ScrapedReelRow): Promise<string | null> => {
      const url = reel.post_url?.trim();
      if (!url || !clientSlug || !orgSlug) return null;
      const canon = canonicalPostUrl(url);
      if (inFlightUrls.current.has(canon)) return null;

      const reelId = reel.id;
      const known = draftByReelIdRef.current[reelId]?.sessionId;
      if (known) {
        setReelState(reelId, { state: "ready", sessionId: known });
        return known;
      }

      const existing = findSessionForReel(sessions, reel);
      if (existing?.id) {
        const ready = existing.status === "content_ready";
        setReelState(reelId, {
          state: ready ? "ready" : "preparing",
          sessionId: existing.id,
        });
        setSessions((prev) => [existing, ...prev.filter((s) => s.id !== existing.id)]);
        return existing.id;
      }

      inFlightUrls.current.add(canon);
      setReelState(reelId, { state: "opening", sessionId: null });

      const startRes = await generationStart(clientSlug, orgSlug, {
        source_type: "url_adapt",
        url,
        recreate_mode: "one_to_one",
      });

      inFlightUrls.current.delete(canon);
      if (!startRes.ok) {
        setReelState(reelId, { state: "idle", sessionId: null });
        return null;
      }

      const ready = startRes.data.status === "content_ready";
      setReelState(reelId, {
        state: ready ? "ready" : "preparing",
        sessionId: startRes.data.id,
      });
      setSessions((prev) => [startRes.data, ...prev.filter((s) => s.id !== startRes.data.id)]);
      void refreshSummary();
      return startRes.data.id;
    },
    [clientSlug, orgSlug, sessions, setReelState, refreshSummary],
  );

  const createTodayPost = useCallback(async () => {
    if (!clientSlug || !orgSlug) return null;
    const res = await createTodayPostClient(clientSlug, orgSlug);
    if (!res.ok || !res.data) return null;
    setDailyPost({
      sessionId: res.data.daily_session_id,
      status: res.data.draft_status,
      primaryReelId: res.data.primary_reel_id,
    });
    void refreshSummary();
    return res.data.daily_session_id;
  }, [clientSlug, orgSlug, refreshSummary]);

  const waitForDailySession = useCallback(
    async (opts?: { openEarly?: boolean }): Promise<string | null> => {
      if (!clientSlug || !orgSlug) return null;
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        const res = await fetchDashboardTodayPicksClient(clientSlug, orgSlug);
        if (res.ok && res.data) {
          const st = res.data.draft_status;
          const sid = res.data.daily_session_id;
          setDailyPost({
            sessionId: sid,
            status: st,
            primaryReelId: res.data.primary_reel_id ?? dailyPost.primaryReelId,
          });
          if (sid && opts?.openEarly) {
            openSession(sid);
            return sid;
          }
          if (st === "ready" && sid) {
            void generationListSessions(clientSlug, orgSlug, 40).then((lr) => {
              if (lr.ok) setSessions(lr.data);
            });
            void refreshSummary();
            return sid;
          }
          if (st === "failed") return null;
        }
        await new Promise((r) => window.setTimeout(r, 1500));
      }
      return null;
    },
    [clientSlug, orgSlug, dailyPost.primaryReelId, openSession, refreshSummary],
  );

  const useHero = useCallback(async () => {
    if (hero.kind === "draft_ready") {
      openSession(hero.sessionId);
      return;
    }
    if (hero.kind === "draft_preparing" || hero.kind === "next_post") {
      setHeroBusy(true);
      setStudioOpen(true);
      setStudioPreparing(true);
      setStudioSessionId(null);
      try {
        if (dailyPost.sessionId) {
          openSession(dailyPost.sessionId);
          return;
        }
        await createTodayPost();
        const sid = await waitForDailySession({ openEarly: true });
        if (sid) return;
        const reel = heroReel ?? hero.reel;
        const fallbackSid = await draftFromUrl(reel);
        if (fallbackSid) openSession(fallbackSid);
        else closeStudio();
      } finally {
        setHeroBusy(false);
      }
      return;
    }
  }, [
    hero,
    heroReel,
    dailyPost.sessionId,
    createTodayPost,
    waitForDailySession,
    draftFromUrl,
    openSession,
    closeStudio,
  ]);

  const useReel = useCallback(
    async (reel: ScrapedReelRow) => {
      if (dailyPost.sessionId && dailyPost.status === "ready" && reel.id === dailyPost.primaryReelId) {
        openSession(dailyPost.sessionId);
        return;
      }
      const meta = draftByReelIdRef.current[reel.id];
      if (meta?.sessionId && meta.state === "ready") {
        openSession(meta.sessionId);
        return;
      }

      setStudioOpen(true);
      setStudioPreparing(true);
      setStudioSessionId(null);
      setActiveAgent(null);

      const sid = await draftFromUrl(reel);
      if (sid) {
        openSession(sid);
        return;
      }
      closeStudio();
    },
    [dailyPost, draftFromUrl, openSession, closeStudio],
  );

  const freshSlice = useMemo(() => {
    const strict = [...freshReels, ...winReels];
    const seen = new Set<string>();
    const out: ScrapedReelRow[] = [];
    for (const r of strict) {
      if (!r.id || seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out.length > 0 ? out : pool.slice(0, 4);
  }, [freshReels, winReels, pool]);

  const heroTitle =
    hero.kind === "draft_ready"
      ? copy.heroDraftReadyTitle
      : hero.kind === "draft_preparing"
        ? copy.heroDraftPreparingTitle
        : hero.kind === "building"
          ? copy.heroBuildingTitle
          : hero.kind === "start"
            ? copy.heroStartTitle
            : copy.heroNextPostTitle;

  return (
    <>
      <header className="mb-6 space-y-1">
        <p className="text-xs font-medium text-zinc-500">{copy.greeting}</p>
        <h1 className="text-xl font-semibold tracking-tight text-app-fg">{heroTitle}</h1>
      </header>

      <HeroCard
        hero={hero}
        pool={displayPool}
        disabled={disabled}
        busy={heroBusy}
        onUseThis={() => void useHero()}
        onShowAnother={(reel) => {
          const idx = pool.findIndex((r) => r.id === reel.id);
          if (idx >= 0) setHeroIndex(idx);
          setHeroReel(reel);
        }}
        layoutId="hero-card"
      />

      <AgentTeamRow
        summary={summary}
        activeAgent={activeAgent}
        onSelect={(id) => setActiveAgent((cur) => (cur === id ? null : id))}
      />

      <FreshForYouRow
        reels={freshSlice}
        disabled={disabled}
        draftByReelId={draftByReelId}
        computedAt={picksComputedAt}
        isFallback={picksIsFallback}
        onUseReel={(reel) => void useReel(reel)}
      />

      <MomentumLine
        postsMade={summary.momentum.posts_made}
        lastExport={summary.momentum.last_export}
      />

      <MakePostFab />

      <AgentTeamDrawers
        activeAgent={activeAgent}
        onClose={() => setActiveAgent(null)}
        clientSlug={clientSlug}
        orgSlug={orgSlug}
        summary={summary}
        sessions={sessions}
        stats={stats}
        focusReelId={focusReelId}
        onUseReel={(reel) => void useReel(reel)}
        onOpenSession={openSession}
      />

      <StudioOverlay
        open={studioOpen}
        preparing={studioPreparing}
        sessionId={studioSessionId}
        clientSlug={clientSlug}
        orgSlug={orgSlug}
        onClose={closeStudio}
      />
    </>
  );
}
