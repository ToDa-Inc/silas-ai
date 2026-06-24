"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HomeSummaryRow, IntelligenceStatsRow, ScrapedReelRow } from "@/lib/api";
import {
  fetchHomeSummaryClient,
  generationChooseAngle,
  generationListSessions,
  generationStart,
  type GenerationSession,
} from "@/lib/api-client";
import {
  buildOpportunityPool,
  canonicalPostUrl,
  resolveHeroState,
  type HeroResolved,
} from "@/lib/home-opportunities";
import { HOME_COPY } from "@/lib/home-ui";
import { AgentTeamDrawers } from "./agent-team-drawers";
import { AgentTeamRow, type AgentId } from "./agent-team-row";
import { FreshForYouRow } from "./fresh-for-you-row";
import { HeroCard } from "./hero-card";
import { MakePostFab, type OpportunityCardState } from "./opportunity-card";
import { MomentumLine } from "./momentum-line";
import { StudioOverlay } from "./studio-overlay";

const AUTO_DRAFT_COUNT = 2;

type ReelDraftMeta = {
  state: OpportunityCardState;
  sessionId: string | null;
};

type Props = {
  initialSummary: HomeSummaryRow;
  freshReels: ScrapedReelRow[];
  winReels: ScrapedReelRow[];
  adaptReels: ScrapedReelRow[];
  clientSlug: string;
  orgSlug: string;
  disabled?: boolean;
  stats: IntelligenceStatsRow | null;
  focusReelId?: string;
};

async function ensureContentReady(
  clientSlug: string,
  orgSlug: string,
  session: GenerationSession,
): Promise<GenerationSession> {
  if (session.status === "content_ready") return session;
  if (session.status === "angles_ready" && session.angles?.length) {
    const res = await generationChooseAngle(clientSlug, orgSlug, session.id, 0);
    if (res.ok) return res.data;
  }
  return session;
}

export function HomeFeed({
  initialSummary,
  freshReels,
  winReels,
  adaptReels,
  clientSlug,
  orgSlug,
  disabled,
  stats,
  focusReelId,
}: Props) {
  const pool = useMemo(
    () => buildOpportunityPool(freshReels, winReels, adaptReels),
    [freshReels, winReels, adaptReels],
  );

  const [summary, setSummary] = useState(initialSummary);
  const [sessions, setSessions] = useState<GenerationSession[]>([]);
  const [heroReel, setHeroReel] = useState<ScrapedReelRow | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [activeAgent, setActiveAgent] = useState<AgentId | null>(null);
  const [studioSessionId, setStudioSessionId] = useState<string | null>(null);
  const [studioLayoutId, setStudioLayoutId] = useState<string | undefined>();
  const [heroBusy, setHeroBusy] = useState(false);
  const [draftByReelId, setDraftByReelId] = useState<Record<string, ReelDraftMeta>>({});

  const autoDraftStarted = useRef(false);
  const inFlightUrls = useRef(new Set<string>());
  const draftByReelIdRef = useRef(draftByReelId);
  draftByReelIdRef.current = draftByReelId;

  const displayPool = useMemo(() => {
    if (pool.length === 0) return pool;
    const start = heroIndex % pool.length;
    return [...pool.slice(start), ...pool.slice(0, start)];
  }, [pool, heroIndex]);

  const hero: HeroResolved = useMemo(() => {
    const latestId =
      summary.writer.latest_draft_session_id ||
      sessions.find((s) => s.status === "content_ready")?.id ||
      null;
    const latestSession = latestId ? sessions.find((s) => s.id === latestId) : null;
    const exportInfo = summary.writer.last_export;
    return resolveHeroState(displayPool, {
      latestDraftSessionId: latestId,
      draftHook:
        exportInfo?.hook_text ||
        (latestSession?.hooks?.[0] && typeof latestSession.hooks[0] === "object"
          ? String((latestSession.hooks[0] as { text?: string }).text ?? "")
          : null),
      draftThumb:
        exportInfo?.thumbnail_url ||
        latestSession?.thumbnail_url ||
        latestSession?.rendered_video_url ||
        null,
      topOpportunityReelId: summary.scout.top_opportunity_reel_id,
      isBuilding: summary.state.is_building,
      phase: summary.state.phase,
      setupComplete: summary.state.setup_complete,
    });
  }, [displayPool, summary, sessions]);

  useEffect(() => {
    if (hero.kind === "next_post") {
      setHeroReel(hero.reel);
    }
  }, [hero]);

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
    if (res.ok) setSummary(res.data);
  }, [clientSlug, orgSlug]);

  useEffect(() => {
    if (!clientSlug || !orgSlug) return;
    void generationListSessions(clientSlug, orgSlug, 40).then((res) => {
      if (res.ok) setSessions(res.data);
    });
  }, [clientSlug, orgSlug]);

  useEffect(() => {
    if (!summary.state.is_building) return;
    const id = window.setInterval(() => void refreshSummary(), 8000);
    return () => window.clearInterval(id);
  }, [summary.state.is_building, refreshSummary]);

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

      inFlightUrls.current.add(canon);
      setReelState(reelId, { state: "opening", sessionId: null });

      const startRes = await generationStart(clientSlug, orgSlug, {
        source_type: "url_adapt",
        url,
        recreate_mode: "one_to_one",
      });

      if (!startRes.ok) {
        inFlightUrls.current.delete(canon);
        setReelState(reelId, { state: "idle", sessionId: null });
        return null;
      }

      const ready = await ensureContentReady(clientSlug, orgSlug, startRes.data);
      inFlightUrls.current.delete(canon);
      setReelState(reelId, { state: ready.status === "content_ready" ? "ready" : "idle", sessionId: ready.id });
      setSessions((prev) => [ready, ...prev.filter((s) => s.id !== ready.id)]);
      void refreshSummary();
      return ready.id;
    },
    [clientSlug, orgSlug, setReelState, refreshSummary],
  );

  useEffect(() => {
    if (!clientSlug || !orgSlug || pool.length === 0) return;
    if (autoDraftStarted.current) return;
    autoDraftStarted.current = true;

    void (async () => {
      const sessionsRes = await generationListSessions(clientSlug, orgSlug, 40);
      const byUrl = new Map<string, GenerationSession>();
      if (sessionsRes.ok) {
        setSessions(sessionsRes.data);
        for (const s of sessionsRes.data) {
          const key = canonicalPostUrl(s.source_url);
          if (key && !byUrl.has(key)) byUrl.set(key, s);
        }
      }

      const initial: Record<string, ReelDraftMeta> = {};
      for (const reel of pool.slice(0, AUTO_DRAFT_COUNT)) {
        const key = canonicalPostUrl(reel.post_url);
        const session = key ? byUrl.get(key) : undefined;
        if (session) {
          initial[reel.id] = {
            state: session.status === "content_ready" ? "ready" : "idle",
            sessionId: session.id,
          };
        } else {
          setReelState(reel.id, { state: "preparing", sessionId: null });
          await draftFromUrl(reel);
        }
      }
      if (Object.keys(initial).length > 0) {
        setDraftByReelId((prev) => ({ ...initial, ...prev }));
      }
    })();
  }, [clientSlug, orgSlug, pool, draftFromUrl, setReelState]);

  const openSession = useCallback((sessionId: string) => {
    setStudioLayoutId("hero-card");
    setStudioSessionId(sessionId);
    setActiveAgent(null);
  }, []);

  const useHero = useCallback(async () => {
    if (hero.kind === "draft_ready") {
      openSession(hero.sessionId);
      return;
    }
    if (hero.kind !== "next_post") return;
    const reel = heroReel ?? hero.reel;
    setHeroBusy(true);
    setStudioLayoutId("hero-card");
    try {
      const meta = draftByReelIdRef.current[reel.id];
      if (meta?.sessionId && meta.state === "ready") {
        setStudioSessionId(meta.sessionId);
        return;
      }
      const sid = await draftFromUrl(reel);
      if (sid) setStudioSessionId(sid);
    } finally {
      setHeroBusy(false);
    }
  }, [hero, heroReel, draftFromUrl, openSession]);

  const useReel = useCallback(
    async (reel: ScrapedReelRow) => {
      setStudioLayoutId(`opp-card-${reel.id}`);
      const meta = draftByReelIdRef.current[reel.id];
      if (meta?.sessionId && meta.state === "ready") {
        setStudioSessionId(meta.sessionId);
        setActiveAgent(null);
        return;
      }
      const sid = await draftFromUrl(reel);
      if (sid) {
        setStudioSessionId(sid);
        setActiveAgent(null);
      }
    },
    [draftFromUrl],
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

  return (
    <>
      <header className="mb-6 space-y-1">
        <p className="text-xs font-medium text-zinc-500">{HOME_COPY.greeting}</p>
        <h1 className="text-xl font-semibold tracking-tight text-app-fg">
          {hero.kind === "draft_ready"
            ? HOME_COPY.heroDraftReadyTitle
            : hero.kind === "building"
              ? HOME_COPY.heroBuildingTitle
              : hero.kind === "start"
                ? HOME_COPY.heroStartTitle
                : HOME_COPY.heroNextPostTitle}
        </h1>
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
        open={Boolean(studioSessionId)}
        sessionId={studioSessionId}
        clientSlug={clientSlug}
        orgSlug={orgSlug}
        layoutId={studioLayoutId}
        onClose={() => {
          setStudioSessionId(null);
          setStudioLayoutId(undefined);
          void refreshSummary();
        }}
      />
    </>
  );
}
