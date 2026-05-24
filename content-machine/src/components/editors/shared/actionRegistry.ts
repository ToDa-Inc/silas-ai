/**
 * actionRegistry — typed registry of editor actions for the command palette
 * AND the visible inspector buttons.
 *
 * The palette and visible buttons consume the SAME registry, so the two
 * surfaces never drift apart. A new action becomes available in both
 * surfaces with a single registry entry.
 *
 * Each format editor (VideoEditor, CoverEditor, CarouselEditor,
 * TalkingHeadEditor) exports its own `EditorAction[]` provider — the editor
 * passes those into `EditorCommandPalette` and references them by id from
 * inspector buttons.
 *
 * No sparkles. Labels are plain text ("Shorten hook", "Vary", "Improve",
 * "Darken background"). Icons may be passed via `icon` but the palette
 * shows the label as the primary affordance.
 */

import type { ReactNode } from "react";

import type { EditorSelection } from "./useEditorSelection";

export type EditorActionGroup =
  | "Text"
  | "Visual"
  | "Timing"
  | "Render"
  | "AI"
  | "Brand"
  | "Export";

export type EditorAction = {
  /** Stable id used by `runAction(id)` from inspector buttons. */
  id: string;
  /** Display label in the palette + inspector buttons. */
  label: string;
  /** Optional shorter label used inline (e.g. "Shorten" instead of "Shorten hook"). */
  shortLabel?: string;
  /** Optional one-line description shown under the label in the palette. */
  description?: string;
  /** Group header in the palette. */
  group: EditorActionGroup;
  /** Optional keyword list for the palette's fuzzy search. */
  keywords?: string[];
  /** Optional leading icon (lucide React node). */
  icon?: ReactNode;
  /**
   * Whether the action is currently runnable for the given selection.
   * Default: always available.
   */
  appliesTo?: (sel: EditorSelection) => boolean;
  /** The actual work. May be async. Errors are surfaced via toast by the host. */
  run: () => Promise<void> | void;
  /** When true, the palette filters this action out (used for busy/disabled states). */
  disabled?: boolean;
};

/** Convenience: filter a registry down to actions applicable to a selection. */
export function actionsForSelection(
  registry: EditorAction[],
  selection: EditorSelection,
): EditorAction[] {
  return registry.filter((a) => !a.appliesTo || a.appliesTo(selection));
}

/** Lookup-by-id helper for inspector buttons. Throws in dev if id is missing
 *  so typos surface immediately. */
export function actionById(registry: EditorAction[], id: string): EditorAction | undefined {
  return registry.find((a) => a.id === id);
}

/** Group actions for palette rendering (`cmdk` Command.Group). */
export function groupActions(registry: EditorAction[]): Map<EditorActionGroup, EditorAction[]> {
  const out = new Map<EditorActionGroup, EditorAction[]>();
  for (const a of registry) {
    const arr = out.get(a.group) ?? [];
    arr.push(a);
    out.set(a.group, arr);
  }
  return out;
}
