/** Onboarding UX: chapter mapping, pipeline labels, shared tokens. */

export type OnboardingStepKey =
  | "workspace"
  | "quiz"
  | "source"
  | "strategy_docs"
  | "pipeline"
  | "reel_review"
  | "first_content"
  | "editor"
  | "action_plan"
  | "tour"
  | "done";

export const ONBOARDING_STEP_ORDER: OnboardingStepKey[] = [
  "workspace",
  "quiz",
  "source",
  "strategy_docs",
  "pipeline",
  "reel_review",
  "first_content",
  "editor",
  "action_plan",
  "tour",
];

export type OnboardingChapterId = "identity" | "brain" | "first_win";

export type OnboardingChapter = {
  id: OnboardingChapterId;
  label: string;
  subtitle: string;
  steps: OnboardingStepKey[];
};

export const ONBOARDING_CHAPTERS: OnboardingChapter[] = [
  {
    id: "identity",
    label: "Who you are",
    subtitle: "Workspace, niche, and source material",
    steps: ["workspace", "quiz", "source"],
  },
  {
    id: "brain",
    label: "Train your brain",
    subtitle: "Strategy docs and market discovery",
    steps: ["strategy_docs", "pipeline"],
  },
  {
    id: "first_win",
    label: "First win",
    subtitle: "Pick an outlier, create, and export",
    steps: ["reel_review", "first_content", "editor", "action_plan", "tour"],
  },
];

export const STEP_HEADINGS: Record<OnboardingStepKey, { title: string; description: string }> = {
  workspace: {
    title: "Create your workspace",
    description: "One organization and your first creator profile.",
  },
  quiz: {
    title: "Your niche",
    description: "Structured answers feed discovery and your AI profile.",
  },
  source: {
    title: "Source material",
    description: "Paste a transcript or brief — we draft your strategy sections from it.",
  },
  strategy_docs: {
    title: "Strategy documents",
    description: "Review and save the five core docs, then we compile Client DNA.",
  },
  pipeline: {
    title: "Market discovery",
    description: "We find competitors, similar reels, and run analyses in the background.",
  },
  reel_review: {
    title: "Approve outliers",
    description: "Vote on candidate reels — we learn what resonates with you.",
  },
  first_content: {
    title: "Choose your first reel",
    description: "Pick one YES vote to adapt into your first post.",
  },
  editor: {
    title: "Create & export",
    description: "Refine copy, visual, cover, and caption — then export when ready.",
  },
  action_plan: {
    title: "Your 7-day plan",
    description: "Concrete daily actions based on your DNA and first session.",
  },
  tour: {
    title: "You're set",
    description: "Open the full dashboard — Intelligence, Create, and Context are unlocked.",
  },
  done: { title: "Done", description: "" },
};

export type PipelinePhaseId =
  | "queued"
  | "dna_compile"
  | "baseline_scrape"
  | "auto_profile"
  | "competitor_discovery"
  | "profile_scrapes"
  | "auto_analyze"
  | "complete"
  | "failed";

export const PIPELINE_PHASES: { id: PipelinePhaseId; label: string; hint: string }[] = [
  { id: "dna_compile", label: "Compile AI profile", hint: "From your strategy docs" },
  { id: "baseline_scrape", label: "Read your Instagram", hint: "Own reels and captions" },
  { id: "auto_profile", label: "Enrich niche profile", hint: "Merge with your quiz answers" },
  { id: "competitor_discovery", label: "Find similar creators", hint: "Identity keywords + seeds" },
  { id: "profile_scrapes", label: "Collect competitor reels", hint: "Profile scrapes queued" },
  { id: "auto_analyze", label: "Analyze winning patterns", hint: "Hooks, structure, formats" },
];

export function chapterForStep(step: OnboardingStepKey): OnboardingChapter {
  return (
    ONBOARDING_CHAPTERS.find((c) => c.steps.includes(step)) ?? ONBOARDING_CHAPTERS[0]
  );
}

export function chapterProgress(
  chapter: OnboardingChapter,
  currentStep: OnboardingStepKey,
  completedSteps: string[],
): number {
  const idx = chapter.steps.indexOf(currentStep);
  const done = chapter.steps.filter((s) => completedSteps.includes(s)).length;
  if (idx < 0) return Math.round((done / chapter.steps.length) * 100);
  return Math.round(((done + 0.5) / chapter.steps.length) * 100);
}

export function pipelinePhaseStatus(
  phaseId: PipelinePhaseId,
  current: string | undefined,
): "done" | "active" | "pending" | "failed" {
  if (current === "failed" && phaseId !== "complete") return "pending";
  if (current === "failed") return "failed";
  if (!current || current === "queued") return phaseId === "dna_compile" ? "active" : "pending";
  if (current === "complete") return "done";
  const order = PIPELINE_PHASES.map((p) => p.id);
  const curIdx = order.indexOf(current as PipelinePhaseId);
  const phaseIdx = order.indexOf(phaseId);
  if (curIdx < 0) return "pending";
  if (phaseIdx < curIdx) return "done";
  if (phaseIdx === curIdx) return "active";
  return "pending";
}

/** Same inputs as signup (`signup-client.tsx`). */
export const onboardingInputClass =
  "w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500";

export const onboardingTextareaClass =
  "min-h-[220px] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm leading-relaxed text-zinc-100 placeholder:text-zinc-500";

export const onboardingLabelClass =
  "mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500";
