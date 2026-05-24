/**
 * useVideoEditor — planned hook that will own video-format state and autosave.
 *
 * Status: STUB. Intentional.
 *
 * The video pipeline (text_overlay / b_roll_reel) currently still lives
 * inside `video-create-workspace.tsx` because its state and autosave loop
 * (`videoSpec`, `textDraft`, `bgSource`, ~40 callbacks) are tightly bound
 * to the workspace's session lifecycle.
 *
 * Phase B.5 deliberately stopped short of a mechanical JSX-only extraction
 * into `VideoEditor.tsx`. Wrapping the existing 1,400-line render path in a
 * single "god props" component (~80 props) would be relocation, not
 * refactoring — it would obscure the real coupling without changing it, and
 * Phase C is going to replace the step-based JSX with the Studio shell + a
 * selection-driven inspector anyway.
 *
 * When Phase C wires the Studio shell up, this hook will:
 *   1. Own `videoSpec`, `textDraft`, `bgSource`, `selectedSegmentId`, etc.
 *   2. Expose typed command callbacks (`patchSpec`, `setBackgroundSource`,
 *      `setSelectedSegment`, `regenSection`, …) that the inspector and the
 *      ⌘K palette call.
 *   3. Wrap the autosave plumbing (`patchSessionVideoSpec`, `patchCreateSession`)
 *      that's currently inlined in workspace.tsx.
 *
 * Until then, callers should keep using the workspace as the orchestrator.
 */

import type { Operation } from "fast-json-patch";
import type { GenerationSession, TextBlock } from "@/lib/api-client";
import type { VideoSpec } from "@/lib/video-spec";

export type EditorSelection =
  | { kind: "none" }
  | { kind: "hook" }
  | { kind: "block"; id: string }
  | { kind: "background" }
  | { kind: "beat"; id: string }
  | { kind: "coverElement"; id: string };

/**
 * Target shape for the hook's return value. Components built against this
 * surface (the StudioShell inspector, the ⌘K action registry) will compile
 * against it before the workspace migration lands.
 */
export type UseVideoEditorReturn = {
  session: GenerationSession;
  spec: VideoSpec | null;
  textDraft: { hook: string; blocks: TextBlock[] };
  selection: EditorSelection;
  inFlight: number;

  patchSpec: (ops: Operation[]) => Promise<void>;
  setSelection: (s: EditorSelection) => void;
};
