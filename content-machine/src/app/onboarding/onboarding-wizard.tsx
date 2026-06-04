"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { ContextEditor } from "@/app/(dashboard)/context/context-editor";
import { OnboardingPipelineProgress } from "@/components/onboarding/onboarding-pipeline-progress";
import { OnboardingReelVoteCard } from "@/components/onboarding/onboarding-reel-vote-card";
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

export function OnboardingWizard({
  hasTenancy,
  clientSlug,
  orgSlug,
  initialStatus,
  initialContext,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatusRow | null>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const [wsStep, setWsStep] = useState<1 | 2>(1);
  const [orgName, setOrgName] = useState("");
  const [orgSlugInput, setOrgSlugInput] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientSlugInput, setClientSlugInput] = useState("");
  const [instagram, setInstagram] = useState("");
  const [language, setLanguage] = useState<"de" | "en">("de");
  const [nicheSummary, setNicheSummary] = useState("");
  const [nicheKeywords, setNicheKeywords] = useState("");

  const [quizAudience, setQuizAudience] = useState("");
  const [quizGoals, setQuizGoals] = useState("");
  const [quizVoice, setQuizVoice] = useState("");
  const [quizCompetitors, setQuizCompetitors] = useState("");
  const [sourceText, setSourceText] = useState("");
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
    if (sourceText.trim().length < 80) {
      setError("Paste at least a short transcript or brief (80+ characters).");
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
                text: sourceText.trim(),
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

  const body = (
    <>
      {error ? <OnboardingError message={error} /> : null}

      {currentStep === "workspace" && (
        <div className="space-y-4">
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
                Continue
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
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "de" | "en")}
                  className={onboardingInputClass}
                >
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                </select>
              </label>
              <OnboardingPrimaryButton busy={busy} onClick={() => void submitWorkspace()}>
                Create workspace
              </OnboardingPrimaryButton>
            </>
          )}
        </div>
      )}

      {currentStep === "quiz" && (
        <div className="space-y-4">
          <label className="block text-sm">
            <span className={onboardingLabelClass}>Ideal audience</span>
            <textarea
              value={quizAudience}
              onChange={(e) => setQuizAudience(e.target.value)}
              rows={2}
              className={onboardingInputClass}
            />
          </label>
          <label className="block text-sm">
            <span className={onboardingLabelClass}>Content goals</span>
            <input
              value={quizGoals}
              onChange={(e) => setQuizGoals(e.target.value)}
              placeholder="Comma-separated"
              className={onboardingInputClass}
            />
          </label>
          <label className="block text-sm">
            <span className={onboardingLabelClass}>Brand voice</span>
            <input
              value={quizVoice}
              onChange={(e) => setQuizVoice(e.target.value)}
              className={onboardingInputClass}
            />
          </label>
          <label className="block text-sm">
            <span className={onboardingLabelClass}>Known competitors</span>
            <input
              value={quizCompetitors}
              onChange={(e) => setQuizCompetitors(e.target.value)}
              placeholder="@handles, comma-separated"
              className={onboardingInputClass}
            />
          </label>
          <OnboardingPrimaryButton busy={busy} onClick={() => void saveQuiz()}>
            Continue
          </OnboardingPrimaryButton>
        </div>
      )}

      {currentStep === "source" && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-app-divider/60 bg-app-chip-bg/30 px-4 py-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
            <p className="text-xs leading-relaxed text-app-fg-muted">
              Sales call transcript, Notion doc, or positioning notes — minimum 80 characters.
              Next step drafts your five strategy sections automatically.
            </p>
          </div>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Paste your material here…"
            className={onboardingTextareaClass}
          />
          <p className="text-right text-[11px] tabular-nums text-app-fg-subtle">
            {sourceText.trim().length} characters
            {sourceText.trim().length < 80 ? " · need 80+" : ""}
          </p>
          <OnboardingPrimaryButton busy={busy} onClick={() => void saveSourceAndContinue()}>
            Draft strategy sections
          </OnboardingPrimaryButton>
        </div>
      )}

      {currentStep === "strategy_docs" && (
        <div className="space-y-6">
          <ContextEditor
            clientSlug={clientSlug}
            orgSlug={orgSlug}
            initialContext={initialContext as never}
            disabled={false}
          />
          <OnboardingPrimaryButton
            busy={busy}
            onClick={() => void advance({ complete_step: "strategy_docs", current_step: "pipeline" })}
          >
            Continue to discovery
          </OnboardingPrimaryButton>
        </div>
      )}

      {currentStep === "pipeline" && (
        <div className="space-y-5">
          <OnboardingPipelineProgress
            phase={pipelinePhase}
            lastError={status?.last_error}
          />
          {pipelineComplete ? (
            <OnboardingPrimaryButton onClick={() => void advance({ current_step: "reel_review" })}>
              Review candidate reels
            </OnboardingPrimaryButton>
          ) : (
            <OnboardingPrimaryButton busy={busy} onClick={() => void runPipeline()}>
              {pipelinePhase && pipelinePhase !== "queued" ? "Discovery running…" : "Start discovery"}
            </OnboardingPrimaryButton>
          )}
        </div>
      )}

      {currentStep === "reel_review" && (
        <div className="space-y-4">
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
          <p className="text-center text-xs text-app-fg-muted">
            {Object.keys(votes).length}/3 minimum votes
          </p>
          <OnboardingPrimaryButton busy={busy} onClick={() => void submitVotes()}>
            Continue
          </OnboardingPrimaryButton>
        </div>
      )}

      {currentStep === "first_content" && (
        <div className="space-y-3">
          {yesReels.length === 0 ? (
            <p className="text-sm text-app-fg-muted">Mark at least one reel as Yes first.</p>
          ) : (
            yesReels.map((c) => {
              const id = c.reel?.id ?? "";
              const row = toScrapedRow(c);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedReelId(id)}
                  className={cn(
                    "flex w-full gap-3 rounded-xl border p-3 text-left transition",
                    selectedReelId === id
                      ? "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/30"
                      : "border-app-card-border hover:border-amber-500/30",
                  )}
                >
                  <span className="line-clamp-2 flex-1 text-sm text-app-fg">
                    {row.caption?.slice(0, 140) ?? row.post_url ?? id}
                  </span>
                  {selectedReelId === id ? (
                    <Check className="h-5 w-5 shrink-0 text-amber-500" />
                  ) : null}
                </button>
              );
            })
          )}
          <OnboardingPrimaryButton
            busy={busy}
            disabled={!selectedReelId}
            onClick={() => void startFirstContent()}
          >
            Create first content
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
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
              First export complete — your creator brain is live.
            </p>
          </div>
          {actionPlan && Array.isArray((actionPlan as { days?: unknown }).days) ? (
            <ol className="space-y-3">
              {(
                actionPlan as { days: { day: number; title: string; action: string }[] }
              ).days.map((d) => (
                <li
                  key={d.day}
                  className="flex gap-3 rounded-xl border border-app-card-border bg-app-card/20 p-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-700 dark:text-amber-300">
                    {d.day}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-app-fg">{d.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-app-fg-muted">{d.action}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-app-fg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Building your 7-day plan…
            </div>
          )}
          <OnboardingPrimaryButton onClick={() => void finishTour()}>
            Open dashboard
          </OnboardingPrimaryButton>
        </div>
      )}
    </>
  );

  if (!hasTenancy) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-zinc-100 px-4 py-10 dark:bg-zinc-950">
        <article className="glass w-full max-w-md rounded-2xl border border-app-card-border shadow-lg">
          <header className="border-b border-app-divider/60 px-8 py-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
              Setup
            </p>
            <h1 className="mt-2 text-xl font-bold text-app-fg">{heading.title}</h1>
            <p className="mt-2 text-sm text-app-fg-muted">{heading.description}</p>
          </header>
          <div className="px-8 py-6">{body}</div>
        </article>
      </main>
    );
  }

  return (
    <OnboardingShell
      currentStep={currentStep}
      completedSteps={completedSteps}
      title={heading.title}
      description={heading.description}
      wide={wideStep}
    >
      {body}
    </OnboardingShell>
  );
}
