"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Brain, ChevronDown, FileText, Loader2, Sparkles } from "lucide-react";
import { ContextEditor } from "@/app/(dashboard)/context/context-editor";
import { OnboardingPipelineProgress } from "@/components/onboarding/onboarding-pipeline-progress";
import { OnboardingReelVoteCard } from "@/components/onboarding/onboarding-reel-vote-card";
import { OnboardingVoiceStep } from "@/components/onboarding/onboarding-voice-step";
import { StrategyDocPreviewCard } from "@/components/onboarding/strategy-doc-preview-card";
import { OpportunityCard } from "@/components/home/opportunity-card";
import {
  OnboardingError,
  OnboardingPrimaryButton,
  OnboardingQuestionScreen,
  OnboardingShell,
  type OnboardingLayoutVariant,
} from "@/components/onboarding/onboarding-shell";
import { VideoCreateWorkspace } from "@/components/video-create-workspace";
import type { OnboardingStatusRow, ScrapedReelRow } from "@/lib/api";
import {
  fetchOnboardingReelCandidates,
  fetchOnboardingStatusClient,
  fetchClientRowClient,
  generateOnboardingActionPlan,
  goBackInOnboarding,
  patchOnboardingStatus,
  postOnboardingReelFeedback,
  startOnboardingFirstContent,
  startOnboardingIgPrefill,
  startOnboardingPipeline,
  putClientClientContext,
  clientApiHeaders,
  getContentApiBase,
  type OnboardingReelCandidate,
} from "@/lib/api-client";
import {
  ONBOARDING_STEP_ORDER,
  previousOnboardingStep,
  type OnboardingStepKey,
} from "@/lib/onboarding-ui";
import { useStepHeadings } from "@/lib/use-onboarding-ui";
import { useOnboardingLang } from "@/lib/use-onboarding-lang";
import { onboardingBypassClearHref } from "@/lib/onboarding-bypass";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

type Props = {
  hasTenancy: boolean;
  clientSlug: string;
  orgSlug: string;
  initialStatus: OnboardingStatusRow | null;
  initialContext?: Record<string, unknown> | null;
  onboardingBypassActive?: boolean;
};

function toScrapedRow(c: OnboardingReelCandidate): ScrapedReelRow {
  const reel = c.reel as ScrapedReelRow;
  if (c.analysis && !reel.analysis) {
    return { ...reel, analysis: c.analysis as ScrapedReelRow["analysis"] };
  }
  return reel;
}

function ReelCandidatesSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="glass animate-pulse rounded-xl border border-app-divider/50 p-3"
        >
          <div className="flex gap-3">
            <div className="h-40 w-[90px] rounded-xl bg-app-divider/40" />
            <div className="flex-1 space-y-2 pt-2">
              <div className="h-3 w-20 rounded bg-app-divider/50" />
              <div className="h-2 w-full rounded bg-app-divider/40" />
              <div className="h-2 w-4/5 rounded bg-app-divider/40" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function OnboardingWizard({
  hasTenancy,
  clientSlug,
  orgSlug,
  initialStatus,
  initialContext,
  onboardingBypassActive = false,
}: Props) {
  const stepHeadings = useStepHeadings();
  const appLocale = useLocale();
  const t = useTranslations("onboarding");
  const defaultContentLang = useOnboardingLang();
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatusRow | null>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const [qIdx, setQIdx] = useState(0);
  const [sourceMode, setSourceMode] = useState<null | "questions" | "paste">(null);
  const [orgName, setOrgName] = useState("");
  const [orgSlugInput] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientSlugInput] = useState("");
  const [instagram, setInstagram] = useState("");
  const [language, setLanguage] = useState<"de" | "en">(defaultContentLang);
  const [nicheSummary] = useState("");
  const [nicheKeywords] = useState("");

  const [quizAudience, setQuizAudience] = useState("");
  const [quizGoals, setQuizGoals] = useState("");
  const [quizVoice, setQuizVoice] = useState("");
  const [quizOffers, setQuizOffers] = useState("");
  const [quizCompetitors, setQuizCompetitors] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [showFullBrainEditor, setShowFullBrainEditor] = useState(false);
  const [srcOffer, setSrcOffer] = useState("");
  const [srcIcp, setSrcIcp] = useState("");
  const [srcStory, setSrcStory] = useState("");
  const [srcPositioning, setSrcPositioning] = useState("");
  const [srcTone, setSrcTone] = useState("");
  const [autofilledKeys, setAutofilledKeys] = useState<Set<string>>(new Set());
  const igPrefillAppliedRef = useRef(false);
  const [candidates, setCandidates] = useState<OnboardingReelCandidate[]>([]);
  const [votes, setVotes] = useState<Record<string, "yes" | "no">>({});
  const [tasteNotice, setTasteNotice] = useState<string | null>(null);
  const [poolExhausted, setPoolExhausted] = useState(false);
  const [selectedReelId, setSelectedReelId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [actionPlan, setActionPlan] = useState<Record<string, unknown> | null>(
    (initialStatus?.action_plan as Record<string, unknown>) ?? null,
  );
  const [liveContext, setLiveContext] = useState<Record<string, unknown> | null>(
    initialContext ?? null,
  );

  const currentStep: OnboardingStepKey = useMemo(() => {
    if (!hasTenancy) return "workspace";
    const s = (status?.current_step || "quiz") as OnboardingStepKey;
    return ONBOARDING_STEP_ORDER.includes(s) ? s : "quiz";
  }, [hasTenancy, status?.current_step]);

  const completedSteps = status?.completed_steps ?? [];
  const heading = stepHeadings[currentStep] ?? stepHeadings.quiz;
  const layoutVariant: OnboardingLayoutVariant =
    currentStep === "strategy_docs" ||
    currentStep === "editor" ||
    currentStep === "reel_review"
      ? "page"
      : "card";

  useEffect(() => {
    setQIdx(0);
    setSourceMode(null);
    setError(null);
  }, [currentStep]);

  const refreshStatus = useCallback(async () => {
    if (!clientSlug || !orgSlug) return;
    const r = await fetchOnboardingStatusClient(clientSlug, orgSlug);
    if (r.ok) setStatus(r.data as OnboardingStatusRow);
  }, [clientSlug, orgSlug]);

  useEffect(() => {
    if (status?.selected_generation_session_id) {
      setSessionId(status.selected_generation_session_id);
    }
    if (status?.selected_reel_id) setSelectedReelId(status.selected_reel_id);
    if (status?.action_plan) setActionPlan(status.action_plan as Record<string, unknown>);
  }, [status]);

  useEffect(() => {
    if (currentStep !== "pipeline" || !clientSlug) return;
    const t = setInterval(() => void refreshStatus(), 6000);
    return () => clearInterval(t);
  }, [currentStep, clientSlug, refreshStatus]);

  // Kick off discovery automatically as soon as the user lands on this step —
  // no need to hunt for a button. A failed run still needs an explicit retry
  // so we don't silently hammer Apify/OpenRouter in a loop.
  const pipelineAutoStartedRef = useRef(false);
  useEffect(() => {
    if (currentStep !== "pipeline" || !clientSlug || !orgSlug) return;
    if (pipelineAutoStartedRef.current) return;
    const phase = (status?.pipeline_progress as { phase?: string } | undefined)?.phase;
    if (phase) return; // already started, running, failed, or complete
    pipelineAutoStartedRef.current = true;
    void runPipeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, clientSlug, orgSlug, status?.pipeline_progress]);

  useEffect(() => {
    setLanguage(defaultContentLang);
  }, [appLocale, defaultContentLang]);

  useEffect(() => {
    const saved = status?.quiz_answers?.language;
    if (saved === "de" || saved === "en") setLanguage(saved);
  }, [status?.quiz_answers?.language]);

  // Silas reads the creator's Instagram in the background right after workspace setup.
  // Only poll while on source (quiz is voice/type and doesn't use the IG-prefilled quiz fields).
  const igPrefillStatus = String(status?.ig_prefill?.status || "");
  useEffect(() => {
    if (currentStep !== "source") return;
    if (!clientSlug || igPrefillAppliedRef.current) return;
    if (igPrefillStatus === "ready" || igPrefillStatus === "skipped" || igPrefillStatus === "failed") {
      return;
    }
    const t = setInterval(() => void refreshStatus(), 4000);
    return () => clearInterval(t);
  }, [currentStep, clientSlug, igPrefillStatus, refreshStatus]);

  useEffect(() => {
    if (igPrefillAppliedRef.current) return;
    const prefill = status?.ig_prefill as
      | { status?: string; data?: Record<string, string> }
      | undefined;
    if (prefill?.status !== "ready" || !prefill.data) return;
    igPrefillAppliedRef.current = true;
    const d = prefill.data;
    const filled = new Set<string>();
    const fillIfEmpty = (
      current: string,
      setter: (v: string) => void,
      value: string | undefined,
      key: string,
    ) => {
      const v = (value || "").trim();
      if (!v) return;
      if (v.toLowerCase().startsWith("not clear")) return;
      if (current.trim()) return;
      setter(v);
      filled.add(key);
    };
    fillIfEmpty(quizAudience, setQuizAudience, d.target_audience, "audience");
    fillIfEmpty(quizGoals, setQuizGoals, d.content_goals, "goals");
    fillIfEmpty(quizVoice, setQuizVoice, d.brand_voice, "voice");
    fillIfEmpty(quizOffers, setQuizOffers, d.offer, "offer");
    fillIfEmpty(srcOffer, setSrcOffer, d.offer, "offer");
    fillIfEmpty(srcIcp, setSrcIcp, d.icp, "icp");
    fillIfEmpty(srcStory, setSrcStory, d.story, "story");
    fillIfEmpty(srcPositioning, setSrcPositioning, d.positioning, "positioning");
    fillIfEmpty(srcTone, setSrcTone, d.tone, "tone");
    if (filled.size > 0) setAutofilledKeys(filled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.ig_prefill]);

  useEffect(() => {
    if (currentStep === "source" && completedSteps.includes("source")) {
      void advance({ current_step: "strategy_docs" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, completedSteps]);

  useEffect(() => {
    if (currentStep !== "strategy_docs" || !clientSlug || !orgSlug) return;
    void (async () => {
      const r = await fetchClientRowClient(clientSlug, orgSlug);
      if (r.ok && r.data?.client_context) {
        setLiveContext(r.data.client_context as Record<string, unknown>);
      }
    })();
  }, [currentStep, clientSlug, orgSlug, status?.voice_transcript]);

  const applyCandidates = useCallback((data: OnboardingReelCandidate[]) => {
    const sorted = [...data].sort((a, b) => {
      const viewsA = Number(a.reel?.views ?? 0);
      const viewsB = Number(b.reel?.views ?? 0);
      if (viewsB !== viewsA) return viewsB - viewsA;
      const simA = Number(a.reel?.similarity_score ?? 0);
      const simB = Number(b.reel?.similarity_score ?? 0);
      return simB - simA;
    });
    setCandidates(sorted);
    const v: Record<string, "yes" | "no"> = {};
    for (const c of sorted) {
      const id = c.reel?.id;
      if (id && c.already_voted) v[id] = c.already_voted as "yes" | "no";
    }
    setVotes(v);
  }, []);

  const reloadCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const fresh = await fetchOnboardingReelCandidates(clientSlug, orgSlug);
      if (fresh.ok && fresh.data.length > 0) {
        setPoolExhausted(false);
        applyCandidates(fresh.data);
        return fresh;
      }
      // Pool empty (typical after all-No) — resurface rejected so the user can flip one to Yes.
      const rejected = await fetchOnboardingReelCandidates(clientSlug, orgSlug, {
        includeRejected: true,
      });
      if (rejected.ok) {
        applyCandidates(rejected.data);
        if (rejected.data.length > 0) setPoolExhausted(true);
      }
      return rejected.ok ? rejected : fresh;
    } finally {
      setCandidatesLoading(false);
    }
  }, [clientSlug, orgSlug, applyCandidates]);

  useEffect(() => {
    if (currentStep !== "reel_review" && currentStep !== "first_content") return;
    setTasteNotice(null);
    void reloadCandidates();
  }, [currentStep, reloadCandidates]);

  useEffect(() => {
    if (currentStep !== "action_plan" || actionPlan) return;
    void (async () => {
      const r = await generateOnboardingActionPlan(clientSlug, orgSlug);
      if (r.ok) setActionPlan(r.action_plan);
    })();
  }, [currentStep, actionPlan, clientSlug, orgSlug]);

  async function submitWorkspace() {
    setError(null);
    if (!clientName.trim()) {
      setError(t("creatorNameRequired"));
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_name: orgName.trim(),
          org_slug: orgSlugInput.trim() || undefined,
          client_name: clientName.trim(),
          client_slug: clientSlugInput.trim() || undefined,
          instagram_handle: instagram.trim() || undefined,
          language,
          niche_summary: nicheSummary.trim() || undefined,
          niche_keywords: nicheKeywords.trim() || undefined,
        }),
      });
      const j = (await r.json()) as { error?: string; org_slug?: string; client_slug?: string };
      if (!r.ok) {
        setError(j.error ?? `Error ${r.status}`);
        return;
      }
      if (instagram.trim() && j.client_slug && j.org_slug) {
        // Best-effort, don't block continuing: Silas reads the Instagram profile
        // in the background so quiz/source questions can arrive pre-filled.
        void startOnboardingIgPrefill(j.client_slug, j.org_slug).catch(() => {});
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function advance(patch: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const r = await patchOnboardingStatus(clientSlug, orgSlug, patch);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setStatus(r.data as OnboardingStatusRow);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const minBackStep: OnboardingStepKey = hasTenancy ? "quiz" : "workspace";

  const goBack = useCallback(async () => {
    if (!clientSlug || !orgSlug || busy) return;
    const prev = previousOnboardingStep(currentStep, {
      completedSteps,
      minStep: minBackStep,
    });
    if (!prev) return;
    setBusy(true);
    setError(null);
    try {
      const r = await goBackInOnboarding(clientSlug, orgSlug, prev);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setStatus(r.data as OnboardingStatusRow);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [clientSlug, orgSlug, busy, router, currentStep, completedSteps, minBackStep]);

  const shellBackProps = {
    onBack: () => void goBack(),
    backBusy: busy,
    minBackStep,
  };

  async function saveQuiz() {
    await advance({
      quiz_answers: {
        niche_summary: nicheSummary.trim() || quizAudience,
        target_audience: quizAudience.trim(),
        content_goals: quizGoals.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
        brand_voice: quizVoice.trim(),
        offers: quizOffers.trim(),
        competitor_hints: quizCompetitors.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
        language,
      },
      complete_step: "quiz",
    });
  }

  function buildSourceTranscript() {
    const parts: string[] = [];
    const push = (heading: string, value: string) => {
      const v = value.trim();
      if (v) parts.push(`# ${heading}\n${v}`);
    };
    push(t("sourceHeadingNotes"), sourceText);
    push(t("sourceHeadingOffer"), srcOffer);
    push(t("sourceHeadingIcp"), srcIcp);
    push(t("sourceHeadingStory"), srcStory);
    push(t("sourceHeadingPositioning"), srcPositioning);
    push(t("sourceHeadingTone"), srcTone);
    return parts.join("\n\n");
  }

  async function saveSourceAndContinue() {
    const combined = buildSourceTranscript().trim();
    if (!combined) {
      await advance({ current_step: "strategy_docs", complete_step: "source" });
      return;
    }
    if (combined.length < 80) {
      setError(t("sourceTooShort"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const base = getContentApiBase();
      const headers = await clientApiHeaders({ orgSlug });
      const now = new Date().toISOString();

      // Best-effort: draft the strategy sections from the combined material so the
      // next step (Strategy documents) opens already showing progress.
      let generated: Record<string, string> | null = null;
      try {
        const genRes = await fetch(
          `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}/context/generate`,
          {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: combined }),
          },
        );
        if (genRes.ok) {
          const j = (await genRes.json().catch(() => null)) as { sections?: unknown } | null;
          if (j && typeof j.sections === "object" && j.sections) {
            generated = j.sections as Record<string, string>;
          }
        }
      } catch {
        /* draft is best-effort — user can still draft manually in the next step */
      }

      const clientContext: Record<string, unknown> = {
        onboarding_transcript: { text: combined, source: "manual", file: null, updated_at: now },
      };
      if (generated) {
        for (const key of [
          "icp",
          "brand_map",
          "story_board",
          "communication_guideline",
          "offer_documentation",
        ]) {
          const text = typeof generated[key] === "string" ? generated[key].trim() : "";
          if (text) {
            clientContext[key] = { text, source: "generated", file: null, updated_at: now };
          }
        }
      }

      const putResult = await putClientClientContext(clientSlug, orgSlug, clientContext);
      if (!putResult.ok) {
        setError(putResult.error);
        return;
      }
      await advance({ current_step: "strategy_docs", complete_step: "source" });
    } finally {
      setBusy(false);
    }
  }

  async function runPipeline(opts?: { broaden?: boolean }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setTasteNotice(null);
    try {
      // Allow a deliberate re-scan after the user rejected the first batch.
      pipelineAutoStartedRef.current = false;
      setPoolExhausted(false);
      const r = await startOnboardingPipeline(clientSlug, orgSlug, {
        broaden: Boolean(opts?.broaden),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
    } finally {
      setBusy(false);
    }
    await advance({ current_step: "pipeline" });
    void refreshStatus();
  }

  async function submitVotes() {
    if (busy) return;
    const items = Object.entries(votes).map(([scraped_reel_id, verdict]) => ({
      scraped_reel_id,
      verdict,
    }));
    if (items.length < requiredVotes) {
      setError(
        requiredVotes === 1
          ? t("voteBeforeContinueOne")
          : t("voteBeforeContinueMany", { count: requiredVotes }),
      );
      return;
    }
    const yesCount = items.filter((i) => i.verdict === "yes").length;
    // Snapshot before any reload — if the pool is empty we must keep these visible
    // so the user can flip a No → Yes (backend hides Nos on refetch).
    const rejectedBatch = candidates;
    const rejectedVotes = { ...votes };
    setBusy(true);
    setError(null);
    setTasteNotice(null);
    try {
      const r = await postOnboardingReelFeedback(clientSlug, orgSlug, items);
      if (!r.ok) {
        setError(r.error);
        return;
      }

      // All-No is valid taste signal, but first_content needs ≥1 Yes seed.
      // Persist Nos, try next batch — never advance into an empty Yes dead-end.
      if (yesCount === 0) {
        const next = await fetchOnboardingReelCandidates(clientSlug, orgSlug);
        if (next.ok && next.data.length > 0) {
          setPoolExhausted(false);
          applyCandidates(next.data);
          setTasteNotice(t("noneFeltRight"));
          return;
        }
        // No replacements: keep / restore rejected cards so a vote can be flipped.
        setCandidates(rejectedBatch);
        setVotes(rejectedVotes);
        setPoolExhausted(true);
        setTasteNotice(t("poolEmptyFlipYes"));
        return;
      }

      await advance({ complete_step: "reel_review", current_step: "first_content" });
    } finally {
      setBusy(false);
    }
  }

  async function startFirstContent() {
    if (!selectedReelId) {
      setError(t("pickOneYesReel"));
      return;
    }
    setBusy(true);
    try {
      const r = await startOnboardingFirstContent(
        clientSlug,
        orgSlug,
        selectedReelId,
        "talking_head",
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSessionId(r.session.id);
      setStatus((s) =>
        s
          ? { ...s, selected_generation_session_id: r.session.id, current_step: "editor" }
          : s,
      );
    } finally {
      setBusy(false);
    }
  }

  async function markAhaAndPlan() {
    setBusy(true);
    try {
      await advance({ mark_aha_complete: true });
      const r = await generateOnboardingActionPlan(clientSlug, orgSlug);
      if (r.ok) {
        setActionPlan(r.action_plan);
        await refreshStatus();
      } else {
        setError(r.error);
      }
    } finally {
      setBusy(false);
    }
  }

  async function finishTour() {
    await advance({ current_step: "done", complete_step: "tour", status: "completed" });
    router.replace(onboardingBypassClearHref("/dashboard?welcome=1"));
  }

  const yesReels = candidates.filter((c) => c.reel?.id && votes[c.reel.id] === "yes");
  const pipelinePhase = (status?.pipeline_progress as { phase?: string })?.phase;
  const pipelineComplete = pipelinePhase === "complete";
  const pipelineFailed = pipelinePhase === "failed";
  const votedCount = Object.keys(votes).length;
  // Discovery sometimes only surfaces 1-2 candidates worth showing (small niche,
  // strict quality bar) — require voting on all of them rather than a fixed 3,
  // so a thin result set can never hard-block onboarding.
  const requiredVotes = Math.max(1, Math.min(3, candidates.length));
  const sourceLength = sourceText.trim().length;

  const contextLocked = Boolean(status?.context_preview_locked);

  function lockedPreviewChars(locked: boolean): number {
    return locked ? 1800 : 6000;
  }

  function sectionText(key: string, fallback: string): string {
    const sec = liveContext?.[key];
    if (sec && typeof sec === "object" && sec !== null && "text" in sec) {
      const t = String((sec as { text?: string }).text || "").trim();
      if (t) return t.slice(0, lockedPreviewChars(contextLocked));
    }
    return fallback;
  }

  const brainPreview = {
    audience:
      quizAudience.trim() ||
      String(status?.quiz_answers?.target_audience || "").trim() ||
      t("previewAudienceFallback"),
    goals:
      splitList(quizGoals).join(", ") ||
      ((status?.quiz_answers?.content_goals as string[] | undefined)?.join(", ") ?? "") ||
      t("previewGoalsFallback"),
    voice:
      quizVoice.trim() ||
      String(status?.quiz_answers?.brand_voice || "").trim() ||
      t("previewVoiceFallback"),
    offer:
      quizOffers.trim() ||
      String(status?.quiz_answers?.offers || "").trim() ||
      t("previewOfferFallback"),
  };

  const documentPreviews = {
    icp: sectionText("icp", brainPreview.audience),
    brand_map: sectionText("brand_map", brainPreview.offer),
    story_board: sectionText("story_board", t("previewStoryFallback")),
    communication_guideline: sectionText(
      "communication_guideline",
      brainPreview.voice,
    ),
  };

  const qInputClass =
    "w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/30";

  type OnbQuestion = {
    question: string;
    helper: string;
    example?: string;
    optional?: boolean;
    validate?: () => string | null;
    node: ReactNode;
  };

  const igPrefillLoading =
    (currentStep === "quiz" || currentStep === "source") &&
    Boolean(instagram.trim()) &&
    !["ready", "skipped", "failed"].includes(igPrefillStatus);

  const igPrefillBanner = igPrefillLoading ? (
    <p className="mb-4 flex items-center gap-2 text-xs font-medium text-amber-300/90">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      {t("readingInstagram")}
    </p>
  ) : null;

  const workspaceQuestions: OnbQuestion[] = [
    {
      question: t("qWorkspaceName"),
      helper: t("qWorkspaceNameHelper"),
      example: t("qWorkspaceNameExample"),
      validate: () => (orgName.trim() ? null : t("workspaceNameRequired")),
      node: (
        <input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className={qInputClass}
          placeholder="Toni Mora Studio"
          autoFocus
        />
      ),
    },
    {
      question: t("qCreatorName"),
      helper: t("qCreatorNameHelper"),
      example: t("qCreatorNameExample"),
      validate: () => (clientName.trim() ? null : t("creatorNameRequired")),
      node: (
        <input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          className={qInputClass}
          placeholder="Toni Mora"
          autoFocus
        />
      ),
    },
    {
      question: t("qInstagram"),
      helper: t("qInstagramHelper"),
      example: t("qInstagramExample"),
      optional: true,
      node: (
        <input
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          className={qInputClass}
          placeholder="@username"
          autoFocus
        />
      ),
    },
    {
      question: t("qLanguage"),
      helper: t("qLanguageHelper"),
      node: (
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as "de" | "en")}
          className={qInputClass}
          autoFocus
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      ),
    },
  ];

  const igNote = (key: string) => (autofilledKeys.has(key) ? t("igPrefillNote") : "");

  const quizQuestions: OnbQuestion[] = [
    {
      question: t("qAudience"),
      helper: t("qAudienceHelper") + igNote("audience"),
      example: t("qAudienceExample"),
      validate: () => (quizAudience.trim() ? null : t("audienceRequired")),
      node: (
        <textarea
          value={quizAudience}
          onChange={(e) => setQuizAudience(e.target.value)}
          rows={3}
          className={qInputClass}
          placeholder={t("qAudiencePlaceholder")}
          autoFocus
        />
      ),
    },
    {
      question: t("qGoals"),
      helper: t("qGoalsHelper") + igNote("goals"),
      example: t("qGoalsExample"),
      optional: true,
      node: (
        <input
          value={quizGoals}
          onChange={(e) => setQuizGoals(e.target.value)}
          className={qInputClass}
          placeholder="leads, brand authority, sell my course"
          autoFocus
        />
      ),
    },
    {
      question: t("qVoice"),
      helper: t("qVoiceHelper") + igNote("voice"),
      example: t("qVoiceExample"),
      optional: true,
      node: (
        <input
          value={quizVoice}
          onChange={(e) => setQuizVoice(e.target.value)}
          className={qInputClass}
          placeholder="friendly and direct, with humor but data-backed"
          autoFocus
        />
      ),
    },
    {
      question: t("qOffer"),
      helper: t("qOfferHelper") + igNote("offer"),
      example: t("qOfferExample"),
      optional: true,
      node: (
        <textarea
          value={quizOffers}
          onChange={(e) => setQuizOffers(e.target.value)}
          rows={3}
          className={qInputClass}
          placeholder={t("qOfferPlaceholder")}
          autoFocus
        />
      ),
    },
    {
      question: t("qCompetitors"),
      helper: t("qCompetitorsHelper"),
      example: t("qCompetitorsExample"),
      optional: true,
      node: (
        <input
          value={quizCompetitors}
          onChange={(e) => setQuizCompetitors(e.target.value)}
          className={qInputClass}
          placeholder="@creator1, @creator2"
          autoFocus
        />
      ),
    },
  ];

  const sourcePasteQuestion: OnbQuestion = {
    question: t("qPasteMaterial"),
    helper: t("qPasteMaterialHelper"),
    optional: true,
    node: (
      <textarea
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        rows={10}
        className={qInputClass}
        placeholder={t("qPasteMaterialPlaceholder")}
        autoFocus
      />
    ),
  };

  const sourceDiscoveryQuestions: OnbQuestion[] = [
    {
      question: t("qSellToWhom"),
      helper: t("qSellToWhomHelper") + igNote("offer"),
      example: t("qSellToWhomExample"),
      optional: true,
      node: (
        <textarea
          value={srcOffer}
          onChange={(e) => setSrcOffer(e.target.value)}
          rows={4}
          className={qInputClass}
          placeholder={t("qSellToWhomPlaceholder")}
          autoFocus
        />
      ),
    },
    {
      question: t("qIdealStruggle"),
      helper: t("qIdealStruggleHelper") + igNote("icp"),
      example: t("qIdealStruggleExample"),
      optional: true,
      node: (
        <textarea
          value={srcIcp}
          onChange={(e) => setSrcIcp(e.target.value)}
          rows={4}
          className={qInputClass}
          placeholder={t("qIdealStrugglePlaceholder")}
          autoFocus
        />
      ),
    },
    {
      question: t("qOriginStory"),
      helper: t("qOriginStoryHelper") + igNote("story"),
      example: t("qOriginStoryExample"),
      optional: true,
      node: (
        <textarea
          value={srcStory}
          onChange={(e) => setSrcStory(e.target.value)}
          rows={4}
          className={qInputClass}
          placeholder={t("qOriginStoryPlaceholder")}
          autoFocus
        />
      ),
    },
    {
      question: t("qWhyYou"),
      helper: t("qWhyYouHelper") + igNote("positioning"),
      example: t("qWhyYouExample"),
      optional: true,
      node: (
        <textarea
          value={srcPositioning}
          onChange={(e) => setSrcPositioning(e.target.value)}
          rows={4}
          className={qInputClass}
          placeholder={t("qWhyYouPlaceholder")}
          autoFocus
        />
      ),
    },
    {
      question: t("qContentSound"),
      helper: t("qContentSoundHelper") + igNote("tone"),
      example: t("qContentSoundExample"),
      optional: true,
      node: (
        <textarea
          value={srcTone}
          onChange={(e) => setSrcTone(e.target.value)}
          rows={4}
          className={qInputClass}
          placeholder={t("qContentSoundPlaceholder")}
          autoFocus
        />
      ),
    },
  ];

  const stepFlow: Record<
    "workspace" | "quiz",
    { questions: OnbQuestion[]; submitLabel: string; onSubmit: () => void | Promise<void> }
  > = {
    workspace: {
      questions: workspaceQuestions,
      submitLabel: t("createWorkspace"),
      onSubmit: submitWorkspace,
    },
    quiz: { questions: quizQuestions, submitLabel: t("continue"), onSubmit: saveQuiz },
  };

  if (currentStep === "quiz") {
    return (
      <OnboardingVoiceStep
        clientSlug={clientSlug}
        orgSlug={orgSlug}
        status={status}
        currentStep={currentStep}
        completedSteps={completedSteps}
        stepTitle={heading.title}
        stepDescription={heading.description}
        language={language}
        onboardingBypassActive={onboardingBypassActive}
        onStatus={(s) => setStatus(s as OnboardingStatusRow)}
        onError={setError}
      />
    );
  }

  if (currentStep === "workspace") {
    const flow = stepFlow.workspace;
    const questions = flow.questions;
    const safeIdx = Math.min(qIdx, questions.length - 1);
    const q = questions[safeIdx];
    const isLast = safeIdx >= questions.length - 1;
    const stepHeading = stepHeadings[currentStep];

    const handleContinue = () => {
      const validationError = q.validate?.();
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      if (!isLast) {
        setQIdx((i) => i + 1);
        return;
      }
      void flow.onSubmit();
    };

    return (
      <OnboardingShell
        variant="raw"
        currentStep={currentStep}
        completedSteps={completedSteps}
        onboardingBypassActive={onboardingBypassActive}
        {...shellBackProps}
      >
        <OnboardingQuestionScreen
          stepTitle={stepHeading.title}
          stepDescription={stepHeading.description}
          index={safeIdx}
          total={questions.length}
          question={q.question}
          helper={q.helper}
          example={q.example}
          optional={q.optional}
          error={error}
          canBack={safeIdx > 0}
          isLast={isLast}
          busy={busy}
          submitLabel={flow.submitLabel}
          onBack={() => {
            setError(null);
            setQIdx((i) => Math.max(0, i - 1));
          }}
          onContinue={handleContinue}
        >
          {igPrefillBanner}
          {q.node}
        </OnboardingQuestionScreen>
      </OnboardingShell>
    );
  }

  if (currentStep === "source") {
    const stepHeading = stepHeadings.source;

    if (sourceMode === null) {
      return (
        <OnboardingShell
          variant="raw"
          currentStep={currentStep}
          completedSteps={completedSteps}
          onboardingBypassActive={onboardingBypassActive}
          {...shellBackProps}
        >
          <OnboardingQuestionScreen
            stepTitle={stepHeading.title}
            stepDescription={stepHeading.description}
            index={0}
            total={1}
            hideActions
            hideProgress
            question={t("sourceModeQuestion")}
            helper={t("sourceModeHelper")}
            error={error}
            onContinue={() => {}}
          >
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setQIdx(0);
                  setSourceMode("questions");
                }}
                className="flex flex-col gap-1 rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-4 text-left transition hover:border-amber-400/70 hover:bg-amber-400/10"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{t("sourceModeQuestions")}</span>
                  <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                    {t("sourceModeRecommended")}
                  </span>
                </span>
                <span className="text-xs leading-relaxed text-zinc-500">
                  {t("sourceModeQuestionsHint")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setQIdx(0);
                  setSourceMode("paste");
                }}
                className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-amber-400/50 hover:bg-white/[0.06]"
              >
                <span className="text-sm font-bold text-white">{t("sourceModePaste")}</span>
                <span className="text-xs leading-relaxed text-zinc-500">
                  {t("sourceModePasteHint")}
                </span>
              </button>
            </div>
          </OnboardingQuestionScreen>
        </OnboardingShell>
      );
    }

    const isPaste = sourceMode === "paste";
    const questions = isPaste ? [sourcePasteQuestion] : sourceDiscoveryQuestions;
    const safeIdx = Math.min(qIdx, questions.length - 1);
    const q = questions[safeIdx];
    const isLast = safeIdx >= questions.length - 1;

    const handleContinue = () => {
      const validationError = q.validate?.();
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      if (!isLast) {
        setQIdx((i) => i + 1);
        return;
      }
      void saveSourceAndContinue();
    };

    return (
      <OnboardingShell
        variant="raw"
        currentStep={currentStep}
        completedSteps={completedSteps}
        onboardingBypassActive={onboardingBypassActive}
        {...shellBackProps}
      >
        <OnboardingQuestionScreen
          stepTitle={stepHeading.title}
          stepDescription={stepHeading.description}
          index={safeIdx}
          total={questions.length}
          hideProgress={isPaste}
          question={q.question}
          helper={q.helper}
          example={q.example}
          optional={q.optional}
          error={error}
          canBack
          isLast={isLast}
          busy={busy}
          submitLabel={t("buildMyStrategy")}
          onBack={() => {
            setError(null);
            if (safeIdx > 0) setQIdx((i) => Math.max(0, i - 1));
            else setSourceMode(null);
          }}
          onContinue={handleContinue}
        >
          {igPrefillBanner}
          {q.node}
        </OnboardingQuestionScreen>
      </OnboardingShell>
    );
  }

  const body = (
    <>
      {error ? <OnboardingError message={error} /> : null}

      {currentStep === "strategy_docs" && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
            <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-300/20">
                  <Brain className="h-5 w-5 text-amber-300" aria-hidden />
                </div>
                <div>
                  <p className="text-lg font-black text-white">{t("silasHasEnough")}</p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    {t("silasHasEnoughHint")}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-bold text-white">{t("whatHappensNext")}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {t("whatHappensNextHint")}
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <StrategyDocPreviewCard label={t("docIcp")} value={documentPreviews.icp} locked={contextLocked} />
            <StrategyDocPreviewCard label={t("docBrandMap")} value={documentPreviews.brand_map} locked={contextLocked} />
            <StrategyDocPreviewCard label={t("docStoryboard")} value={documentPreviews.story_board} locked={contextLocked} />
            <StrategyDocPreviewCard
              label={t("docCommGuideline")}
              value={documentPreviews.communication_guideline}
              locked={contextLocked}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFullBrainEditor((v) => !v)}
            className="text-sm font-bold text-amber-300 hover:text-amber-200"
          >
            {showFullBrainEditor ? t("hideFullBrainEditor") : t("reviewFullBrainEditor")}
          </button>
          {showFullBrainEditor ? (
            <ContextEditor
              clientSlug={clientSlug}
              orgSlug={orgSlug}
              initialContext={initialContext as never}
              disabled={false}
            />
          ) : null}
          <OnboardingPrimaryButton
            busy={busy}
            onClick={() => void advance({ complete_step: "strategy_docs", current_step: "pipeline" })}
          >
            {t("startFindingOpportunities")}
          </OnboardingPrimaryButton>
        </div>
      )}

      {currentStep === "pipeline" && (
        <div className="space-y-5">
          <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-6 text-center shadow-lg">
            <p className="text-xl font-black text-white">{t("silasScanning")}</p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-400">
              {t("silasScanningHint")}
            </p>
          </div>

          {/* Primary action lives right under the intro — not buried below the
              phase list — and discovery also starts itself automatically. */}
          {pipelineComplete ? (
            <OnboardingPrimaryButton onClick={() => void advance({ current_step: "reel_review" })}>
              {t("showBestOpportunities")}
            </OnboardingPrimaryButton>
          ) : pipelineFailed ? (
            <OnboardingPrimaryButton busy={busy} onClick={() => void runPipeline()}>
              {t("retryDiscovery")}
            </OnboardingPrimaryButton>
          ) : !pipelinePhase ? (
            <OnboardingPrimaryButton busy={busy} onClick={() => void runPipeline()}>
              {t("startAiDiscovery")}
            </OnboardingPrimaryButton>
          ) : null}

          <OnboardingPipelineProgress
            phase={pipelinePhase}
            lastError={status?.last_error}
          />
        </div>
      )}

      {currentStep === "reel_review" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm font-bold text-white">{t("teachTasteTitle")}</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {t("teachTasteHint")}{" "}
              {candidates.length > 0
                ? requiredVotes === 1
                  ? t("voteThisReel")
                  : t("voteAtLeastReels", { count: requiredVotes })
                : null}
            </p>
          </div>
          {tasteNotice ? (
            <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-100">
              {tasteNotice}
            </p>
          ) : null}
          {candidatesLoading ? (
            <ReelCandidatesSkeleton />
          ) : candidates.length === 0 ? (
            <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center">
              <p className="text-sm text-zinc-300">{t("noMoreCandidates")}</p>
              <p className="text-xs leading-relaxed text-zinc-500">
                {t("noMoreCandidatesHint")}
              </p>
              <OnboardingPrimaryButton busy={busy} onClick={() => void runPipeline({ broaden: true })}>
                {t("findMoreOpportunities")}
              </OnboardingPrimaryButton>
            </div>
          ) : (
            <>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                {candidates.map((c) => {
                  const id = c.reel?.id ?? "";
                  return (
                    <OnboardingReelVoteCard
                      key={id}
                      row={toScrapedRow(c)}
                      verdict={votes[id]}
                      onVote={(v) => {
                        setTasteNotice(null);
                        setVotes((prev) => ({ ...prev, [id]: v }));
                      }}
                    />
                  );
                })}
              </div>
              <p className="text-center text-xs font-semibold text-zinc-400">
                {t("tasteVotesProgress", { voted: votedCount, required: requiredVotes })}
                {yesReels.length === 0 ? t("needOneYes") : ""}
              </p>
              <OnboardingPrimaryButton busy={busy} onClick={() => void submitVotes()}>
                {busy ? t("savingChoices") : t("saveChoicesContinue")}
              </OnboardingPrimaryButton>
              {poolExhausted && yesReels.length === 0 ? (
                <OnboardingPrimaryButton
                  busy={busy}
                  onClick={() => void runPipeline({ broaden: true })}
                >
                  {t("findMoreBroader")}
                </OnboardingPrimaryButton>
              ) : null}
            </>
          )}
        </div>
      )}

      {currentStep === "first_content" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm font-bold text-white">{t("chooseSeedTitle")}</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {t("chooseSeedHint")}
            </p>
          </div>
          {yesReels.length === 0 ? (
            <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center">
              <p className="text-sm text-zinc-300">
                {t("noYesPicks")}
              </p>
              <OnboardingPrimaryButton
                busy={busy}
                onClick={() => void advance({ current_step: "reel_review" })}
              >
                {t("backToTasteVoting")}
              </OnboardingPrimaryButton>
            </div>
          ) : (
            <>
              {yesReels.map((c) => {
                const id = c.reel?.id ?? "";
                const row = toScrapedRow(c);
                return (
                  <OpportunityCard
                    key={id}
                    reel={row}
                    tone="onboarding"
                    selectable
                    selected={selectedReelId === id}
                    onSelect={() => setSelectedReelId(id)}
                  />
                );
              })}
              <OnboardingPrimaryButton
                busy={busy}
                disabled={!selectedReelId}
                onClick={() => void startFirstContent()}
              >
                {t("generateFirstPost")}
              </OnboardingPrimaryButton>
            </>
          )}
        </div>
      )}

      {currentStep === "editor" && sessionId && (
        <VideoCreateWorkspace
          clientSlug={clientSlug}
          orgSlug={orgSlug}
          sessionId={sessionId}
          entryPoint="onboarding"
          guidedMode
          onGuidedComplete={() => void markAhaAndPlan()}
        />
      )}

      {(currentStep === "action_plan" || currentStep === "tour") && (
        <div className="space-y-5">
          <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/20">
              <Sparkles className="h-6 w-6 text-emerald-300" />
            </div>
            <p className="mt-3 text-xl font-black text-white">
              {t("youreSetUp")}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-300">
              {t("homeShowsPosts")}
            </p>
          </div>
          {actionPlan && Array.isArray((actionPlan as { days?: unknown }).days) ? (
            <ol className="space-y-3">
              {(
                actionPlan as { days: { day: number; title: string; action: string }[] }
              ).days.map((d) => (
                <li
                  key={d.day}
                  className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-300/20 text-xs font-bold text-amber-300">
                    {d.day}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{d.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">{d.action}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-app-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("buildingSevenDayPlan")}
            </div>
          )}
          <OnboardingPrimaryButton onClick={() => void finishTour()}>
            {t("openMyStudio")}
          </OnboardingPrimaryButton>
        </div>
      )}
    </>
  );

  if (!hasTenancy) {
    return (
      <OnboardingShell
        variant="card"
        currentStep={currentStep}
        completedSteps={completedSteps}
        title={heading.title}
        description={heading.description}
        onboardingBypassActive={onboardingBypassActive}
        {...shellBackProps}
      >
        {body}
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      variant={layoutVariant}
      currentStep={currentStep}
      completedSteps={completedSteps}
      title={heading.title}
      description={heading.description}
      onboardingBypassActive={onboardingBypassActive}
      {...shellBackProps}
    >
      {body}
    </OnboardingShell>
  );
}
