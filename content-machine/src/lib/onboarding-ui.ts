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
    label: "Identity",
    subtitle: "Creator, niche, audience",
    steps: ["workspace", "quiz", "source"],
  },
  {
    id: "brain",
    label: "Creator Brain",
    subtitle: "Context, patterns, discovery",
    steps: ["strategy_docs", "pipeline"],
  },
  {
    id: "first_win",
    label: "First win",
    subtitle: "Pick, create, export",
    steps: ["reel_review", "first_content", "editor", "action_plan", "tour"],
  },
];

export const STEP_HEADINGS: Record<OnboardingStepKey, { title: string; description: string }> = {
  workspace: {
    title: "Let's build your Creator Brain",
    description: "Start with the creator profile Silas will use to find opportunities and generate your first post.",
  },
  quiz: {
    title: "What should Silas understand?",
    description: "A few sharp answers are enough. We use them to shape discovery, voice, and your first content angle.",
  },
  source: {
    title: "Add the raw truth",
    description:
      "Answer a few quick questions or paste notes — we turn your answers into strategy docs Silas can use.",
  },
  strategy_docs: {
    title: "Your brain preview",
    description: "Review what Silas understood. Keep it lightweight now; you can refine the full brain later.",
  },
  pipeline: {
    title: "Silas is finding your opening",
    description: "We're reading your niche, finding similar creators, and preparing content options worth acting on.",
  },
  reel_review: {
    title: "Train your taste",
    description: "Vote on the best opportunities. Silas learns what feels on-brand before creating anything for you.",
  },
  first_content: {
    title: "Pick your first win",
    description: "Choose the opportunity you want Silas to turn into your first export-ready content piece.",
  },
  editor: {
    title: "Create your first post",
    description: "Refine the copy, visuals, cover, and caption. When the export is ready, your dashboard unlocks.",
  },
  action_plan: {
    title: "Your first week is mapped",
    description: "A concrete 7-day plan based on your Creator Brain, taste votes, and first generation session.",
  },
  tour: {
    title: "You're ready",
    description: "Open the full studio. Intelligence, Create, and Creator Brain are now connected.",
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
  { id: "dna_compile", label: "Build your Creator Brain", hint: "Positioning, audience, voice, and offers" },
  { id: "baseline_scrape", label: "Read your Instagram", hint: "Your existing reels and captions" },
  { id: "auto_profile", label: "Sharpen the niche map", hint: "Merging AI signals with your answers" },
  { id: "competitor_discovery", label: "Find creators like you", hint: "Relevant accounts and adjacent angles" },
  { id: "profile_scrapes", label: "Collect winning reels", hint: "Outliers from similar creators" },
  { id: "auto_analyze", label: "Detect repeatable patterns", hint: "Hooks, formats, structures, and payoff" },
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
  "w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 transition focus:border-amber-300/55 focus:bg-white/[0.07] focus:ring-4 focus:ring-amber-300/10";

export const onboardingTextareaClass =
  "min-h-[220px] w-full resize-y rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3 text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 transition focus:border-amber-300/55 focus:bg-white/[0.07] focus:ring-4 focus:ring-amber-300/10";

export const onboardingLabelClass =
  "mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500";
