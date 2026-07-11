/**
 * InteractiveOverlay — click-to-select bounding boxes over a sealed preview.
 *
 * Status: BEHIND FEATURE FLAG (`NEXT_PUBLIC_STUDIO_INPLACE_EDIT`). Phase E.
 *
 * The Remotion `<Player>` is a sealed playback surface — it can't natively
 * report click hits on its inner elements (hook text, blocks, background).
 * To enable selection (and eventually inline editing), we render an
 * absolutely-positioned HTML overlay sized to match the preview, with
 * click-target divs sized to each element's bounds.
 *
 * Important: this duplicates positioning math. The hit-test math here MUST
 * stay in sync with the Remotion Renderer's actual element placement.
 * That's the same drift problem the `check-remotion-spec-drift.js` script
 * catches in CI for the two `remotion-spec` directories — Phase E adds
 * preview-overlay-vs-renderer drift as a third source. Treat carefully.
 *
 * For now: the overlay only exposes SELECTION (click → set selection). True
 * inline `contentEditable` text editing is gated until we have a shared
 * `computeElementBounds(spec, viewportSize)` helper in `remotion-spec`
 * that BOTH the Renderer AND this overlay consume (single source of truth).
 *
 * Until that helper lands, the overlay is opt-in via env flag so we can
 * dogfood it without shipping drift risk to all users:
 *
 *   NEXT_PUBLIC_STUDIO_INPLACE_EDIT=1  → overlay renders on top of preview
 *   (anything else, or unset)          → preview is read-only as today
 *
 * The fallback path — selection-via-inspector — is already implemented via
 * the `useEditorSelection` hook. So if Phase E doesn't pan out under
 * dogfooding, we ship the inspector-only flow and lose nothing.
 */

import { useCallback, type CSSProperties } from "react";
import type { EditorSelection } from "./useEditorSelection";

/**
 * Read-only check for the feature flag. Components that mount this overlay
 * should branch on `isStudioInplaceEditEnabled()` and skip rendering when
 * disabled — keeps the overlay out of the DOM entirely in production.
 */
export function isStudioInplaceEditEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const v = process.env.NEXT_PUBLIC_STUDIO_INPLACE_EDIT;
  return v === "1" || v === "true";
}

/**
 * Normalized hit region in the preview's coordinate space. All values are
 * fractions of the preview's rendered width / height (so the overlay is
 * resolution-independent — same coords work at width=280, 360, 1080).
 *
 * Components computing bounds should match the Renderer's layout math to
 * avoid the drift problem flagged above.
 */
export type HitRegion = {
  /** Top-left x (0..1). */
  x: number;
  /** Top-left y (0..1). */
  y: number;
  /** Width (0..1). */
  w: number;
  /** Height (0..1). */
  h: number;
  /** Selection emitted when the region is clicked. */
  selection: EditorSelection;
  /** Optional accessible label for the click target. */
  label?: string;
};

type Props = {
  /** All hit regions in normalized coords. */
  regions: HitRegion[];
  /** Current selection — drives the visible highlight outline. */
  selection: EditorSelection;
  /** Fires when a region is clicked. */
  onSelect: (s: EditorSelection) => void;
  /**
   * Optional: when true, render outlines for every region (debugging).
   * Defaults to false — only the *selected* region gets a visible outline.
   */
  debugShowAll?: boolean;
};

export function InteractiveOverlay({ regions, selection, onSelect, debugShowAll }: Props) {
  const isSameSelection = useCallback(
    (a: EditorSelection, b: EditorSelection) => JSON.stringify(a) === JSON.stringify(b),
    [],
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30"
      aria-label="Preview selection overlay"
    >
      {regions.map((r, i) => {
        const active = isSameSelection(r.selection, selection);
        const style: CSSProperties = {
          left: `${r.x * 100}%`,
          top: `${r.y * 100}%`,
          width: `${r.w * 100}%`,
          height: `${r.h * 100}%`,
        };
        return (
          <button
            key={`${r.selection.kind}-${i}`}
            type="button"
            aria-label={r.label ?? `Select ${r.selection.kind}`}
            onClick={() => onSelect(r.selection)}
            style={style}
            className={`pointer-events-auto absolute rounded-md transition-shadow ${
              active
                ? "shadow-[inset_0_0_0_2px_var(--brand-accent)]"
                : debugShowAll
                  ? "shadow-[inset_0_0_0_1px_var(--glow-accent)]"
                  : "shadow-none hover:shadow-[inset_0_0_0_1px_var(--shadow-accent)]"
            }`}
          />
        );
      })}
    </div>
  );
}
