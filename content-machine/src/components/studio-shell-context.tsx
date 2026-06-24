"use client";

import { createContext, useContext } from "react";

export type StudioShellState = {
  /** Rendered inside the Home studio overlay (not the full /generate page). */
  embedded: boolean;
  /** Studio overlay is in full-screen expanded mode. */
  expanded: boolean;
};

const StudioShellContext = createContext<StudioShellState>({
  embedded: false,
  expanded: false,
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
