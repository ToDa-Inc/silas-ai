"use client";

import { Check, Loader2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  pipelinePhaseStatus,
  type PipelinePhaseId,
} from "@/lib/onboarding-ui";
import { usePipelinePhases } from "@/lib/use-onboarding-ui";

type Props = {
  phase?: string;
  lastError?: string | null;
};

function PhaseIcon({ status }: { status: "done" | "active" | "pending" | "failed" }) {
  if (status === "done") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
        <Check className="h-3 w-3 stroke-[3]" aria-hidden />
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
        <Loader2 className="h-3 w-3 animate-spin stroke-[2.5]" aria-hidden />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/20 text-red-400">
        <X className="h-3 w-3 stroke-[3]" aria-hidden />
      </div>
    );
  }
  return (
    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-white/10 text-zinc-600 bg-white/[0.01]">
      <div className="h-1.5 w-1.5 rounded-full bg-current" />
    </div>
  );
}

export function OnboardingPipelineProgress({ phase, lastError }: Props) {
  const pipelinePhases = usePipelinePhases();
  const current = phase === "complete" ? "complete" : phase;
  const failed = current === "failed";

  return (
    <div className="space-y-1">
      <ul className="space-y-2">
        {pipelinePhases.map((p) => {
          const status = pipelinePhaseStatus(
            p.id,
            current as PipelinePhaseId | undefined,
          );
          return (
            <li
              key={p.id}
              className={cn(
                "flex items-center gap-4 rounded-2xl border px-4 py-3.5 transition-all duration-500",
                status === "active"
                  ? "border-app-accent/40 bg-app-accent/[0.04] shadow-[0_0_20px_var(--glow-accent)] scale-[1.01]"
                  : status === "done"
                    ? "border-emerald-500/20 bg-emerald-500/[0.02]"
                    : "border-white/5 bg-transparent opacity-50",
              )}
            >
              <span className="shrink-0">
                <PhaseIcon status={status} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-sm font-bold transition-colors duration-300",
                  status === "active" ? "text-white" : status === "done" ? "text-zinc-200" : "text-zinc-500"
                )}>
                  {p.label}
                </p>
                <p className={cn(
                  "text-xs transition-colors duration-300",
                  status === "active" ? "text-amber-300/70" : status === "done" ? "text-zinc-400" : "text-zinc-600"
                )}>
                  {p.hint}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {current === "complete" ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm font-semibold text-emerald-300 flex items-center gap-2 mt-4">
          <Check className="h-4 w-4 stroke-[3]" />
          Discovery complete — ready to review candidate reels.
        </div>
      ) : null}

      {failed && lastError ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-200 leading-relaxed mt-4">
          Some steps had issues: {lastError}
        </div>
      ) : null}

      {current && current !== "complete" && current !== "failed" && current !== "queued" ? (
        <p className="text-center text-xs text-zinc-500 mt-4">
          Usually 5–15 minutes. You can keep this tab open.
        </p>
      ) : null}
    </div>
  );
}
