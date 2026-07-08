import type { StudioEditorEntryPoint } from "@/lib/studio-editor-context";

export function generateSessionHref(
  sessionId: string,
  from?: StudioEditorEntryPoint,
): string {
  const base = `/generate/${encodeURIComponent(sessionId)}`;
  if (from && from !== "create") {
    return `${base}?from=${encodeURIComponent(from)}`;
  }
  return base;
}
