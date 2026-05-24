/**
 * useUndoStack — generic snapshot-based undo/redo for editor surfaces.
 *
 * Design notes:
 * - We capture *full snapshots* on commit, not patch operations. The editor
 *   already POSTs JSON-Patch ops to the backend; reversing arbitrary ops
 *   correctly (esp. with array re-indexing) is harder than swapping in a
 *   previous snapshot. Snapshots are O(spec size) per entry; with the cap
 *   below the memory cost is negligible for spec/cover/carousel shapes.
 * - The hook is intentionally minimal: callers push snapshots, call undo /
 *   redo, and receive a typed promise. We do NOT auto-apply — the caller
 *   decides how to persist (e.g. send a replace-root patch).
 * - Stack is bounded so the editor cannot leak memory on long sessions.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_CAP = 30;

export type UndoSnapshot<T> = {
  /** Stable label shown in the inline Undo pill ("Drag headline", "Edit hook"…). */
  label: string;
  /** Frozen value to restore on undo (typically the *previous* state). */
  value: T;
};

export type UndoStack<T> = {
  /** True when there is at least one undo step available. */
  canUndo: boolean;
  /** True when there is at least one redo step available. */
  canRedo: boolean;
  /** Most recent undoable snapshot label — power the inline pill. */
  lastLabel: string | null;
  /**
   * Record a snapshot of the state right before a change is applied.
   * Pass the *previous* value so undo can replay it.
   */
  push: (snapshot: UndoSnapshot<T>) => void;
  /** Pop the latest undo snapshot. Returns the value to restore, or null. */
  undo: () => UndoSnapshot<T> | null;
  /** Re-apply the most recently undone snapshot. Returns the value, or null. */
  redo: () => UndoSnapshot<T> | null;
  /** Wipe the stack — call when loading a new session. */
  reset: () => void;
};

export function useUndoStack<T>(opts?: { cap?: number }): UndoStack<T> {
  const cap = opts?.cap ?? DEFAULT_CAP;
  const undoRef = useRef<UndoSnapshot<T>[]>([]);
  const redoRef = useRef<UndoSnapshot<T>[]>([]);
  // Tick re-render only when canUndo/canRedo flips — avoid the chatter that
  // would come from re-rendering on every push.
  const [tick, setTick] = useState(0);

  const push = useCallback(
    (snapshot: UndoSnapshot<T>) => {
      const stack = undoRef.current;
      stack.push(snapshot);
      if (stack.length > cap) stack.splice(0, stack.length - cap);
      // Any new edit invalidates the redo branch.
      redoRef.current = [];
      setTick((n) => n + 1);
    },
    [cap],
  );

  const undo = useCallback((): UndoSnapshot<T> | null => {
    const stack = undoRef.current;
    const popped = stack.pop();
    if (!popped) return null;
    redoRef.current.push(popped);
    setTick((n) => n + 1);
    return popped;
  }, []);

  const redo = useCallback((): UndoSnapshot<T> | null => {
    const stack = redoRef.current;
    const popped = stack.pop();
    if (!popped) return null;
    undoRef.current.push(popped);
    setTick((n) => n + 1);
    return popped;
  }, []);

  const reset = useCallback(() => {
    undoRef.current = [];
    redoRef.current = [];
    setTick((n) => n + 1);
  }, []);

  const canUndo = undoRef.current.length > 0;
  const canRedo = redoRef.current.length > 0;
  const lastLabel = canUndo ? undoRef.current[undoRef.current.length - 1]!.label : null;

  // Reference ``tick`` so the linter doesn't strip it; it's the dependency
  // that drives derived state above.
  void tick;

  return { canUndo, canRedo, lastLabel, push, undo, redo, reset };
}

/** Install Cmd+Z / Cmd+Shift+Z handlers scoped to a container element. */
export function useUndoKeybindings({
  onUndo,
  onRedo,
  enabled = true,
}: {
  onUndo: () => void;
  onRedo: () => void;
  enabled?: boolean;
}): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      // Don't intercept when an input/textarea has focus and the user might
      // expect the browser's native field undo.
      const target = e.target as HTMLElement | null;
      const insideField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (insideField) return;

      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        onRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onUndo, onRedo]);
}
