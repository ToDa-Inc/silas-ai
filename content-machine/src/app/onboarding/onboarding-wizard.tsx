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
import { useLocale } from "next-intl";
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

  useEffect(() => {
    if (currentStep !== "reel_review" && currentStep !== "first_content") return;
    setCandidatesLoading(true);
    void (async () => {
      const r = await fetchOnboardingReelCandidates(clientSlug, orgSlug);
      if (r.ok) {
        setCandidates(r.data);
        const v: Record<string, "yes" | "no"> = {};
        for (const c of r.data) {
          const id = c.reel?.id;
          if (id && c.already_voted) v[id] = c.already_voted as "yes" | "no";
        }
        setVotes(v);
      }
      setCandidatesLoading(false);
    })();
  }, [currentStep, clientSlug, orgSlug]);

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
      setError("Creator / brand name is required.");
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
    push("Transcript / notes", sourceText);
    push("Offer", srcOffer);
    push("Ideal client — pains & desires", srcIcp);
    push("Story / origin", srcStory);
    push("Positioning & differentiators", srcPositioning);
    push("Tone & phrases", srcTone);
    return parts.join("\n\n");
  }

  async function saveSourceAndContinue() {
    const combined = buildSourceTranscript().trim();
    if (!combined) {
      await advance({ current_step: "strategy_docs", complete_step: "source" });
      return;
    }
    if (combined.length < 80) {
      setError(
        "Add a bit more detail (80+ characters total), or go back and clear fields to skip for now.",
      );
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

  async function runPipeline() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await startOnboardingPipeline(clientSlug, orgSlug);
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
          ? "Vote on the candidate reel (Yes or No) before continuing."
          : `Vote on at least ${requiredVotes} candidate reels (Yes or No).`,
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await postOnboardingReelFeedback(clientSlug, orgSlug, items);
      if (!r.ok) {
        setError(r.error);
        return;
      }
    } finally {
      setBusy(false);
    }
    await advance({ complete_step: "reel_review", current_step: "first_content" });
  }

  async function startFirstContent() {
    if (!selectedReelId) {
      setError("Pick one reel you marked Yes.");
      return;
    }
    setBusy(true);
    try {
      const r = await startOnboardingFirstContent(clientSlug, orgSlug, selectedReelId);
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
    router.replace("/dashboard");
    router.refresh();
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
      "Your ideal audience will be shaped from your answers and source material.",
    goals:
      splitList(quizGoals).join(", ") ||
      ((status?.quiz_answers?.content_goals as string[] | undefined)?.join(", ") ?? "") ||
      "Your first content angles will appear here.",
    voice:
      quizVoice.trim() ||
      String(status?.quiz_answers?.brand_voice || "").trim() ||
      "Silas will infer tone from your examples and notes.",
    offer:
      quizOffers.trim() ||
      String(status?.quiz_answers?.offers || "").trim() ||
      "Add what you sell or promote so the AI can aim the content.",
  };

  const documentPreviews = {
    icp: sectionText("icp", brainPreview.audience),
    brand_map: sectionText("brand_map", brainPreview.offer),
    story_board: sectionText("story_board", "Your origin stories and key anecdotes will appear here."),
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
      Reading your Instagram…
    </p>
  ) : null;

  const workspaceQuestions: OnbQuestion[] = [
    {
      question: "What should we call your workspace?",
      helper: "This is your home base in Silas — name it after your brand, studio, or yourself.",
      example: "e.g. Toni Mora Studio",
      validate: () => (orgName.trim() ? null : "Workspace name is required."),
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
      question: "What's the creator or brand name?",
      helper: "The creator or personal brand you'll be making content for.",
      example: "e.g. Toni Mora",
      validate: () => (clientName.trim() ? null : "Creator / brand name is required."),
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
      question: "What's the Instagram handle?",
      helper: "We use it to analyze your reels and others in your niche. You can add it later.",
      example: "e.g. @tonimora",
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
      question: "Which language should we create in?",
      helper: "The main language your content will be generated in.",
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

  const igNote = (key: string) =>
    autofilledKeys.has(key) ? " ✨ Pre-filled from your Instagram — edit freely." : "";

  const quizQuestions: OnbQuestion[] = [
    {
      question: "Who's your ideal audience?",
      helper:
        "Describe the follower or client you want to reach — who they are and what they struggle with." +
        igNote("audience"),
      example:
        "e.g. Busy moms in their 30s who want quick healthy meals without spending hours meal prepping",
      validate: () => (quizAudience.trim() ? null : "Tell us who you want to reach."),
      node: (
        <textarea
          value={quizAudience}
          onChange={(e) => setQuizAudience(e.target.value)}
          rows={3}
          className={qInputClass}
          placeholder="Describe your ideal audience…"
          autoFocus
        />
      ),
    },
    {
      question: "What are your content goals?",
      helper:
        "What do you want your content to achieve? Separate several with commas." + igNote("goals"),
      example: "e.g. leads, brand authority, sell my course",
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
      question: "How would you describe your brand voice?",
      helper: "The tone and style you want to communicate with." + igNote("voice"),
      example: "e.g. friendly and direct, with humor but data-backed",
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
      question: "What do you sell or promote?",
      helper:
        "Your main product, service, or offer — what you want your content to drive people toward." +
        igNote("offer"),
      example: "e.g. A 12-week fitness coaching program, $497/month",
      optional: true,
      node: (
        <textarea
          value={quizOffers}
          onChange={(e) => setQuizOffers(e.target.value)}
          rows={3}
          className={qInputClass}
          placeholder="What you sell, price range, or main call-to-action…"
          autoFocus
        />
      ),
    },
    {
      question: "Any creators you treat as competitors or references?",
      helper:
        "Instagram accounts in your niche you admire or use as a reference. Separate several with commas.",
      example: "e.g. @creator1, @creator2",
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
    question: "Paste your material",
    helper:
      "A sales-call transcript, onboarding doc, or positioning notes — we'll extract your offer, audience, story, positioning and tone from it.",
    optional: true,
    node: (
      <textarea
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        rows={10}
        className={qInputClass}
        placeholder="Paste your transcript, call notes, or brief here…"
        autoFocus
      />
    ),
  };

  const sourceDiscoveryQuestions: OnbQuestion[] = [
    {
      question: "What do you sell, and to whom?",
      helper:
        "Your main offer: what it is, the price range, the core promise, and the objections people usually raise." +
        igNote("offer"),
      example:
        "e.g. A 12-week group program for B2B founders, ~$3k. Promise: a predictable inbound pipeline. Common objection: “I don't have time to post.”",
      optional: true,
      node: (
        <textarea
          value={srcOffer}
          onChange={(e) => setSrcOffer(e.target.value)}
          rows={4}
          className={qInputClass}
          placeholder="What you sell, price, promise, common objections…"
          autoFocus
        />
      ),
    },
    {
      question: "What does your ideal client struggle with — and what do they want?",
      helper:
        "Go deeper than the niche: the concrete frustrations they feel today and the outcome they're dreaming of." +
        igNote("icp"),
      example:
        "e.g. Frustrated: posting for months with no leads. Wants: to be seen as the go-to expert and book calls every week.",
      optional: true,
      node: (
        <textarea
          value={srcIcp}
          onChange={(e) => setSrcIcp(e.target.value)}
          rows={4}
          className={qInputClass}
          placeholder="Their pains today and the outcome they want…"
          autoFocus
        />
      ),
    },
    {
      question: "What's your story or origin?",
      helper:
        "How you started, a turning point, or real anecdotes and examples — only what's actually true." +
        igNote("story"),
      example:
        "e.g. Left a corporate sales job after burning out, rebuilt a pipeline from zero in 90 days, now teach the same system.",
      optional: true,
      node: (
        <textarea
          value={srcStory}
          onChange={(e) => setSrcStory(e.target.value)}
          rows={4}
          className={qInputClass}
          placeholder="How it started, turning points, real examples…"
          autoFocus
        />
      ),
    },
    {
      question: "Why you, and not someone else?",
      helper:
        "Your positioning and what makes you different — values, method, or a point of view your competitors don't have." +
        igNote("positioning"),
      example:
        "e.g. The only one combining cold outreach with organic content. Data-driven, no fluff, no “hustle culture”.",
      optional: true,
      node: (
        <textarea
          value={srcPositioning}
          onChange={(e) => setSrcPositioning(e.target.value)}
          rows={4}
          className={qInputClass}
          placeholder="Your edge, values, method, point of view…"
          autoFocus
        />
      ),
    },
    {
      question: "How should your content sound?",
      helper:
        "The tone, plus any words or phrases you love to use — and ones you want to avoid." +
        igNote("tone"),
      example:
        "e.g. Confident and warm. Use “pipeline”, “system”. Avoid “guru”, “crush it”, and emojis in every line.",
      optional: true,
      node: (
        <textarea
          value={srcTone}
          onChange={(e) => setSrcTone(e.target.value)}
          rows={4}
          className={qInputClass}
          placeholder="Tone, words to use, words to avoid…"
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
      submitLabel: "Create workspace",
      onSubmit: submitWorkspace,
    },
    quiz: { questions: quizQuestions, submitLabel: "Continue", onSubmit: saveQuiz },
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
            question="How do you want to set up your strategy?"
            helper="Either answer a few quick questions, or paste material you already have — either way we turn it into your strategy."
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
                  <span className="text-sm font-bold text-white">Answer a few questions</span>
                  <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                    Recommended
                  </span>
                </span>
                <span className="text-xs leading-relaxed text-zinc-500">
                  ~5 quick questions to map your project. We draft your strategy from your answers.
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
                <span className="text-sm font-bold text-white">Paste my material</span>
                <span className="text-xs leading-relaxed text-zinc-500">
                  Transcript, sales call, or a doc — we extract everything from it.
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
          submitLabel="Build my strategy"
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
                  <p className="text-lg font-black text-white">Silas has enough to start.</p>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    This is the lightweight version of your Creator Brain. The full editor is still available below, but the onboarding goal is to get you to a useful first content opportunity quickly.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-bold text-white">What happens next</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                We&apos;ll compile this into discovery inputs, look for similar creators, score outlier reels, and ask you to approve what actually feels on-brand.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <StrategyDocPreviewCard label="ICP" value={documentPreviews.icp} locked={contextLocked} />
            <StrategyDocPreviewCard label="Brand Map" value={documentPreviews.brand_map} locked={contextLocked} />
            <StrategyDocPreviewCard label="Storyboard" value={documentPreviews.story_board} locked={contextLocked} />
            <StrategyDocPreviewCard
              label="Communication Guideline"
              value={documentPreviews.communication_guideline}
              locked={contextLocked}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFullBrainEditor((v) => !v)}
            className="text-sm font-bold text-amber-300 hover:text-amber-200"
          >
            {showFullBrainEditor ? "Hide full brain editor" : "Review full brain editor"}
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
            Start finding content opportunities
          </OnboardingPrimaryButton>
        </div>
      )}

      {currentStep === "pipeline" && (
        <div className="space-y-5">
          <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-6 text-center shadow-lg">
            <p className="text-xl font-black text-white">Silas is scanning your niche…</p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-400">
              We compile your Creator Brain, find adjacent creators, and pull a small set of trending niche reels so you can teach taste — not scrape your whole Instagram history.
            </p>
          </div>

          {/* Primary action lives right under the intro — not buried below the
              phase list — and discovery also starts itself automatically. */}
          {pipelineComplete ? (
            <OnboardingPrimaryButton onClick={() => void advance({ current_step: "reel_review" })}>
              Show me the best opportunities
            </OnboardingPrimaryButton>
          ) : pipelineFailed ? (
            <OnboardingPrimaryButton busy={busy} onClick={() => void runPipeline()}>
              Retry discovery
            </OnboardingPrimaryButton>
          ) : !pipelinePhase ? (
            <OnboardingPrimaryButton busy={busy} onClick={() => void runPipeline()}>
              Start AI discovery
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
            <p className="text-sm font-bold text-white">Your job: teach taste, not strategy.</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Mark what feels useful and on-brand.{" "}
              {requiredVotes === 1
                ? "One vote is enough for Silas to adapt the first piece with better judgment."
                : `${requiredVotes} votes are enough for Silas to adapt the first piece with better judgment.`}
            </p>
          </div>
          {candidatesLoading ? (
            <ReelCandidatesSkeleton />
          ) : candidates.length === 0 ? (
            <div className="glass-inset rounded-xl px-4 py-8 text-center text-sm text-app-fg-muted">
              <p>No candidates yet. Discovery may still be gathering reels.</p>
              <button
                type="button"
                onClick={() => void refreshStatus()}
                className="mt-3 text-xs font-semibold text-amber-600 hover:underline dark:text-amber-400"
              >
                Refresh status
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {candidates.map((c) => {
                const id = c.reel?.id ?? "";
                return (
                  <OnboardingReelVoteCard
                    key={id}
                    row={toScrapedRow(c)}
                    score={c.score}
                    verdict={votes[id]}
                    onVote={(v) => setVotes((prev) => ({ ...prev, [id]: v }))}
                  />
                );
              })}
            </div>
          )}
          <p className="text-center text-xs font-semibold text-zinc-400">
            {votedCount}/{requiredVotes} minimum taste votes
          </p>
          <OnboardingPrimaryButton busy={busy} onClick={() => void submitVotes()}>
            Save my choices and continue
          </OnboardingPrimaryButton>
        </div>
      )}

      {currentStep === "first_content" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm font-bold text-white">Choose the seed for your first post.</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Pick the YES opportunity you&apos;d be proud to adapt. Silas will use the reel as structure, not as a copy-paste template.
            </p>
          </div>
          {yesReels.length === 0 ? (
            <p className="text-sm text-app-fg-muted">Mark at least one reel as Yes first.</p>
          ) : (
            yesReels.map((c) => {
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
            })
          )}
          <OnboardingPrimaryButton
            busy={busy}
            disabled={!selectedReelId}
            onClick={() => void startFirstContent()}
          >
            Generate my first post
          </OnboardingPrimaryButton>
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
              You&apos;re set up. Your first post is ready to review.
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-300">
              Home now shows posts picked for your niche — adapt, export, and keep going from there.
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
              Building your 7-day plan...
            </div>
          )}
          <OnboardingPrimaryButton onClick={() => void finishTour()}>
            Open my studio
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
