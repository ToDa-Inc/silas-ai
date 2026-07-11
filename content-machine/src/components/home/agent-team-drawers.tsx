"use client";

import Link from "next/link";
import type { ScrapedReelRow, IntelligenceStatsRow, HomeSummaryRow } from "@/lib/api";
import type { GenerationSession } from "@/lib/api-client";
import { DashboardKpiStrip } from "@/app/(dashboard)/dashboard/dashboard-kpi-strip";
import { OwnReelMetricsDashboard } from "@/app/(dashboard)/dashboard/own-reel-metrics-dashboard";
import { SideDrawer, useSideDrawerExpanded } from "./side-drawer";
import { ScoutReelsPanel } from "./scout-reels-panel";
import type { AgentId } from "./agent-team-row";
import { useHomeCopy } from "@/lib/home-ui";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

type DrawersProps = {
  activeAgent: AgentId | null;
  onClose: () => void;
  clientSlug: string;
  orgSlug: string;
  summary: HomeSummaryRow;
  sessions: GenerationSession[];
  stats: IntelligenceStatsRow | null;
  focusReelId?: string;
  onUseReel: (reel: ScrapedReelRow) => void;
  onOpenSession: (sessionId: string) => void;
};

export function AgentTeamDrawers({
  activeAgent,
  onClose,
  clientSlug,
  orgSlug,
  summary,
  sessions,
  stats,
  focusReelId,
  onUseReel,
  onOpenSession,
}: DrawersProps) {
  const copy = useHomeCopy();
  const readySessions = sessions.filter((s) => s.status === "content_ready");
  const inProgress = sessions.filter(
    (s) => s.status === "angles_ready" || s.render_status === "rendering",
  );

  return (
    <>
      <SideDrawer
        open={activeAgent === "scout"}
        title={copy.scoutDrawerTitle}
        onClose={onClose}
      >
        <ScoutDrawerBody
          clientSlug={clientSlug}
          orgSlug={orgSlug}
          summary={summary}
          enabled={activeAgent === "scout"}
          onUseReel={onUseReel}
        />
      </SideDrawer>

      <SideDrawer
        open={activeAgent === "writer"}
        title={copy.writerDrawerTitle}
        onClose={onClose}
      >
        <WriterDrawerBody
          readySessions={readySessions}
          inProgress={inProgress}
          onOpenSession={onOpenSession}
        />
      </SideDrawer>

      <SideDrawer
        open={activeAgent === "analyst"}
        title={copy.analystDrawerTitle}
        onClose={onClose}
        defaultExpanded
      >
        <AnalystDrawerBody
          clientSlug={clientSlug}
          orgSlug={orgSlug}
          summary={summary}
          stats={stats}
          focusReelId={focusReelId}
        />
      </SideDrawer>
    </>
  );
}

function ScoutDrawerBody({
  clientSlug,
  orgSlug,
  summary,
  enabled,
  onUseReel,
}: {
  clientSlug: string;
  orgSlug: string;
  summary: HomeSummaryRow;
  enabled: boolean;
  onUseReel: (reel: ScrapedReelRow) => void;
}) {
  const expanded = useSideDrawerExpanded();

  return (
    <ScoutReelsPanel
      clientSlug={clientSlug}
      orgSlug={orgSlug}
      summary={summary}
      expanded={expanded}
      enabled={enabled}
      onUseReel={onUseReel}
    />
  );
}

function WriterDrawerBody({
  readySessions,
  inProgress,
  onOpenSession,
}: {
  readySessions: GenerationSession[];
  inProgress: GenerationSession[];
  onOpenSession: (sessionId: string) => void;
}) {
  const copy = useHomeCopy();
  const t = useTranslations("dashboard");
  const expanded = useSideDrawerExpanded();

  return (
    <>
      <Link
        href="/generate"
        className="mb-4 flex w-full items-center justify-center rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-amber-400"
      >
        {copy.startNewPost}
      </Link>
      {readySessions.length === 0 && inProgress.length === 0 ? (
        <p className="text-sm text-app-fg-muted">{t("noDraftsYet")}</p>
      ) : (
        <ul
          className={cn(
            "space-y-2",
            expanded && readySessions.length > 1 && "sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0",
          )}
        >
          {readySessions.map((s) => {
            const hook =
              (Array.isArray(s.hooks) && s.hooks[0] && typeof s.hooks[0] === "object"
                ? String((s.hooks[0] as { text?: string }).text ?? "")
                : "") ||
              String(s.caption_body ?? "").slice(0, 80) ||
              copy.draftReady;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onOpenSession(s.id)}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-left transition hover:border-amber-400/40 hover:bg-amber-500/[0.04] dark:border-white/10"
                >
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {copy.draftReady}
                  </p>
                  <p className="mt-1 line-clamp-3 text-sm text-app-fg">{hook}</p>
                </button>
              </li>
            );
          })}
          {inProgress.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-sm text-zinc-500 dark:border-white/10"
            >
              {t("inProgressShort")}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AnalystDrawerBody({
  clientSlug,
  orgSlug,
  summary,
  stats,
  focusReelId,
}: {
  clientSlug: string;
  orgSlug: string;
  summary: HomeSummaryRow;
  stats: IntelligenceStatsRow | null;
  focusReelId?: string;
}) {
  const t = useTranslations("dashboard");

  return (
    <div className="space-y-4">
      <DashboardKpiStrip stats={stats} className="mb-4" />
      {summary.analyst.outliers > 0 ? (
        <p className="text-xs text-app-fg-muted">
          {t("breakoutsSpotted", { count: summary.analyst.outliers })}
        </p>
      ) : null}
      <OwnReelMetricsDashboard
        clientSlug={clientSlug}
        orgSlug={orgSlug}
        focusReelId={focusReelId}
      />
    </div>
  );
}
