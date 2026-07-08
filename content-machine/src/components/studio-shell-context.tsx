"use client";

import { createContext, useContext } from "react";
import type { StudioEditorEntryPoint } from "@/lib/studio-editor-context";

export type StudioShellState = {
  /** Rendered inside the Home studio overlay (not the full /generate page). */
  embedded: boolean;
  /** Studio overlay is in full-screen expanded mode. */
  expanded: boolean;
  /** Where the user opened the editor from — drives breadcrumb copy. */
  entryPoint: StudioEditorEntryPoint;
};

const StudioShellContext = createContext<StudioShellState>({
  embedded: false,
  expanded: false,
  entryPoint: "create",
});

export function StudioShellProvider({
  value,
  children,
}: {
  value: StudioShellState;
  children: React.ReactNode;
}) {
  return <StudioShellContext.Provider value={value}>{children}</StudioShellContext.Provider>;
}

export function useStudioShell() {
  return useContext(StudioShellContext);
}
