"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Loader2, Maximize2, Minimize2, X } from "lucide-react";
import { VideoCreateWorkspace } from "@/components/video-create-workspace";
import { StudioShellProvider } from "@/components/studio-shell-context";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { useHomeCopy } from "@/lib/home-ui";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  sessionId: string | null;
  preparing?: boolean;
  clientSlug: string;
  orgSlug: string;
  onClose: () => void;
};

export function StudioOverlay({
  open,
  sessionId,
  preparing = false,
  clientSlug,
  orgSlug,
  onClose,
}: Props) {
  const copy = useHomeCopy();
  const reducedMotion = usePrefersReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (expanded) setExpanded(false);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, expanded]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close studio"
            className={cn(
              "fixed inset-0 z-[200] backdrop-blur-sm transition-colors",
              expanded ? "bg-black/65" : "bg-black/50",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label={copy.openStudio}
            className={cn(
              "fixed z-[210] flex flex-col overflow-hidden border border-zinc-200 bg-zinc-50 shadow-2xl dark:border-white/10 dark:bg-zinc-950",
              // Mobile: full viewport so the editor is never clipped by a short bottom sheet.
              "inset-0 h-[100dvh] max-h-[100dvh] rounded-none",
              expanded
                ? "md:inset-3 md:h-auto md:max-h-none md:rounded-2xl"
                : cn(
                    "md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(88dvh,860px)] md:max-h-[min(88dvh,860px)] md:w-[min(calc(100vw-2rem),1080px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl",
                  ),
            )}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] dark:border-white/10 sm:px-4 sm:py-3">
              <nav aria-label="Editor location" className="min-w-0 flex-1 truncate text-sm text-app-fg-muted">
                <span className="font-semibold text-amber-600 dark:text-amber-400">Home</span>
                <span className="mx-1.5 text-app-fg-subtle">›</span>
                <span className="font-semibold text-app-fg">{copy.openStudio}</span>
              </nav>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/generate/${sessionId}`}
                  className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10 sm:inline-flex"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  {copy.openFullEditor}
                </Link>
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10 md:inline-flex"
                  aria-expanded={expanded}
                >
                  {expanded ? (
                    <>
                      <Minimize2 className="h-3.5 w-3.5" aria-hidden />
                      {copy.collapseStudio}
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                      {copy.expandStudio}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-white/10"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </div>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]",
                expanded ? "px-4 py-4 sm:px-6 sm:py-5" : "px-3 py-3 sm:px-5 sm:py-4",
              )}
            >
              {sessionId ? (
                <StudioShellProvider value={{ embedded: true, expanded, entryPoint: "home" }}>
                  <VideoCreateWorkspace
                    key={sessionId}
                    clientSlug={clientSlug}
                    orgSlug={orgSlug}
                    sessionId={sessionId}
                    embedded
                  />
                </StudioShellProvider>
              ) : (
                <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-500" aria-hidden />
                  <p className="text-sm font-medium text-app-fg">
                    {preparing ? copy.openingStudio : copy.preparing}
                  </p>
                  <p className="max-w-sm text-xs leading-relaxed text-app-fg-muted">
                    {copy.heroDraftPreparingSub}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
