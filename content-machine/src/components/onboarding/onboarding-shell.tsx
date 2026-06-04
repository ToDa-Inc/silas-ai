"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
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
};

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
    <div className="mb-6 w-full max-w-md" aria-label="Setup progress">
      <div className="flex gap-2">
        {ONBOARDING_CHAPTERS.map((ch) => {
          const done = ch.steps.every((s) => completedSteps.includes(s));
          const active = ch.id === activeChapter;
          return (
            <div key={ch.id} className="flex-1">
              <div
                className={cn(
                  "h-1 rounded-full transition-colors duration-300",
                  done ? "bg-emerald-500" : active ? "bg-amber-500" : "bg-zinc-700",
                )}
              />
              <p
                className={cn(
                  "mt-1.5 truncate text-[10px] font-semibold",
                  active ? "text-amber-400" : done ? "text-emerald-500/90" : "text-zinc-500",
                )}
              >
                {ch.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Signup-aligned centered card for short form steps. */
function CardLayout({ title, description, currentStep, completedSteps, children }: Props) {
  const n = stepIndex(currentStep);
  const total = ONBOARDING_STEP_ORDER.length - 1;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-container-lowest px-4 py-10">
      <OnboardingChapterProgress currentStep={currentStep} completedSteps={completedSteps} />
      <article className="w-full max-w-md rounded-2xl border border-outline-variant/10 bg-surface-container p-8 shadow-xl">
        <p className="text-center text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          Step {n} of {total}
        </p>
        <h1 className="mt-3 text-center text-xl font-bold text-on-surface">{title}</h1>
        <p className="mt-2 text-center text-sm leading-relaxed text-zinc-500">{description}</p>
        <div className="mt-8">{children}</div>
      </article>
    </main>
  );
}

/** Full-width app canvas for editor, context, reel grids — no stretched card. */
function PageLayout({ title, description, currentStep, completedSteps, children }: Props) {
  const n = stepIndex(currentStep);
  const total = ONBOARDING_STEP_ORDER.length - 1;

  return (
    <main className="min-h-screen bg-surface-container-lowest">
      <header className="border-b border-outline-variant/10 bg-surface-container/80">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:px-6">
          <OnboardingChapterProgress currentStep={currentStep} completedSteps={completedSteps} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Step {n} of {total}
            </p>
            <h1 className="mt-1 text-lg font-bold text-on-surface sm:text-xl">{title}</h1>
            <p className="mt-1 text-sm text-zinc-500">{description}</p>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
    </main>
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
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container py-2.5 text-sm font-bold text-on-primary-container transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function OnboardingError({ message }: { message: string }) {
  return <p className="mb-4 text-center text-sm text-red-400">{message}</p>;
}
