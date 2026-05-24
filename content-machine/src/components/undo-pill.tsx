/**
 * UndoPill — small inline affordance that appears next to a save indicator
 * with the last undoable action ("Undo: drag headline"). Pairs with
 * ``useUndoStack`` from ``@/lib/use-undo-stack``. Cmd+Z works regardless of
 * whether the pill is visible — the pill is just a discovery aid.
 */
"use client";

import { Undo2 } from "lucide-react";

type Props = {
  /** True when there is at least one undoable step. */
  canUndo: boolean;
  /** Label of the most recent undoable step ("Drag headline", "Edit hook", …). */
  label: string | null;
  /** Optional redo state — shown when both flags are true. */
  canRedo?: boolean;
  /** Click handler — performs the undo. */
  onUndo: () => void;
  /** Click handler for redo (rendered only when ``canRedo`` is true). */
  onRedo?: () => void;
};

export function UndoPill({ canUndo, canRedo, label, onUndo, onRedo }: Props) {
  if (!canUndo && !canRedo) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-app-divider/60 bg-app-chip-bg/40 px-2 py-0.5 text-[10px] font-semibold text-app-fg-muted">
      <Undo2 className="h-3 w-3" aria-hidden />
      {canUndo ? (
        <button
          type="button"
          onClick={onUndo}
          className="font-bold text-app-fg-secondary hover:text-app-fg"
          title="Undo (⌘Z)"
        >
          Undo{label ? `: ${label}` : ""}
        </button>
      ) : null}
      {canRedo ? (
        <button
          type="button"
          onClick={onRedo}
          className="font-bold text-app-fg-secondary hover:text-app-fg"
          title="Redo (⌘⇧Z)"
        >
          Redo
        </button>
      ) : null}
    </span>
  );
}
