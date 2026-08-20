"use client";

import type { LucideIcon } from "lucide-react";
import { BarChart3, PenLine, Search } from "lucide-react";
import { motion } from "framer-motion";
import type { HomeSummaryRow } from "@/lib/api";
import { formatCompactViews, useHomeCopy } from "@/lib/home-ui";
import { useTranslations } from "next-intl";
import { useCountUp } from "@/lib/use-count-up";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { cn } from "@/lib/cn";

export type AgentId = "scout" | "writer" | "analyst";

type Props = {
  summary: HomeSummaryRow;
  activeAgent: AgentId | null;
  onSelect: (id: AgentId) => void;
};

type AgentConfig = {
  id: AgentId;
  name: string;
  role: string;
  icon: LucideIcon;
  iconBg: string;
};

export function AgentTeamRow({ summary, activeAgent, onSelect }: Props) {
  const copy = useHomeCopy();
  const t = useTranslations("dashboard");
  const reducedMotion = usePrefersReducedMotion();

  const agents: AgentConfig[] = [
    {
      id: "scout",
      name: copy.scoutName,
      role: copy.scoutRole,
      icon: Search,
      iconBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    },
    {
      id: "writer",
      name: copy.writerName,
      role: copy.writerRole,
      icon: PenLine,
      iconBg: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    },
    {
      id: "analyst",
      name: copy.analystName,
      role: copy.analystRole,
      icon: BarChart3,
      iconBg: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    },
  ];

  function agentStatLine(id: AgentId): string {
    const { scout, writer, analyst } = summary;
    if (id === "scout") {
      if (scout.working) return copy.scoutWorking;
      if (scout.watching_accounts === 0) return t("settingUpWatchlist");
      return t("watchingAccounts", { count: scout.watching_accounts, new: scout.new_this_week });
    }
    if (id === "writer") {
      if (writer.working) return copy.writerWorking;
      if (writer.drafts_ready === 0 && writer.in_progress === 0) return t("readyWhenYouAre");
      const parts: string[] = [];
      if (writer.drafts_ready > 0) {
        parts.push(t("draftsReady", { count: writer.drafts_ready }));
      }
      if (writer.in_progress > 0) {
        parts.push(t("inProgress", { count: writer.in_progress }));
      }
      return parts.join(" · ");
    }
    if (analyst.working) return copy.analystWorking;
    if (analyst.reels_studied === 0) return t("waitingForReels");
    const avg = formatCompactViews(analyst.avg_views);
    return t("studiedReels", { count: analyst.reels_studied, views: avg });
  }

  return (
    <section aria-label={t("agentTeam")} className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {t("yourTeam")}
        </p>
        <p className="text-[11px] text-zinc-400">{copy.teamLive}</p>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
        {agents.map((agent, i) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            stat={agentStatLine(agent.id)}
            highlight={agentNumericHighlight(agent.id, summary)}
            working={
              agent.id === "scout"
                ? summary.scout.working
                : agent.id === "writer"
                  ? summary.writer.working
                  : summary.analyst.working
            }
            active={activeAgent === agent.id}
            floatDelay={i * 0.4}
            reducedMotion={reducedMotion}
            tapToSee={copy.tapToSee}
            onSelect={() => onSelect(agent.id)}
          />
        ))}
      </div>
    </section>
  );
}

function agentNumericHighlight(id: AgentId, summary: HomeSummaryRow): number {
  if (id === "scout") return summary.scout.new_this_week;
  if (id === "writer") return summary.writer.drafts_ready;
  return summary.analyst.reels_studied;
}

function AgentCard({
  agent,
  stat,
  highlight,
  working,
  active,
  floatDelay,
  reducedMotion,
  tapToSee,
  onSelect,
}: {
  agent: AgentConfig;
  stat: string;
  highlight: number;
  working: boolean;
  active: boolean;
  floatDelay: number;
  reducedMotion: boolean;
  tapToSee: string;
  onSelect: () => void;
}) {
  const Icon = agent.icon;
  const count = useCountUp(highlight, 600, !reducedMotion);

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "min-w-[200px] snap-start rounded-2xl border p-4 text-left transition md:min-w-0",
        active
          ? "border-amber-400/50 bg-amber-500/[0.06] ring-1 ring-amber-400/25"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm dark:border-white/10 dark:bg-zinc-900/40 dark:hover:border-white/20",
      )}
      whileHover={reducedMotion ? undefined : { scale: 1.03 }}
      whileTap={reducedMotion ? undefined : { scale: 0.98 }}
      animate={
        reducedMotion || working
          ? undefined
          : { y: [0, -2, 0] }
      }
      transition={
        working
          ? undefined
          : {
              y: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: floatDelay },
            }
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            agent.iconBg,
            working && "ring-2 ring-amber-400/40 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-app-fg">{agent.name}</p>
          <p className="text-[11px] text-zinc-500">{agent.role}</p>
        </div>
        {!working && highlight > 0 ? (
          <span className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {count}
          </span>
        ) : null}
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        {stat}
      </p>
      <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
        {tapToSee}
      </p>
    </motion.button>
  );
}
