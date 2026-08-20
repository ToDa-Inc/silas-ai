"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Heart,
  Instagram,
  Loader2,
  MessageCircle,
  Play,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { OnboardingSkipToStudioButton } from "@/components/onboarding/onboarding-bypass-controls";
import { LanguageSwitcher } from "@/components/dashboard/language-switcher";
import { cn } from "@/lib/cn";
import {
  ONBOARDING_STEP_ORDER,
  canGoBackInOnboarding,
  chapterForStep,
  type OnboardingStepKey,
} from "@/lib/onboarding-ui";
import { useOnboardingChapters } from "@/lib/use-onboarding-ui";
import { useTranslations } from "next-intl";

/** "raw" skips the title/description card chrome — used for steps (like the
 * per-question Q&A flow) that render their own panel but still want the
 * branded backdrop, header, and chapter progress. */
export type OnboardingLayoutVariant = "card" | "page" | "raw";

type Props = {
  variant: OnboardingLayoutVariant;
  currentStep: OnboardingStepKey;
  completedSteps: string[];
  title?: string;
  description?: string;
  children: ReactNode;
  onboardingBypassActive?: boolean;
  onBack?: () => void;
  backBusy?: boolean;
  /** Earliest step the user can navigate back to (e.g. quiz when workspace is done). */
  minBackStep?: OnboardingStepKey;
};

type FloatingCard = {
  label: string;
  metric: string;
  detail: string;
  badge: string;
  icon: LucideIcon;
  className: string;
  driftClass: string;
  accentClass: string;
};

function useFloatingCards(): FloatingCard[] {
  const t = useTranslations("onboarding");
  return [
    {
      label: t("floatInstagramScan"),
      metric: "48 reels",
      detail: t("floatInstagramDetail"),
      badge: t("floatBadgeCreator"),
      icon: Instagram,
      className: "left-2 top-[19%] 2xl:left-5",
      driftClass: "onboarding-float-card-slow",
      accentClass: "border-app-accent/30 bg-app-accent/15 text-app-accent-bright",
    },
    {
      label: t("floatCommentsPulled"),
      metric: "+600",
      detail: t("floatCommentsDetail"),
      badge: t("floatBadgeAudience"),
      icon: MessageCircle,
      className: "right-2 top-[17%] 2xl:right-5",
      driftClass: "onboarding-float-card",
      accentClass: "border-app-reel-neon/30 bg-app-reel-neon/10 text-app-reel-neon",
    },
    {
      label: t("floatReachSpike"),
      metric: "3.8x",
      detail: t("floatReachDetail"),
      badge: t("floatBadgeOutlier"),
      icon: TrendingUp,
      className: "bottom-[18%] left-2 2xl:left-5",
      driftClass: "onboarding-float-card-wide",
      accentClass: "border-[#12494A]/50 bg-[#12494A]/20 text-[#7dd9d3]",
    },
    {
      label: t("floatFollowerLift"),
      metric: "+1.2K",
      detail: t("floatFollowerDetail"),
      badge: t("floatBadgeMomentum"),
      icon: Users,
      className: "bottom-[22%] right-2 2xl:right-5",
      driftClass: "onboarding-float-card-slow",
      accentClass: "border-app-accent/35 bg-app-accent/15 text-app-accent-bright",
    },
  ];
}

const FLOATING_REACTIONS: { value: string; icon: LucideIcon; className: string }[] = [
  {
    value: "12.4K",
    icon: Heart,
    className: "left-4 top-[45%] 2xl:left-8",
  },
  {
    value: "84K",
    icon: Play,
    className: "right-4 top-[49%] 2xl:right-8",
  },
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
  const t = useTranslations("onboarding");
  const chapters = useOnboardingChapters();
  const activeChapter = chapterForStep(currentStep).id;

  return (
    <div className="w-full" aria-label={t("setupProgress")}>
      <div className="grid gap-2 sm:grid-cols-3">
        {chapters.map((ch) => {
          const done = ch.steps.every((s) => completedSteps.includes(s));
          const active = ch.id === activeChapter;
          const activeOrDone = active || done;
          return (
            <div
              key={ch.id}
              className={cn(
                "rounded-2xl border px-3 py-3 transition-all duration-500",
                active
                  ? "border-app-accent/50 bg-app-accent/10 shadow-[0_0_30px_var(--glow-accent)]"
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
                  done ? "bg-emerald-400" : active ? "bg-app-accent" : "bg-white/10",
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
  const floatingCards = useFloatingCards();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(47,201,192,0.22),transparent_36%),radial-gradient(circle_at_80%_20%,rgba(0,229,216,0.14),transparent_30%),radial-gradient(circle_at_20%_85%,rgba(18,73,74,0.18),transparent_28%),linear-gradient(135deg,#050708_0%,#0a1a1c_44%,#12494a_100%)]" />
      <div className="onboarding-orb absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-app-accent/10 blur-3xl" />
      {floatingCards.map((card, index) => (
        <FloatingMetricCard
          key={card.label}
          card={card}
          animationDelay={`${index * 650}ms`}
        />
      ))}
      {FLOATING_REACTIONS.map((reaction, index) => {
        const Icon = reaction.icon;
        return (
          <div
            key={reaction.value}
            className={cn(
              "onboarding-float-card-wide absolute hidden items-center gap-2 rounded-full border border-white/10 bg-zinc-950/50 px-3 py-2 text-xs font-black text-white shadow-2xl backdrop-blur-2xl xl:flex",
              reaction.className,
            )}
            style={{ animationDelay: `${index * 900 + 350}ms` }}
          >
            <Icon className="h-3.5 w-3.5 text-pink-200" aria-hidden />
            {reaction.value}
          </div>
        );
      })}
    </div>
  );
}

function FloatingMetricCard({
  card,
  animationDelay,
}: {
  card: FloatingCard;
  animationDelay: string;
}) {
  const Icon = card.icon;
  return (
    <div
      className={cn(
        "absolute hidden w-28 rounded-3xl border border-white/10 bg-zinc-950/45 p-2.5 text-left opacity-75 shadow-2xl backdrop-blur-2xl xl:block 2xl:w-40 2xl:p-3.5 2xl:opacity-100",
        card.driftClass,
        card.className,
      )}
      style={{ animationDelay }}
    >
      <div className="flex items-start justify-between gap-2 2xl:gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border 2xl:h-9 2xl:w-9",
            card.accentClass,
          )}
        >
          <Icon className="h-3.5 w-3.5 2xl:h-4 2xl:w-4" aria-hidden />
        </div>
        <span className="hidden rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-400 2xl:inline-flex">
          {card.badge}
        </span>
      </div>
      <p className="mt-3 text-xl font-black tracking-tight text-white 2xl:mt-4 2xl:text-2xl">{card.metric}</p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-300/85 2xl:text-[10px] 2xl:tracking-[0.18em]">
        {card.label}
      </p>
      <p className="mt-2 hidden text-[11px] leading-relaxed text-zinc-400 2xl:block">{card.detail}</p>
      <div className="mt-3 flex gap-1">
        <span className="h-1.5 flex-1 rounded-full bg-amber-300/80" />
        <span className="h-1.5 flex-1 rounded-full bg-pink-300/50" />
        <span className="h-1.5 flex-1 rounded-full bg-sky-300/40" />
      </div>
    </div>
  );
}

function OnboardingBackButton({
  busy,
  onClick,
}: {
  busy?: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("onboarding");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-[11px] font-bold text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white disabled:cursor-wait disabled:opacity-70"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      {t("back")}
    </button>
  );
}

function OnboardingFrame({
  children,
  currentStep,
  completedSteps,
  onboardingBypassActive = false,
  onBack,
  backBusy,
  minBackStep,
}: {
  children: ReactNode;
  currentStep: OnboardingStepKey;
  completedSteps: string[];
  onboardingBypassActive?: boolean;
  onBack?: () => void;
  backBusy?: boolean;
  minBackStep?: OnboardingStepKey;
}) {
  const t = useTranslations("onboarding");
  const showBack =
    Boolean(onBack) &&
    canGoBackInOnboarding(currentStep, {
      completedSteps,
      minStep: minBackStep,
    });

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <OnboardingBackdrop />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-app-accent/30 bg-app-accent/15 shadow-[0_0_28px_var(--glow-accent)]">
              <Sparkles className="h-5 w-5 text-amber-300" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-black tracking-tight text-white">Silas</p>
              <p className="text-[11px] font-medium text-zinc-500">{t("setupTitle")}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {showBack ? (
              <OnboardingBackButton busy={backBusy} onClick={onBack!} />
            ) : null}
            <LanguageSwitcher variant="onboarding" />
            <OnboardingSkipToStudioButton bypassActive={onboardingBypassActive} />
          </div>
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
  onBack,
  backBusy,
  minBackStep,
}: Props) {
  const t = useTranslations("onboarding");
  const n = stepIndex(currentStep);
  const total = ONBOARDING_STEP_ORDER.length - 1;

  return (
    <OnboardingFrame
      currentStep={currentStep}
      completedSteps={completedSteps}
      onboardingBypassActive={onboardingBypassActive}
      onBack={onBack}
      backBusy={backBusy}
      minBackStep={minBackStep}
    >
      <section className="flex flex-1 items-center justify-center py-8">
        <article className="onboarding-panel w-full max-w-xl rounded-[2rem] border border-white/10 bg-zinc-950/70 p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">
            {t("stepOf", { current: n, total })}
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
  onBack,
  backBusy,
  minBackStep,
}: Props) {
  const t = useTranslations("onboarding");
  const n = stepIndex(currentStep);
  const total = ONBOARDING_STEP_ORDER.length - 1;

  return (
    <OnboardingFrame
      currentStep={currentStep}
      completedSteps={completedSteps}
      onboardingBypassActive={onboardingBypassActive}
      onBack={onBack}
      backBusy={backBusy}
      minBackStep={minBackStep}
    >
      <section className="flex-1 pb-8">
        <div className="onboarding-panel rounded-[2rem] border border-white/10 bg-zinc-950/72 shadow-2xl backdrop-blur-2xl">
          <header className="border-b border-white/10 px-5 py-5 sm:px-7">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">
              {t("stepOf", { current: n, total })}
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

/** Same branded frame as the other layouts, but leaves the panel to `children`. */
function RawLayout({
  currentStep,
  completedSteps,
  children,
  onboardingBypassActive,
  onBack,
  backBusy,
  minBackStep,
}: Props) {
  return (
    <OnboardingFrame
      currentStep={currentStep}
      completedSteps={completedSteps}
      onboardingBypassActive={onboardingBypassActive}
      onBack={onBack}
      backBusy={backBusy}
      minBackStep={minBackStep}
    >
      <section className="flex flex-1 items-start justify-center py-4 sm:py-6">
        <div className="w-full max-w-6xl">{children}</div>
      </section>
    </OnboardingFrame>
  );
}

export function OnboardingShell(props: Props) {
  if (props.variant === "page") {
    return <PageLayout {...props} />;
  }
  if (props.variant === "raw") {
    return <RawLayout {...props} />;
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
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-app-accent-bright to-app-accent px-4 py-3 text-sm font-black text-zinc-950 shadow-[0_12px_34px_var(--shadow-accent)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_var(--shadow-accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
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
  wide,
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
  /** Full-width single-column panel for voice onboarding etc. */
  wide?: boolean;
  onBack?: () => void;
  onContinue: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("onboarding");
  if (wide) {
    return (
      <div className="onboarding-panel w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 shadow-2xl backdrop-blur-2xl">
        <div className="border-b border-white/10 px-6 py-6 sm:px-10 sm:py-8">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">{stepTitle}</p>
          {stepDescription ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{stepDescription}</p>
          ) : null}
          <h1 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">{question}</h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-400">{helper}</p>
        </div>
        <div className="px-6 py-6 sm:px-10 sm:py-8">
          {children}
          {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-panel grid w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/70 shadow-2xl backdrop-blur-2xl md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <aside className="hidden flex-col justify-between gap-8 border-r border-white/10 bg-white/[0.03] p-8 md:flex">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
            {stepTitle}
          </p>
          {stepDescription ? (
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{stepDescription}</p>
          ) : null}
        </div>
        {hideProgress ? null : (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {t("questionOf", { current: index + 1, total })}
            </p>
            <div className="mt-3 flex gap-1.5">
              {Array.from({ length: total }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    i <= index ? "bg-amber-400" : "bg-white/10",
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
          {hideProgress ? "" : ` · ${t("questionOf", { current: index + 1, total })}`}
        </p>
        <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">
          {question}
          {optional ? (
            <span className="ml-2 align-middle text-xs font-medium text-zinc-500">
              {t("optional")}
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
                className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-bold text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-50"
              >
                {t("back")}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-app-accent-bright to-app-accent py-2.5 text-sm font-black text-zinc-950 shadow-[0_12px_34px_var(--shadow-accent)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_44px_var(--shadow-accent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isLast ? submitLabel : t("continue")}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
