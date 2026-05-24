/**
 * VariantsRail — horizontal pick-list for AI-generated alternates.
 *
 * Today "regenerate" gives you one option; to see another you regenerate
 * and lose the previous. The rail flips this: you ask for N options, the
 * AI returns them, the rail shows them side-by-side, you click one to
 * commit. The remaining options stay around for comparison.
 *
 * Status (Phase F): frontend primitive ready, backend endpoint is the
 * follow-up work. The schema migration that stores alternates is at
 * `backend/sql/phase29_alternates.sql`. The endpoint contract this
 * component expects:
 *
 *   POST /api/v1/clients/{slug}/generate/sessions/{id}/variants
 *     body:    { kind: "hook" | "block" | "cover" | "caption",
 *                element_id?: string, n?: number, feedback?: string }
 *     returns: { variants: VariantOption[] }
 *
 * The host (editor format) wires `onRequest` to call the endpoint and
 * `onCommit` to apply the picked option (patch the live spec / cover text /
 * caption — whichever the host owns). Variants stay rendered after commit
 * with the active one highlighted, so users can A/B between them.
 *
 * Pure leaf (props in / events out). Same rendering whether the variants
 * came from a fresh request or were rehydrated from `generation_sessions.alternates`.
 */

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

export type VariantOption = {
  /** Stable id for keying + commit. */
  id: string;
  /** Display text. For cover/caption this is the whole headline/caption;
   *  for hooks it's the hook line; for blocks it's the block text. */
  text: string;
  /** Where it came from: original generation, explicit variants call, refine output. */
  source?: "auto" | "variants" | "refine";
  /** ISO timestamp for sort/UI (frontend-native camelCase). */
  createdAt?: string;
  /** ISO timestamp from the backend `/variants` endpoint. */
  created_at?: string;
};

type Props = {
  /** Variants to render. Empty array → renders a "Generate N variants" button. */
  variants: VariantOption[];
  /** Currently-committed text (matches against `variant.text` to highlight). */
  committedText: string;
  /** True while a request is in flight. */
  busy?: boolean;
  /** Number of variants requested per click. Default 5. */
  requestN?: number;
  /** Label shown above the rail (e.g. "Hook variants", "Caption options"). */
  label?: string;
  /** Optional empty-state hint (when no variants yet AND not busy). */
  emptyHint?: string;
  /** Fires when the user clicks "Generate N variants" (or "Regenerate"). */
  onRequest: (n: number) => void | Promise<void>;
  /** Fires when the user clicks a variant card to commit it. */
  onCommit: (v: VariantOption) => void | Promise<void>;
};

export function VariantsRail({
  variants,
  committedText,
  busy = false,
  requestN = 5,
  label = "Variants",
  emptyHint = "No variants yet — ask the AI for options to compare side-by-side.",
  onRequest,
  onCommit,
}: Props) {
  const [pickingId, setPickingId] = useState<string | null>(null);

  const handlePick = async (v: VariantOption) => {
    setPickingId(v.id);
    try {
      await onCommit(v);
    } finally {
      setPickingId(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-app-fg-muted">
          {label}
          {variants.length > 0 ? (
            <span className="ml-1.5 font-normal text-app-fg-subtle">({variants.length})</span>
          ) : null}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRequest(requestN)}
          className="inline-flex items-center gap-1 rounded-lg border border-app-divider px-2 py-1 text-[10px] font-semibold text-app-fg-muted transition hover:border-amber-500/40 hover:text-app-fg disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {variants.length > 0 ? `Get ${requestN} more` : `Generate ${requestN}`}
        </button>
      </div>

      {variants.length === 0 ? (
        <p className="rounded-xl border border-dashed border-app-divider/60 px-3 py-4 text-center text-[11px] leading-relaxed text-app-fg-subtle">
          {emptyHint}
        </p>
      ) : (
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {variants.map((v) => {
            const active = v.text === committedText;
            const picking = pickingId === v.id;
            return (
              <li key={v.id} className="shrink-0">
                <button
                  type="button"
                  disabled={busy || picking}
                  onClick={() => void handlePick(v)}
                  className={`flex h-full w-[180px] flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition ${
                    active
                      ? "border-amber-500/55 bg-amber-500/12 text-app-fg shadow-sm"
                      : "border-app-divider/70 bg-app-chip-bg/30 text-app-fg-muted hover:border-amber-500/40 hover:text-app-fg"
                  } disabled:opacity-50`}
                >
                  <span className="line-clamp-4 text-[11px] leading-snug">{v.text}</span>
                  <span className="mt-auto inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-app-fg-subtle">
                    {active ? "Active" : picking ? "Applying…" : v.source ?? "variant"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
