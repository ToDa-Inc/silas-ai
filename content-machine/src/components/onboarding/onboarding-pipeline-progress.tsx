"use client";

import { Check, Circle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  PIPELINE_PHASES,
  pipelinePhaseStatus,
  type PipelinePhaseId,
} from "@/lib/onboarding-ui";

type Props = {
  phase?: string;
  lastError?: string | null;
};

function PhaseIcon({ status }: { status: "done" | "active" | "pending" | "failed" }) {
  if (status === "done") {
    return <Check className="h-4 w-4 text-emerald-500" aria-hidden />;
  }
  if (status === "active") {
    return <Loader2 className="h-4 w-4 animate-spin text-amber-500" aria-hidden />;
  }
  if (status === "failed") {
    return <X className="h-4 w-4 text-red-500" aria-hidden />;
  }
  return <Circle className="h-4 w-4 text-app-fg-faint" aria-hidden />;
}

export function OnboardingPipelineProgress({ phase, lastError }: Props) {
  const current = phase === "complete" ? "complete" : phase;
  const failed = current === "failed";

  return (
    <div className="space-y-1">
      <ul className="space-y-2">
        {PIPELINE_PHASES.map((p) => {
          const status = pipelinePhaseStatus(
            p.id,
            current as PipelinePhaseId | undefined,
          );
          return (
            <li
              key={p.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-300",
                status === "active"
                  ? "border-amber-500/40 bg-amber-500/[0.06]"
                  : status === "done"
                    ? "border-emerald-500/25 bg-emerald-500/[0.04]"
                    : "border-app-divider/50 bg-transparent",
              )}
            >
              <span className="mt-0.5 shrink-0">
                <PhaseIcon status={status} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-app-fg">{p.label}</p>
                <p className="text-xs text-app-fg-muted">{p.hint}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {current === "complete" ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-200">
          Discovery complete — review candidate reels next.
        </p>
      ) : null}

      {failed && lastError ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-app-callout-warning-fg">
          Some steps had issues: {lastError}
        </p>
      ) : null}

      {current && current !== "complete" && current !== "failed" && current !== "queued" ? (
        <p className="text-center text-xs text-app-fg-muted">
          Usually 5–15 minutes. You can keep this tab open.
        </p>
      ) : null}
    </div>
  );
}
