"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  ONBOARDING_VOICE_QUESTIONS,
  questionLabel,
  type OnboardingLang,
  type OnboardingVoiceQuestion,
} from "@/lib/onboarding-voice-questions";
import { onboardingTextareaClass, onboardingLabelClass } from "@/lib/onboarding-ui";
import { cn } from "@/lib/cn";

type Props = {
  answers: Record<string, string>;
  onChange: (
    answers:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>),
  ) => void;
  rawTranscript?: string;
  disabled?: boolean;
  language?: OnboardingLang;
};

function AnswerCard({
  question,
  value,
  onChange,
  disabled,
  language,
  notDetectedLabel,
  answerPlaceholder,
}: {
  question: OnboardingVoiceQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  language: OnboardingLang;
  notDetectedLabel: string;
  answerPlaceholder: string;
}) {
  const empty = !value.trim();
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition",
        empty
          ? "border-white/5 bg-white/[0.02]"
          : "border-amber-300/20 bg-white/[0.03]",
      )}
    >
      <label className={onboardingLabelClass}>
        <span className="font-mono text-amber-300/90">Q{question.id}</span>
      </label>
      <p className="mb-3 text-sm font-medium leading-snug text-zinc-200 sm:text-[15px]">
        {questionLabel(question, language)}
      </p>
      <p className={cn("mb-2 text-xs text-zinc-600", !empty && "invisible")} aria-hidden={!empty}>
        {notDetectedLabel}
      </p>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className={cn(onboardingTextareaClass, "min-h-[88px] text-[15px] leading-relaxed")}
        placeholder={answerPlaceholder}
      />
    </div>
  );
}

export function OnboardingVoiceReview({
  answers,
  onChange,
  rawTranscript,
  disabled,
  language = "de",
}: Props) {
  const t = useTranslations("onboarding");
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4">
        <p className="text-sm font-bold text-emerald-200">{t("voiceReviewTitle")}</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">{t("voiceReviewDesc")}</p>
      </div>

      <div className="space-y-3">
        {ONBOARDING_VOICE_QUESTIONS.map((q) => (
          <AnswerCard
            key={q.id}
            question={q}
            value={answers[q.id] ?? ""}
            disabled={disabled}
            language={language}
            notDetectedLabel={t("voiceNotDetected")}
            answerPlaceholder={t("voiceAnswerPlaceholder")}
            onChange={(v) => onChange((prev) => ({ ...prev, [q.id]: v }))}
          />
        ))}
      </div>

      {rawTranscript ? (
        <div className="rounded-xl border border-white/5">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
          >
            {t("voiceFullTranscript")}
            <ChevronDown className={cn("h-4 w-4 transition", showRaw && "rotate-180")} />
          </button>
          {showRaw ? (
            <pre className="max-h-48 overflow-auto border-t border-white/5 px-4 py-3 text-xs leading-relaxed text-zinc-500 whitespace-pre-wrap">
              {rawTranscript}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
