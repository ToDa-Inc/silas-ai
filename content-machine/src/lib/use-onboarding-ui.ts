"use client";

import { useTranslations } from "next-intl";
import type { OnboardingChapter, OnboardingChapterId, OnboardingStepKey, PipelinePhaseId } from "./onboarding-ui";

export function useOnboardingChapters(): OnboardingChapter[] {
  const t = useTranslations("onboarding");
  return [
    {
      id: "identity",
      label: t("chapterIdentity"),
      subtitle: t("chapterIdentitySub"),
      steps: ["workspace", "quiz", "source"],
    },
    {
      id: "brain",
      label: t("chapterBrain"),
      subtitle: t("chapterBrainSub"),
      steps: ["strategy_docs", "pipeline"],
    },
    {
      id: "first_win",
      label: t("chapterFirstWin"),
      subtitle: t("chapterFirstWinSub"),
      steps: ["reel_review", "first_content", "editor", "action_plan", "tour"],
    },
  ];
}

export function useStepHeadings(): Record<OnboardingStepKey, { title: string; description: string }> {
  const t = useTranslations("onboarding");
  return {
    workspace: { title: t("stepWorkspaceTitle"), description: t("stepWorkspaceDesc") },
    quiz: { title: t("stepQuizTitle"), description: t("stepQuizDesc") },
    source: { title: t("stepSourceTitle"), description: t("stepSourceDesc") },
    strategy_docs: { title: t("stepStrategyTitle"), description: t("stepStrategyDesc") },
    pipeline: { title: t("stepPipelineTitle"), description: t("stepPipelineDesc") },
    reel_review: { title: t("stepReelReviewTitle"), description: t("stepReelReviewDesc") },
    first_content: { title: t("stepFirstContentTitle"), description: t("stepFirstContentDesc") },
    editor: { title: t("stepEditorTitle"), description: t("stepEditorDesc") },
    action_plan: { title: t("stepActionPlanTitle"), description: t("stepActionPlanDesc") },
    tour: { title: t("stepTourTitle"), description: t("stepTourDesc") },
    done: { title: t("stepDoneTitle"), description: "" },
  };
}

export function usePipelinePhases(): { id: PipelinePhaseId; label: string; hint: string }[] {
  const t = useTranslations("onboarding");
  return [
    { id: "dna_compile", label: t("pipelineDnaLabel"), hint: t("pipelineDnaHint") },
    { id: "competitor_discovery", label: t("pipelineCompetitorsLabel"), hint: t("pipelineCompetitorsHint") },
    { id: "keyword_scan", label: t("pipelineKeywordsLabel"), hint: t("pipelineKeywordsHint") },
    { id: "auto_analyze", label: t("pipelineAnalyzeLabel"), hint: t("pipelineAnalyzeHint") },
  ];
}

export type { OnboardingChapterId };
