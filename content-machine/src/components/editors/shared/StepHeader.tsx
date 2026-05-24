import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

/**
 * Numbered step heading used at the top of each card in the create wizard
 * (`Step 1: On-screen text`, `Step 2: Visual & render`, `Step 3: Reel cover`,
 * `Step 4: Output`). When `done=true` the circle flips from amber to emerald
 * with a checkmark so the user can scan progress at a glance.
 *
 * `children` slot is for inline controls that sit on the right edge of the
 * header — e.g. `<RegenInline>`, `<SaveStatusPill>`, format hint pills.
 */
export function StepHeader({
  n,
  label,
  done,
  children,
}: {
  n: number;
  label: string;
  done: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
        }`}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : n}
      </div>
      <h2 className="flex-1 text-sm font-semibold text-app-fg">{label}</h2>
      {children}
    </div>
  );
}
