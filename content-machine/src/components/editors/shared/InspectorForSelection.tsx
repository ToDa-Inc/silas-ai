/**
 * InspectorForSelection — renders the right pane content for whatever the
 * editor currently has selected.
 *
 * Selection-driven replacement for the old `[Background] [Look] [Timing]`
 * sub-tabs in the video editor and the `[Content] [Style] [Image]` sub-tabs
 * in the cover editor. Click something → controls update.
 *
 * Per-selection renderers (`renderers` prop) are supplied by each format
 * editor — they own the actual control JSX. This component is the thin
 * dispatcher that picks the right renderer for the current selection.
 *
 * The visible "Search actions… ⌘K" pill at the top of the inspector lives
 * here too (rendered on every selection state) so the palette is always
 * discoverable without polluting individual control panels.
 */

import type { ReactNode } from "react";
import { Search } from "lucide-react";

import type { EditorSelection } from "./useEditorSelection";

/**
 * Each format editor supplies a partial renderers map. Selections that the
 * format doesn't support (e.g. carousel doesn't have `beat`) just don't
 * appear in the map; the inspector falls back to the global controls panel.
 */
export type InspectorRenderers = Partial<{
  none: ReactNode;
  hook: ReactNode;
  block: (id: string) => ReactNode;
  background: ReactNode;
  beat: (id: string) => ReactNode;
  coverElement: (id: string) => ReactNode;
  slide: (idx: number) => ReactNode;
}>;

export type InspectorForSelectionProps = {
  selection: EditorSelection;
  renderers: InspectorRenderers;
  /** Opens the ⌘K command palette. Set in the format editor's render. */
  onOpenCommandPalette: () => void;
  /** Pre-selection header (e.g. global Save status). Optional. */
  header?: ReactNode;
};

export function InspectorForSelection({
  selection,
  renderers,
  onOpenCommandPalette,
  header,
}: InspectorForSelectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="glass-inset inline-flex flex-1 items-center gap-2 rounded-lg border border-app-divider/60 px-2.5 py-1.5 text-[11px] text-app-fg-subtle transition hover:border-amber-500/40 hover:text-app-fg"
          aria-label="Open command palette"
        >
          <Search className="h-3 w-3 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">Search actions…</span>
          <kbd className="shrink-0 rounded border border-app-divider bg-app-chip-bg/60 px-1 py-px font-mono text-[9px] text-app-fg-muted">
            ⌘K
          </kbd>
        </button>
        {header ? <div className="shrink-0">{header}</div> : null}
      </div>

      <div className="min-w-0">{renderForSelection(selection, renderers)}</div>
    </div>
  );
}

function renderForSelection(
  selection: EditorSelection,
  renderers: InspectorRenderers,
): ReactNode {
  switch (selection.kind) {
    case "none":
      return renderers.none ?? <DefaultEmptyInspector />;
    case "hook":
      return renderers.hook ?? <UnavailableInspector kind="hook" />;
    case "block":
      return renderers.block ? renderers.block(selection.id) : <UnavailableInspector kind="block" />;
    case "background":
      return renderers.background ?? <UnavailableInspector kind="background" />;
    case "beat":
      return renderers.beat ? renderers.beat(selection.id) : <UnavailableInspector kind="beat" />;
    case "coverElement":
      return renderers.coverElement
        ? renderers.coverElement(selection.id)
        : <UnavailableInspector kind="cover element" />;
    case "slide":
      return renderers.slide ? renderers.slide(selection.idx) : <UnavailableInspector kind="slide" />;
  }
}

function DefaultEmptyInspector() {
  return (
    <div className="rounded-xl border border-dashed border-app-divider/60 p-4 text-center">
      <p className="text-[11px] leading-relaxed text-app-fg-muted">
        Click anything on the preview to edit it, or press{" "}
        <kbd className="rounded border border-app-divider bg-app-chip-bg/60 px-1 py-px font-mono text-[9px] text-app-fg">
          ⌘K
        </kbd>{" "}
        to search actions.
      </p>
    </div>
  );
}

function UnavailableInspector({ kind }: { kind: string }) {
  return (
    <div className="rounded-xl border border-dashed border-app-divider/60 p-4 text-center">
      <p className="text-[11px] leading-relaxed text-app-fg-subtle">
        This format doesn&apos;t expose controls for {kind}.
      </p>
    </div>
  );
}
