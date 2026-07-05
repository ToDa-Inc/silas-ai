"use client";

import type { ReactNode } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { OnboardingSkipToStudioButton } from "@/components/onboarding/onboarding-bypass-controls";
import { cn } from "@/lib/cn";
import {
  ONBOARDING_CHAPTERS,
  ONBOARDING_STEP_ORDER,
  chapterForStep,
  type OnboardingStepKey,
} from "@/lib/onboarding-ui";

export type OnboardingLayoutVariant = "card" | "page";

type Props = {
  variant: OnboardingLayoutVariant;
  currentStep: OnboardingStepKey;
  completedSteps: string[];
  title: string;
  description: string;
  children: ReactNode;
  onboardingBypassActive?: boolean;
};

const FLOATING_CARDS = [
  { title: "Hook pattern", body: "Contrarian opener + payoff in 7 seconds", className: "left-[7%] top-[18%]" },
  { title: "Creator Brain", body: "Audience, voice, offers, proof, angles", className: "right-[8%] top-[13%]" },
  { title: "First win", body: "Outlier found. Adaptation ready.", className: "bottom-[14%] left-[10%]" },
  { title: "Signal", body: "3.8x engagement match", className: "bottom-[20%] right-[11%]" },
];

function chapterNumber(firstStep: OnboardingStepKey): string {
  if (firstStep === "workspace") return "1";
  if (firstStep === "strategy_docs") return "2";
  return "3";
}

function stepIndex(current: OnboardingStepKey): number {
  const i = ONBOARDING_STEP_ORDER.indexOf(current);
  return i >= 0 ? i + 1 : 1;
}

function OnboardingChapterProgress({
  currentStep,
  completedSteps,
}: {
  currentStep: OnboardingStepKey;
  completedSteps: string[];
}) {
  const activeChapter = chapterForStep(currentStep).id;

  return (
    <div className="w-full" aria-label="Setup progress">
      <div className="grid gap-2 sm:grid-cols-3">
        {ONBOARDING_CHAPTERS.map((ch) => {
          const done = ch.steps.every((s) => completedSteps.includes(s));
          const active = ch.id === activeChapter;
          const activeOrDone = active || done;
          return (
            <div
              key={ch.id}
              className={cn(
                "rounded-2xl border px-3 py-3 transition-all duration-500",
                active
                  ? "border-amber-400/50 bg-amber-400/10 shadow-[0_0_30px_rgba(251,191,36,0.12)]"
                  : done
                    ? "border-emerald-400/30 bg-emerald-400/10"
                    : "border-white/10 bg-white/[0.035]",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                    done
                      ? "border-emerald-400 bg-emerald-400 text-zinc-950"
                      : active
                        ? "border-amber-300 bg-amber-300 text-zinc-950"
                        : "border-white/15 text-zinc-500",
                  )}
                >
                  {done ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    chapterNumber(ch.steps[0])
                  )}
                </span>
                <p
                  className={cn(
                    "truncate text-xs font-bold",
                    activeOrDone ? "text-zinc-100" : "text-zinc-500",
                  )}
                >
                  {ch.label}
                </p>
              </div>
              <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
                {ch.subtitle}
              </p>
              <div
                className={cn(
                  "mt-3 h-1 rounded-full transition-colors duration-500",
                  done ? "bg-emerald-400" : active ? "bg-amber-300" : "bg-white/10",
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OnboardingBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.22),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(45,212,191,0.14),transparent_28%),linear-gradient(135deg,#050505_0%,#09090b_45%,#1c1205_100%)]" />
      <div className="onboarding-orb absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-35 [mask-image:radial-gradient(circle_at_center,black,transparent_72%)]" />
      {FLOATING_CARDS.map((card, index) => (
        <div
          key={card.title}
          className={cn(
            "onboarding-float-card absolute hidden w-48 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-left shadow-2xl backdrop-blur-xl lg:block",
            card.className,
          )}
          style={{ animationDelay: `${index * 700}ms` }}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
            {card.title}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-300">{card.body}</p>
        </div>
      ))}
    </div>
  );
}

function OnboardingFrame({
  children,
  currentStep,
  completedSteps,
  onboardingBypassActive = false,
}: {
  children: ReactNode;
  currentStep: OnboardingStepKey;
  completedSteps: string[];
  onboardingBypassActive?: boolean;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <OnboardingBackdrop />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/15 shadow-[0_0_28px_rgba(251,191,36,0.18)]">
              <Sparkles className="h-5 w-5 text-amber-300" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight text-white">Silas</p>
              <p className="text-[11px] font-medium text-zinc-500">Creator Brain setup</p>
            </div>
          </div>
          <OnboardingSkipToStudioButton bypassActive={onboardingBypassActive} />
        </header>
        <div className="mb-6">
          <OnboardingChapterProgress currentStep={currentStep} completedSteps={completedSteps} />
        </div>
        {children}
      </div>
    </main>
  );
}

/** Signup-aligned centered card for short form steps. */
function CardLayout({
  title,
  description,
  currentStep,
  completedSteps,
  children,
  onboardingBypassActive,
}: Props) {
  const n = stepIndex(currentStep);
  const total = ONBOARDING_STEP_ORDER.length - 1;

  return (
    <OnboardingFrame
      currentStep={currentStep}
      completedSteps={completedSteps}
      onboardingBypassActive={onboardingBypassActive}
    >
      <section className="flex flex-1 items-center justify-center py-8">
        <article className="onboarding-panel w-full max-w-xl rounded-[2rem] border border-white/10 bg-zinc-950/70 p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">
            Step {n} of {total}
          </p>
          <h1 className="mt-3 text-center text-3xl font-black tracking-tight text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-center text-sm leading-relaxed text-zinc-400">
            {description}
          </p>
          <div className="mt-8">{children}</div>
        </article>
      </section>
    </OnboardingFrame>
  );
}

/** Full-width app canvas for editor, context, reel grids — no stretched card. */
function PageLayout({
  title,
  description,
  currentStep,
  completedSteps,
  children,
  onboardingBypassActive,
}: Props) {
  const n = stepIndex(currentStep);
  const total = ONBOARDING_STEP_ORDER.length - 1;

  return (
    <OnboardingFrame
      currentStep={currentStep}
      completedSteps={completedSteps}
      onboardingBypassActive={onboardingBypassActive}
    >
      <section className="flex-1 pb-8">
        <div className="onboarding-panel rounded-[2rem] border border-white/10 bg-zinc-950/72 shadow-2xl backdrop-blur-2xl">
          <header className="border-b border-white/10 px-5 py-5 sm:px-7">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">
              Step {n} of {total}
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                  {title}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
                  {description}
                </p>
              </div>
            </div>
          </header>
          <div className="px-4 py-5 sm:px-7 sm:py-7">{children}</div>
        </div>
      </section>
    </OnboardingFrame>
  );
}

export function OnboardingShell(props: Props) {
  if (props.variant === "page") {
    return <PageLayout {...props} />;
  }
  return <CardLayout {...props} />;
}

export function OnboardingPrimaryButton({
  children,
  disabled,
  busy,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 px-4 py-3 text-sm font-black text-zinc-950 shadow-[0_12px_34px_rgba(245,158,11,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(245,158,11,0.32)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function OnboardingError({ message }: { message: string }) {
  return (
    <p className="mb-4 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-center text-sm text-red-200">
      {message}
    </p>
  );
}

/**
 * Wide, desktop-first "one question per screen" layout.
 * Left column holds persistent step context + progress; right column holds the
 * current question, helper text, example, the input, and Back/Continue nav.
 */
export function OnboardingQuestionScreen({
  stepTitle,
  stepDescription,
  index,
  total,
  question,
  helper,
  example,
  optional,
  error,
  canBack,
  isLast,
  busy,
  submitLabel = "Continue",
  hideActions,
  hideProgress,
  onBack,
  onContinue,
  children,
}: {
  stepTitle: string;
  stepDescription?: string;
  index: number;
  total: number;
  question: string;
  helper: string;
  example?: string;
  optional?: boolean;
  error?: string | null;
  canBack?: boolean;
  isLast?: boolean;
  busy?: boolean;
  submitLabel?: string;
  hideActions?: boolean;
  hideProgress?: boolean;
  onBack?: () => void;
  onContinue: () => void;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-container-lowest px-4 py-10">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container shadow-xl md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <aside className="hidden flex-col justify-between gap-8 border-r border-outline-variant/10 bg-surface-container-low p-8 md:flex">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
              {stepTitle}
            </p>
            {stepDescription ? (
              <p className="mt-3 text-sm leading-relaxed text-zinc-400">{stepDescription}</p>
            ) : null}
          </div>
          {hideProgress ? null : (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Question {index + 1} of {total}
              </p>
              <div className="mt-3 flex gap-1.5">
                {Array.from({ length: total }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      i <= index ? "bg-amber-500" : "bg-zinc-700",
                    )}
                  />
                ))}
              </div>
            </div>
          )}
        </aside>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onContinue();
          }}
          className="flex flex-col p-8 sm:p-10"
        >
          <p className="mb-5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 md:hidden">
            {stepTitle}
            {hideProgress ? "" : ` · Question ${index + 1} of ${total}`}
          </p>
          <h1 className="text-xl font-bold text-on-surface sm:text-2xl">
            {question}
            {optional ? (
              <span className="ml-2 align-middle text-xs font-medium text-zinc-500">
                (optional)
              </span>
            ) : null}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">{helper}</p>
          {example ? <p className="mt-2 text-sm italic text-zinc-500">{example}</p> : null}
          <div key={index} className="mt-6">
            {children}
          </div>
          {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
          {hideActions ? null : (
            <div className="mt-8 flex items-center gap-3">
              {canBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  disabled={busy}
                  className="rounded-lg border border-outline-variant/20 px-5 py-2.5 text-sm font-bold text-zinc-300 transition hover:bg-surface-container-high disabled:opacity-50"
                >
                  Back
                </button>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-container py-2.5 text-sm font-bold text-on-primary-container transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {isLast ? submitLabel : "Continue"}
              </button>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
