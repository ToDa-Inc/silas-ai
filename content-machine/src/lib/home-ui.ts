"use client";

import { useTranslations } from "next-intl";

/** Translated home/dashboard copy (replaces static HOME_COPY). */
export function useHomeCopy() {
  const t = useTranslations("dashboard");

  return {
    greeting: t("greeting"),
    teamLive: t("teamLive"),
    heroDraftReadyTitle: t("heroDraftReadyTitle"),
    heroDraftReadySub: t("heroDraftReadySub"),
    heroDraftPreparingTitle: t("heroDraftPreparingTitle"),
    heroDraftPreparingSub: t("heroDraftPreparingSub"),
    heroNextPostTitle: t("heroNextPostTitle"),
    heroNextPostSub: t("heroNextPostSub"),
    heroBuildingTitle: t("heroBuildingTitle"),
    heroBuildingSteps: [
      t("heroBuildingStep1"),
      t("heroBuildingStep2"),
      t("heroBuildingStep3"),
    ] as const,
    heroStartTitle: t("heroStartTitle"),
    heroStartSub: t("heroStartSub"),
    useThis: t("useThis"),
    createTodayPost: t("createTodayPost"),
    openTodayPost: t("openTodayPost"),
    showAnother: t("showAnother"),
    openingStudio: t("openingStudio"),
    pasteReel: t("pasteReel"),
    finishSetup: t("finishSetup"),
    startNewPost: t("startNewPost"),
    scoutName: t("scoutName"),
    scoutRole: t("scoutRole"),
    writerName: t("writerName"),
    writerRole: t("writerRole"),
    analystName: t("analystName"),
    analystRole: t("analystRole"),
    tapToSee: t("tapToSee"),
    scoutWorking: t("scoutWorking"),
    writerWorking: t("writerWorking"),
    analystWorking: t("analystWorking"),
    freshLabel: t("freshLabel"),
    freshPicksUpdated: (time: string) => t("freshPicksUpdated", { time }),
    freshPicksFallback: t("freshPicksFallback"),
    freshThisWeek: t("freshThisWeek"),
    freshTrending: t("freshTrending"),
    momentumPosts: (n: number) => t("momentumPosts", { count: n }),
    momentumNone: t("momentumNone"),
    openStudio: t("openStudio"),
    yourNumbers: t("yourNumbers"),
    makePost: t("makePost"),
    scoutDrawerTitle: t("scoutDrawerTitle"),
    scoutSliceFresh: t("scoutSliceFresh"),
    scoutSliceCompetitors: t("scoutSliceCompetitors"),
    scoutSliceBreakouts: t("scoutSliceBreakouts"),
    scoutSliceSaved: t("scoutSliceSaved"),
    scoutSortPosted: t("scoutSortPosted"),
    scoutSortViews: t("scoutSortViews"),
    scoutSortOutlier: t("scoutSortOutlier"),
    scoutSearchPlaceholder: t("scoutSearchPlaceholder"),
    scoutViewCards: t("scoutViewCards"),
    scoutViewRows: t("scoutViewRows"),
    scoutShowing: (shown: number, total: number) =>
      total > 0 ? t("scoutShowing", { shown, total }) : t("scoutShowingEmpty"),
    scoutOpenCatalog: t("scoutOpenCatalog"),
    scoutEmpty: t("scoutEmpty"),
    writerDrawerTitle: t("writerDrawerTitle"),
    analystDrawerTitle: t("analystDrawerTitle"),
    expandForMore: t("expandForMore"),
    collapsePanel: t("collapsePanel"),
    expandStudio: t("expandStudio"),
    collapseStudio: t("collapseStudio"),
    openFullEditor: t("openFullEditor"),
    preparing: t("preparing"),
    draftReady: t("draftReady"),
    reviewDraft: t("reviewDraft"),
    makeThisPost: t("makeThisPost"),
  };
}

export function formatCompactViews(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(v);
}
