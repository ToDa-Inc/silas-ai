"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Brain, ChevronDown, FileText, Loader2, Sparkles } from "lucide-react";
import { ContextEditor } from "@/app/(dashboard)/context/context-editor";
import { OnboardingPipelineProgress } from "@/components/onboarding/onboarding-pipeline-progress";
import { OnboardingReelVoteCard } from "@/components/onboarding/onboarding-reel-vote-card";
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
  generateOnboardingActionPlan,
  patchOnboardingStatus,
  postOnboardingReelFeedback,
  startOnboardingFirstContent,
  startOnboardingPipeline,
  type OnboardingReelCandidate,
} from "@/lib/api-client";
import {
  ONBOARDING_STEP_ORDER,
  STEP_HEADINGS,
  type OnboardingStepKey,
} from "@/lib/onboarding-ui";
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

function PreviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 hover:border-amber-300/20 hover:bg-white/[0.03] transition-all duration-300 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/90 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        {label}
      </p>
      <p className="mt-2.5 text-sm leading-relaxed text-zinc-300 font-medium whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export function OnboardingWizard({
  hasTenancy,
  clientSlug,
  orgSlug,
  initialStatus,
  initialContext,
  onboardingBypassActive = false,
}: Props) {
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
  const [language, setLanguage] = useState<"de" | "en">("de");
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
  const [candidates, setCandidates] = useState<OnboardingReelCandidate[]>([]);
  const [votes, setVotes] = useState<Record<string, "yes" | "no">>({});
  const [selectedReelId, setSelectedReelId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [actionPlan, setActionPlan] = useState<Record<string, unknown> | null>(
    (initialStatus?.action_plan as Record<string, unknown>) ?? null,
  );

  const currentStep: OnboardingStepKey = useMemo(() => {
    if (!hasTenancy) return "workspace";
    const s = (status?.current_step || "quiz") as OnboardingStepKey;
    return ONBOARDING_STEP_ORDER.includes(s) ? s : "quiz";
  }, [hasTenancy, status?.current_step]);

  const completedSteps = status?.completed_steps ?? [];
  const heading = STEP_HEADINGS[currentStep] ?? STEP_HEADINGS.quiz;
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
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        setError(j.error ?? `Error ${r.status}`);
        return;
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
      const { clientApiHeaders, getContentApiBase } = await import("@/lib/api-client");
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

      const putRes = await fetch(
        `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}`,
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ client_context: clientContext }),
        },
      );
      if (!putRes.ok) {
        const j = (await putRes.json().catch(() => ({}))) as { detail?: string };
        setError(typeof j.detail === "string" ? j.detail : `Save failed (${putRes.status})`);
        return;
      }
      await advance({ current_step: "strategy_docs", complete_step: "source" });
    } finally {
      setBusy(false);
    }
  }

  async function runPipeline() {
    const r = await startOnboardingPipeline(clientSlug, orgSlug);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    await advance({ current_step: "pipeline" });
    void refreshStatus();
  }

  async function submitVotes() {
    const items = Object.entries(votes).map(([scraped_reel_id, verdict]) => ({
      scraped_reel_id,
      verdict,
    }));
    if (items.length < 3) {
      setError("Vote on at least 3 candidate reels (Yes or No).");
      return;
    }
    const r = await postOnboardingReelFeedback(clientSlug, orgSlug, items);
    if (!r.ok) {
      setError(r.error);
      return;
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
  const votedCount = Object.keys(votes).length;
  const sourceLength = sourceText.trim().length;
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

  const workspaceQuestions: OnbQuestion[] = [
    {
      question: "What's your organization name?",
      helper: "Your company or umbrella brand — it groups all your creators and clients.",
      example: "e.g. Prism Studio",
      validate: () => (orgName.trim() ? null : "Organization name is required."),
      node: (
        <input
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          className={qInputClass}
          placeholder="Prism Studio"
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

  const quizQuestions: OnbQuestion[] = [
    {
      question: "Who's your ideal audience?",
      helper:
        "Describe the follower or client you want to reach — who they are and what they struggle with.",
      example: "e.g. B2B startup founders who want to grow on LinkedIn without hiring an agency",
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
      helper: "What do you want your content to achieve? Separate several with commas.",
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
      helper: "The tone and style you want to communicate with.",
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
        "Your main offer: what it is, the price range, the core promise, and the objections people usually raise.",
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
        "Go deeper than the niche: the concrete frustrations they feel today and the outcome they're dreaming of.",
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
        "How you started, a turning point, or real anecdotes and examples — only what's actually true.",
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
        "Your positioning and what makes you different — values, method, or a point of view your competitors don't have.",
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
        "The tone, plus any words or phrases you love to use — and ones you want to avoid.",
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

  if (currentStep === "workspace" || currentStep === "quiz") {
    const flow = stepFlow[currentStep];
    const questions = flow.questions;
    const safeIdx = Math.min(qIdx, questions.length - 1);
    const q = questions[safeIdx];
    const isLast = safeIdx >= questions.length - 1;
    const stepHeading = STEP_HEADINGS[currentStep];

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
        {q.node}
      </OnboardingQuestionScreen>
    );
  }

  if (currentStep === "source") {
    const stepHeading = STEP_HEADINGS.source;

    if (sourceMode === null) {
      return (
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
              className="flex flex-col gap-1 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-4 text-left transition hover:border-amber-500/70 hover:bg-amber-500/10"
            >
              <span className="flex items-center gap-2">
                <span className="text-sm font-bold text-on-surface">Answer a few questions</span>
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
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
              className="flex flex-col gap-1 rounded-xl border border-outline-variant/20 bg-surface-container-low p-4 text-left transition hover:border-amber-500/50 hover:bg-surface-container-high"
            >
              <span className="text-sm font-bold text-on-surface">Paste my material</span>
              <span className="text-xs leading-relaxed text-zinc-500">
                Transcript, sales call, or a doc — we extract everything from it.
              </span>
            </button>
          </div>
        </OnboardingQuestionScreen>
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
        submitLabel="Draft strategy sections"
        onBack={() => {
          setError(null);
          if (safeIdx > 0) setQIdx((i) => Math.max(0, i - 1));
          else setSourceMode(null);
        }}
        onContinue={handleContinue}
      >
        {q.node}
      </OnboardingQuestionScreen>
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
          <div className="grid gap-3 md:grid-cols-2">
            <PreviewCard label="Audience" value={brainPreview.audience} />
            <PreviewCard label="Content goals" value={brainPreview.goals} />
            <PreviewCard label="Voice" value={brainPreview.voice} />
            <PreviewCard label="Offer" value={brainPreview.offer} />
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
            <p className="text-xl font-black text-white">Silas is crafting your Creator Brain...</p>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-zinc-400">
              We are compiling your brand positioning, analyzing adjacent creator spaces, and crawling top-performing competitor strategies to prepare your custom insights.
            </p>
          </div>
          <OnboardingPipelineProgress
            phase={pipelinePhase}
            lastError={status?.last_error}
          />
          {pipelineComplete ? (
            <OnboardingPrimaryButton onClick={() => void advance({ current_step: "reel_review" })}>
              Show me the best opportunities
            </OnboardingPrimaryButton>
          ) : (
            <OnboardingPrimaryButton busy={busy} onClick={() => void runPipeline()}>
              {pipelinePhase && pipelinePhase !== "queued" ? "Discovery is running..." : "Start AI discovery"}
            </OnboardingPrimaryButton>
          )}
        </div>
      )}

      {currentStep === "reel_review" && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-sm font-bold text-white">Your job: teach taste, not strategy.</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Mark what feels useful and on-brand. Three votes are enough for Silas to adapt the first piece with better judgment.
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
            {votedCount}/3 minimum taste votes
          </p>
          <OnboardingPrimaryButton busy={busy} onClick={() => void submitVotes()}>
            Use these signals
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
    >
      {body}
    </OnboardingShell>
  );
}
