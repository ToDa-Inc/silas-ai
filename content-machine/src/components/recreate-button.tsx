/**
 * RecreateButton — one canonical "Recreate" CTA + modal pairing.
 *
 * Six surfaces (dashboard hot reels, dashboard daily lane, intelligence
 * overview, intelligence reels table, breakouts grid, replicate section)
 * used to each implement the same pattern by hand:
 *
 *   const [recreateRow, setRecreateRow] = useState<ScrapedReelRow | null>(null);
 *   <button onClick={() => setRecreateRow(reel)}>Recreate</button>
 *   <RecreateReelModal open={Boolean(recreateRow)} ... />
 *
 * This component owns that state internally so each caller only renders one
 * <RecreateButton reel={reel} ... /> and the modal is mounted once per
 * trigger. The visual styling matches the existing buttons across the app.
 */
"use client";

import { useState, type ReactNode } from "react";

import { RecreateReelModal } from "@/app/(dashboard)/intelligence/components/recreate-reel-modal";
import type { ScrapedReelRow } from "@/lib/api";

export type RecreateButtonVariant = "primary" | "subtle" | "ghost";

type Props = {
  reel: ScrapedReelRow | null;
  clientSlug: string;
  orgSlug: string;
  disabled?: boolean;
  disabledHint?: string | null;

  /** Override button label/children — defaults to "Recreate". */
  children?: ReactNode;

  /**
   * Visual treatment:
   * - primary (default): solid amber, used for high-contrast lane CTAs.
   * - subtle: amber/15 tinted background — best inside cards and lists.
   * - ghost: bordered, lowest emphasis — best inside dense tables.
   */
  variant?: RecreateButtonVariant;

  /** Optional class override (appended to the variant classes). */
  className?: string;

  /**
   * Escape hatch for callers that need a fully custom trigger element
   * (e.g. inline link-style buttons with their own icon + color treatment).
   * Receives ``open`` — calling it opens the modal with this reel.
   */
  renderTrigger?: (args: { open: () => void; disabled: boolean }) => ReactNode;

  /** Fires after the user confirms in the modal — host can refresh lists, etc. */
  onAfterRecreate?: () => void;
};

const VARIANT_CLASSES: Record<RecreateButtonVariant, string> = {
  primary:
    "rounded-md bg-amber-500 px-2.5 py-1.5 text-[10px] font-bold text-zinc-950 shadow-sm hover:opacity-90 disabled:opacity-50",
  subtle:
    "rounded-md bg-amber-500/15 px-2.5 py-1.5 text-[10px] font-bold text-app-on-amber-title hover:bg-amber-500/25 disabled:opacity-50",
  ghost:
    "rounded-md border border-app-divider px-2.5 py-1.5 text-[10px] font-bold text-app-fg hover:bg-white/5 disabled:opacity-50",
};

export function RecreateButton({
  reel,
  clientSlug,
  orgSlug,
  disabled,
  disabledHint,
  children = "Recreate",
  variant = "subtle",
  className,
  renderTrigger,
  onAfterRecreate,
}: Props) {
  const [openRow, setOpenRow] = useState<ScrapedReelRow | null>(null);
  const cls = [VARIANT_CLASSES[variant], "shrink-0", className].filter(Boolean).join(" ");
  const isDisabled = Boolean(disabled) || reel == null;
  const open = () => {
    if (reel) setOpenRow(reel);
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ open, disabled: isDisabled })
      ) : (
        <button
          type="button"
          disabled={isDisabled}
          title={disabledHint ?? undefined}
          onClick={open}
          className={cls}
        >
          {children}
        </button>
      )}

      <RecreateReelModal
        open={openRow != null}
        onClose={() => {
          setOpenRow(null);
          onAfterRecreate?.();
        }}
        reel={openRow}
        clientSlug={clientSlug}
        orgSlug={orgSlug}
        disabled={disabled}
        disabledHint={disabledHint}
      />
    </>
  );
}
