"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Maximize2, Minimize2, X } from "lucide-react";
import { VideoCreateWorkspace } from "@/components/video-create-workspace";
import { StudioShellProvider } from "@/components/studio-shell-context";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { HOME_COPY } from "@/lib/home-ui";
import { cn } from "@/lib/cn";

type Props = {
  open: boolean;
  sessionId: string | null;
  clientSlug: string;
  orgSlug: string;
  layoutId?: string;
  onClose: () => void;
};

export function StudioOverlay({
  open,
  sessionId,
  clientSlug,
  orgSlug,
  layoutId,
  onClose,
}: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const [expanded, setExpanded] = useState(false);

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

  return (
    <AnimatePresence>
      {open && sessionId ? (
        <>
          <motion.button
            type="button"
            aria-label="Close studio"
            className={cn(
              "fixed inset-0 z-[90] backdrop-blur-sm transition-colors",
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
            aria-label={HOME_COPY.openStudio}
            className={cn(
              "fixed z-[100] flex flex-col overflow-hidden border border-zinc-200 bg-zinc-50 shadow-2xl dark:border-white/10 dark:bg-zinc-950",
              expanded
                ? "inset-0 rounded-none md:inset-3 md:rounded-2xl"
                : cn(
                    "inset-x-0 bottom-0 max-h-[min(96vh,940px)] rounded-t-2xl",
                    "md:inset-x-auto md:left-1/2 md:top-1/2 md:max-h-[min(92vh,900px)] md:w-[min(100vw-1.5rem,1080px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl",
                  ),
            )}
            {...(layoutId ? { layoutId } : {})}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.99 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-white/10 sm:px-4 sm:py-3">
              <nav aria-label="Editor location" className="min-w-0 flex-1 truncate text-sm text-app-fg-muted">
                <span className="font-semibold text-amber-600 dark:text-amber-400">Home</span>
                <span className="mx-1.5 text-app-fg-subtle">›</span>
                <span className="font-semibold text-app-fg">{HOME_COPY.openStudio}</span>
              </nav>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/generate/${sessionId}`}
                  className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10 sm:inline-flex"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  {HOME_COPY.openFullEditor}
                </Link>
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10 sm:inline-flex"
                  aria-expanded={expanded}
                >
                  {expanded ? (
                    <>
                      <Minimize2 className="h-3.5 w-3.5" aria-hidden />
                      {HOME_COPY.collapseStudio}
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                      {HOME_COPY.expandStudio}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded((e) => !e)}
                  className="inline-flex rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-white/10 sm:hidden"
                  aria-label={expanded ? HOME_COPY.collapseStudio : HOME_COPY.expandStudio}
                >
                  {expanded ? (
                    <Minimize2 className="h-5 w-5" aria-hidden />
                  ) : (
                    <Maximize2 className="h-5 w-5" aria-hidden />
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
                "min-h-0 flex-1 overflow-y-auto overscroll-contain",
                expanded ? "px-4 py-4 sm:px-6 sm:py-5" : "px-3 py-3 sm:px-5 sm:py-4",
              )}
            >
              <StudioShellProvider value={{ embedded: true, expanded, entryPoint: "home" }}>
                <VideoCreateWorkspace
                  key={sessionId}
                  clientSlug={clientSlug}
                  orgSlug={orgSlug}
                  sessionId={sessionId}
                  embedded
                />
              </StudioShellProvider>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
