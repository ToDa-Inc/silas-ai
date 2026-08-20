"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { OnboardingVoiceRecorder } from "@/components/onboarding/onboarding-voice-recorder";
import { OnboardingVoiceReview } from "@/components/onboarding/onboarding-voice-review";
import {
  OnboardingError,
  OnboardingPrimaryButton,
  OnboardingQuestionScreen,
  OnboardingShell,
} from "@/components/onboarding/onboarding-shell";
import type { OnboardingStatus } from "@/lib/api/onboarding";
import {
  fetchOnboardingStatusClient,
  startOnboardingBrainGenerate,
  submitOnboardingVoiceText,
  uploadOnboardingVoice,
} from "@/lib/api/onboarding";
import { ONBOARDING_VOICE_QUESTIONS, type OnboardingLang } from "@/lib/onboarding-voice-questions";
import type { OnboardingStepKey } from "@/lib/onboarding-ui";
import { useOnboardingLang } from "@/lib/use-onboarding-lang";

type VoiceTranscriptState = {
  status?: string;
  raw_transcript?: string;
  structured_answers?: Record<string, string>;
  edited_answers?: Record<string, string>;
  error?: string;
  generate_error?: string;
  language?: OnboardingLang;
};

type Props = {
  clientSlug: string;
  orgSlug: string;
  status: OnboardingStatus | null;
  currentStep: OnboardingStepKey;
  completedSteps: string[];
  stepTitle: string;
  stepDescription: string;
  /** Content / transcription language — defaults to app UI locale. */
  language?: OnboardingLang;
  onboardingBypassActive?: boolean;
  onStatus: (s: OnboardingStatus) => void;
  onError: (msg: string | null) => void;
};

function emptyAnswers(): Record<string, string> {
  return Object.fromEntries(ONBOARDING_VOICE_QUESTIONS.map((q) => [q.id, ""]));
}

function hasReviewableAnswers(answers: Record<string, string>): boolean {
  return ONBOARDING_VOICE_QUESTIONS.some((q) => (answers[q.id] ?? "").trim().length > 0);
}

/** Stable fingerprint so status polls with identical answer payloads don't wipe local typing. */
function answersFingerprint(answers: Record<string, string> | undefined): string {
  if (!answers || Object.keys(answers).length === 0) return "";
  return ONBOARDING_VOICE_QUESTIONS.map((q) => `${q.id}:${answers[q.id] ?? ""}`).join("\n");
}

export function OnboardingVoiceStep({
  clientSlug,
  orgSlug,
  status,
  currentStep,
  completedSteps,
  stepTitle,
  stepDescription,
  language: languageProp,
  onboardingBypassActive,
  onStatus,
  onError,
}: Props) {
  const t = useTranslations("onboarding");
  const appLang = useOnboardingLang();
  const language = languageProp ?? appLang;
  const [mode, setMode] = useState<"voice" | "type">("voice");
  const [answers, setAnswers] = useState<Record<string, string>>(emptyAnswers());
  const [busy, setBusy] = useState(false);
  const [forceRecorder, setForceRecorder] = useState(false);
  const hydratedAnswersFpRef = useRef<string>("");

  const voice = (status?.voice_transcript ?? {}) as VoiceTranscriptState;
  const voiceStatus = String(voice.status || "");
  const reviewLang: OnboardingLang =
    voice.language === "en" || voice.language === "de" ? voice.language : language;
  const canReview = hasReviewableAnswers(answers);

  // Hydrate from server only when the *content* of answers changes (new transcription /
  // generate). Status polling returns new object identities every few seconds — comparing
  // by reference was resetting local edits mid-keystroke ("typing goes backwards").
  useEffect(() => {
    const structured = voice.structured_answers;
    const edited = voice.edited_answers;
    const source =
      edited && Object.keys(edited).length > 0
        ? edited
        : structured && Object.keys(structured).length > 0
          ? structured
          : null;
    if (!source) return;
    const fp = answersFingerprint(source);
    if (!fp || fp === hydratedAnswersFpRef.current) return;
    hydratedAnswersFpRef.current = fp;
    setAnswers({ ...emptyAnswers(), ...source });
  }, [voice.structured_answers, voice.edited_answers]);

  const refresh = useCallback(async () => {
    const r = await fetchOnboardingStatusClient(clientSlug, orgSlug);
    if (r.ok) onStatus(r.data);
  }, [clientSlug, orgSlug, onStatus]);

  useEffect(() => {
    const polling =
      voiceStatus === "pending" ||
      voiceStatus === "transcribing" ||
      voiceStatus === "queued_generate" ||
      voiceStatus === "generating";
    if (!polling) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [voiceStatus, refresh]);

  async function handleUpload(blob: Blob, format: string) {
    onError(null);
    setBusy(true);
    try {
      const r = await uploadOnboardingVoice(clientSlug, orgSlug, blob, format, "auto");
      if (!r.ok) throw new Error(r.error);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitText(text: string) {
    onError(null);
    setBusy(true);
    try {
      const r = await submitOnboardingVoiceText(clientSlug, orgSlug, text);
      if (!r.ok) throw new Error(r.error);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate(submitAnswers: Record<string, string>) {
    const filled = Object.fromEntries(
      Object.entries(submitAnswers).filter(([, v]) => v.trim()),
    );
    if (Object.keys(filled).length === 0) {
      onError(t("voiceNeedOneAnswer"));
      return;
    }
    onError(null);
    setBusy(true);
    try {
      const r = await startOnboardingBrainGenerate(clientSlug, orgSlug, filled);
      if (!r.ok) throw new Error(r.error);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (voiceStatus === "pending" || voiceStatus === "transcribing") {
      setForceRecorder(false);
    }
  }, [voiceStatus]);

  const showReview =
    !forceRecorder &&
    (voiceStatus === "transcribed" ||
      voiceStatus === "ready" ||
      voiceStatus === "generate_failed" ||
      (voiceStatus === "failed" && canReview));
  const showGenerating =
    voiceStatus === "queued_generate" || voiceStatus === "generating";
  const showTranscribing =
    (voiceStatus === "pending" || voiceStatus === "transcribing") && !voice.error;
  const generateFailed = voiceStatus === "generate_failed" || (voiceStatus === "failed" && canReview);
  const transcribeFailed = voiceStatus === "failed" && !canReview;

  let body: React.ReactNode;
  if (mode === "type") {
    body = (
      <div className="space-y-4">
        <p className="text-xs text-zinc-500">{t("voiceTypeHint")}</p>
        <OnboardingVoiceReview answers={answers} onChange={setAnswers} disabled={busy} language={language} />
        <OnboardingPrimaryButton busy={busy} onClick={() => void handleGenerate(answers)}>
          {t("voiceBuildBrain")}
        </OnboardingPrimaryButton>
      </div>
    );
  } else if (showTranscribing || showGenerating) {
    body = (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-300" />
        <p className="text-sm font-semibold text-white">
          {showGenerating ? t("voiceBuildingDocs") : t("voiceTranscribing")}
        </p>
        <p className="text-xs text-zinc-500">{t("voiceUsuallyUnderMinute")}</p>
      </div>
    );
  } else if (showReview) {
    body = (
      <div className="space-y-4">
        <OnboardingVoiceReview
          answers={answers}
          onChange={setAnswers}
          rawTranscript={voice.raw_transcript}
          disabled={busy}
          language={reviewLang}
        />
        <OnboardingPrimaryButton busy={busy} onClick={() => void handleGenerate(answers)}>
          {generateFailed ? t("voiceRetryBuild") : voiceStatus === "ready" ? t("voiceBuildBrain") : t("voiceLooksGoodBuild")}
        </OnboardingPrimaryButton>
        <button
          type="button"
          onClick={() => {
            onError(null);
            hydratedAnswersFpRef.current = "";
            setForceRecorder(true);
            setMode("voice");
          }}
          disabled={busy}
          className="text-sm font-bold text-zinc-500 underline-offset-2 hover:text-amber-300 hover:underline disabled:opacity-50"
        >
          {t("voiceRecordAgain")}
        </button>
      </div>
    );
  } else {
    body = (
      <OnboardingVoiceRecorder
        disabled={busy}
        language={language}
        onRecorded={handleUpload}
        onSubmitText={handleSubmitText}
      />
    );
  }

  return (
    <OnboardingShell
      variant="raw"
      currentStep={currentStep}
      completedSteps={completedSteps}
      onboardingBypassActive={onboardingBypassActive}
    >
      <OnboardingQuestionScreen
        stepTitle={stepTitle}
        stepDescription={stepDescription}
        index={0}
        total={1}
        wide
        hideProgress
        question={t("stepQuizTitle")}
        helper={t("stepQuizDesc")}
        error={transcribeFailed ? voice.error || t("voiceSomethingWrong") : null}
        canBack={false}
        isLast
        busy={busy}
        submitLabel=""
        hideActions
        onContinue={() => {}}
      >
        {body}
        {mode === "voice" && !showReview && !showTranscribing && !showGenerating ? (
          <button
            type="button"
            onClick={() => {
              onError(null);
              setMode("type");
            }}
            className="mt-4 text-sm font-bold text-zinc-500 underline-offset-2 hover:text-amber-300 hover:underline"
          >
            {t("voiceTypeInstead")}
          </button>
        ) : mode === "type" ? (
          <button
            type="button"
            onClick={() => {
              onError(null);
              setMode("voice");
            }}
            className="text-sm font-bold text-zinc-500 underline-offset-2 hover:text-amber-300 hover:underline"
          >
            {t("voiceBackToRecording")}
          </button>
        ) : null}
        {generateFailed ? (
          <OnboardingError
            message={(voice as VoiceTranscriptState).generate_error || voice.error || t("voiceGenerateFailed")}
          />
        ) : transcribeFailed ? (
          <OnboardingError message={voice.error || t("voiceProcessingFailed")} />
        ) : null}
      </OnboardingQuestionScreen>
    </OnboardingShell>
  );
}
