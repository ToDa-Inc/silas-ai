/**
 * useEditorSelection — selection state machine for the Studio inspector.
 *
 * The inspector is selection-driven: clicking on something (hook text,
 * background, a beat in the timeline, a cover element) updates the right
 * pane to that element's controls. Tabs of tabs disappear — you just click
 * what you want to edit.
 *
 * The discriminated union covers every clickable thing across formats:
 *
 *   - `none`           default state; inspector shows global controls
 *                      (theme, look, brand defaults, AI refine prompt)
 *   - `hook`           the opening line of a reel (text_overlay/b_roll_reel)
 *   - `block` (id)     an on-screen text block (text_overlay/b_roll_reel)
 *   - `background`     the AI image / client photo / stock clip
 *   - `beat` (id)      a beat on the video timeline strip
 *   - `coverElement`   any positionable element on the cover canvas
 *   - `slide` (idx)    a slide thumbnail in a carousel (carousel only)
 *
 * Editors instantiate this hook, expose its `selection` + `setSelection` to
 * `StudioShell.preview` (so click-to-select wires up) and to
 * `InspectorForSelection` (so the right pane renders the right controls).
 */

import { useCallback, useState } from "react";

export type EditorSelection =
  | { kind: "none" }
  | { kind: "hook" }
  | { kind: "block"; id: string }
  | { kind: "background" }
  | { kind: "beat"; id: string }
  | { kind: "coverElement"; id: string }
  | { kind: "slide"; idx: number };

export type UseEditorSelectionReturn = {
  selection: EditorSelection;
  setSelection: (s: EditorSelection) => void;
  /** Convenience: clear selection back to the default global-controls view. */
  clearSelection: () => void;
  /** Check whether the current selection matches a kind/id pair. */
  isSelected: (
    kind: EditorSelection["kind"],
    idOrIdx?: string | number,
  ) => boolean;
};

export function useEditorSelection(
  initial: EditorSelection = { kind: "none" },
): UseEditorSelectionReturn {
  const [selection, setSelection] = useState<EditorSelection>(initial);

  const clearSelection = useCallback(() => setSelection({ kind: "none" }), []);

  const isSelected = useCallback(
    (kind: EditorSelection["kind"], idOrIdx?: string | number) => {
      if (selection.kind !== kind) return false;
      if (idOrIdx == null) return true;
      if (selection.kind === "block" || selection.kind === "beat" || selection.kind === "coverElement") {
        return selection.id === String(idOrIdx);
      }
      if (selection.kind === "slide") {
        return selection.idx === Number(idOrIdx);
      }
      return true;
    },
    [selection],
  );

  return { selection, setSelection, clearSelection, isSelected };
}
