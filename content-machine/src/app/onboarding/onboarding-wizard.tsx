"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, ChevronDown, FileText, Loader2, Sparkles } from "lucide-react";
import { ContextEditor } from "@/app/(dashboard)/context/context-editor";
import { OnboardingPipelineProgress } from "@/components/onboarding/onboarding-pipeline-progress";
import { OnboardingReelVoteCard } from "@/components/onboarding/onboarding-reel-vote-card";
import { OpportunityCard } from "@/components/home/opportunity-card";
import {
  OnboardingError,
  OnboardingPrimaryButton,
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
  onboardingInputClass,
  onboardingLabelClass,
  onboardingTextareaClass,
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

  const [wsStep, setWsStep] = useState<1 | 2>(1);
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

  async function saveSourceAndContinue() {
    const trimmedSource = sourceText.trim();
    if (!trimmedSource) {
      await advance({ current_step: "strategy_docs", complete_step: "source" });
      return;
    }
    if (trimmedSource.length < 80) {
      setError("Add a little more context (80+ characters), or clear this box and skip it for now.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { clientApiHeaders, getContentApiBase } = await import("@/lib/api-client");
      const base = getContentApiBase();
      const headers = await clientApiHeaders({ orgSlug });
      const putRes = await fetch(
        `${base}/api/v1/clients/${encodeURIComponent(clientSlug)}`,
        {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            client_context: {
              onboarding_transcript: {
                text: trimmedSource,
                source: "manual",
                file: null,
                updated_at: new Date().toISOString(),
              },
            },
          }),
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

  const body = (
    <>
      {error ? <OnboardingError message={error} /> : null}

      {currentStep === "workspace" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3">
            <p className="text-sm font-semibold text-amber-100">
              In a few minutes, Silas should know who you are and what kind of content to find for you.
            </p>
          </div>
          {wsStep === 1 ? (
            <>
              <label className="block text-sm">
                <span className={onboardingLabelClass}>Organization name</span>
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className={onboardingInputClass}
                  placeholder="e.g. Prism Studio"
                />
              </label>
              <OnboardingPrimaryButton
                onClick={() => {
                  if (!orgName.trim()) {
                    setError("Organization name is required.");
                    return;
                  }
                  setError(null);
                  setWsStep(2);
                }}
              >
                Continue to creator profile
              </OnboardingPrimaryButton>
            </>
          ) : (
            <>
              <label className="block text-sm">
                <span className={onboardingLabelClass}>Creator / brand name</span>
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className={onboardingInputClass}
                  placeholder="e.g. Dani"
                />
              </label>
              <label className="block text-sm">
                <span className={onboardingLabelClass}>Instagram handle</span>
                <input
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@username"
                  className={onboardingInputClass}
                />
              </label>
              <label className="block text-sm">
                <span className={onboardingLabelClass}>Language</span>
                <div className="relative mt-1">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as "de" | "en")}
                    className={cn(onboardingInputClass, "appearance-none pr-10 cursor-pointer")}
                  >
                    <option value="de" className="bg-zinc-950 text-white">Deutsch</option>
                    <option value="en" className="bg-zinc-950 text-white">English</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-500">
                    <ChevronDown className="h-4 w-4" />
                  </div>
                </div>
              </label>
              <OnboardingPrimaryButton busy={busy} onClick={() => void submitWorkspace()}>
                Create my Creator Brain
              </OnboardingPrimaryButton>
            </>
          )}
        </div>
      )}

      {currentStep === "quiz" && (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className={onboardingLabelClass}>Who do you want to attract?</span>
            <textarea
              value={quizAudience}
              onChange={(e) => setQuizAudience(e.target.value)}
              rows={2}
              className={onboardingInputClass}
              placeholder="e.g. B2B founders who want better outbound systems without hiring a huge team"
            />
          </label>
          <label className="block text-sm">
            <span className={onboardingLabelClass}>What should the content help you do?</span>
            <input
              value={quizGoals}
              onChange={(e) => setQuizGoals(e.target.value)}
              placeholder="Book calls, build authority, sell a program"
              className={onboardingInputClass}
            />
          </label>
          <label className="block text-sm">
            <span className={onboardingLabelClass}>How should it sound?</span>
            <input
              value={quizVoice}
              onChange={(e) => setQuizVoice(e.target.value)}
              placeholder="Direct, sharp, contrarian, practical"
              className={onboardingInputClass}
            />
          </label>
          <label className="block text-sm">
            <span className={onboardingLabelClass}>Offer or product</span>
            <input
              value={quizOffers}
              onChange={(e) => setQuizOffers(e.target.value)}
              placeholder="What do you sell, promote, or want people to do?"
              className={onboardingInputClass}
            />
          </label>
          <label className="block text-sm">
            <span className={onboardingLabelClass}>Creators we should learn near</span>
            <input
              value={quizCompetitors}
              onChange={(e) => setQuizCompetitors(e.target.value)}
              placeholder="@handles, comma-separated"
              className={onboardingInputClass}
            />
          </label>
          <OnboardingPrimaryButton busy={busy} onClick={() => void saveQuiz()}>
            Shape my discovery
          </OnboardingPrimaryButton>
        </div>
      )}

      {currentStep === "source" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-zinc-100">Give Silas your real words.</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Paste a call transcript, positioning notes, website copy, or a messy brain dump. This is optional, but it makes the output sound less generic.
              </p>
            </div>
          </div>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Paste notes here. Example: who you serve, the promise, common objections, stories, beliefs, phrases you use often..."
            className={onboardingTextareaClass}
          />
          <p className="text-right text-[11px] tabular-nums text-app-fg-subtle">
            {sourceLength} characters
            {sourceLength > 0 && sourceLength < 80 ? " · need 80+ or clear to skip" : ""}
          </p>
          <OnboardingPrimaryButton busy={busy} onClick={() => void saveSourceAndContinue()}>
            {sourceLength > 0 ? "Build my brain preview" : "Skip for now"}
          </OnboardingPrimaryButton>
        </div>
      )}

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
