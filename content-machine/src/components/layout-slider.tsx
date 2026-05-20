"use client";

import { useId } from "react";

type Props = {
  label: string;
  leftHint: string;
  rightHint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  /** Optional native tooltip on the whole control (e.g. explain "Padding"). */
  title?: string;
  /** Render the live value (e.g. "Center", "1.10x"). */
  formatValue: (v: number) => string;
  /** Fires while dragging — wire to local state for instant preview feedback. */
  onChange: (v: number) => void;
  /** Fires once on release — wire to API persist. */
  onCommit: (v: number) => void;
  /** Compact − / + buttons for keyboard-like nudging without hunting the track. */
  showSteppers?: boolean;
  /** Multiplier on `step` for the stepper buttons (default = 1). */
  stepperStep?: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function roundToStep(n: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return n;
  const k = Math.round(n / step);
  return k * step;
}

/**
 * Dual-callback range slider used by the workspace's layout panel.
 *
 * `onChange` updates local draft state every drag tick (cheap), `onCommit` fires
 * on release for the API write — so the live preview is instant but we don't
 * spam JSON Patch requests for every pixel of slider movement.
 */
export function LayoutSlider({
  label,
  leftHint,
  rightHint,
  min,
  max,
  step,
  value,
  disabled,
  formatValue,
  onChange,
  onCommit,
  title,
  showSteppers,
  stepperStep,
}: Props) {
  const id = useId();
  const s = stepperStep ?? step;

  const bump = (dir: -1 | 1) => {
    const raw = value + dir * s;
    const next = clamp(roundToStep(raw, step), min, max);
    onChange(next);
    onCommit(next);
  };

  return (
    <div className="space-y-0.5" title={title}>
      <div className="flex items-center justify-between gap-1">
        <label htmlFor={id} className="min-w-0 shrink text-[10px] font-semibold text-app-fg-muted">
          {label}
        </label>
        <div className="flex shrink-0 items-center gap-0.5">
          {showSteppers ? (
            <>
              <button
                type="button"
                disabled={disabled || value <= min + 1e-9}
                aria-label="Decrease"
                onClick={() => bump(-1)}
                className="rounded border border-app-divider/80 px-1.5 py-px text-[10px] font-semibold text-app-fg-muted hover:border-amber-500/50 hover:text-app-fg disabled:cursor-not-allowed disabled:opacity-30"
              >
                −
              </button>
              <button
                type="button"
                disabled={disabled || value >= max - 1e-9}
                aria-label="Increase"
                onClick={() => bump(1)}
                className="rounded border border-app-divider/80 px-1.5 py-px text-[10px] font-semibold text-app-fg-muted hover:border-amber-500/50 hover:text-app-fg disabled:cursor-not-allowed disabled:opacity-30"
              >
                +
              </button>
            </>
          ) : null}
          <span className="min-w-[3.25rem] text-right text-[10px] font-mono text-app-fg-subtle tabular-nums">
            {formatValue(value)}
          </span>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit(parseFloat((e.target as HTMLInputElement).value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-app-chip-bg/60 accent-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <div className="flex justify-between text-[9px] text-app-fg-subtle">
        <span>{leftHint}</span>
        <span>{rightHint}</span>
      </div>
    </div>
  );
}
