"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, Minimize2, X } from "lucide-react";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";
import { useHomeCopy } from "@/lib/home-ui";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

const SideDrawerExpandedContext = createContext(false);

export function useSideDrawerExpanded() {
  return useContext(SideDrawerExpandedContext);
}

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** Show expand / collapse control in the header. */
  expandable?: boolean;
  /** Start in expanded (full-width) mode — used for analytics charts. */
  defaultExpanded?: boolean;
};

export function SideDrawer({
  open,
  title,
  onClose,
  children,
  className,
  expandable = true,
  defaultExpanded = false,
}: Props) {
  const copy = useHomeCopy();
  const t = useTranslations("dashboard");
  const reducedMotion = usePrefersReducedMotion();
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (open && defaultExpanded) setExpanded(true);
  }, [open, defaultExpanded]);

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

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label={t("closePanel")}
            className={cn(
              "fixed inset-0 z-[85] backdrop-blur-sm transition-colors",
              expanded ? "bg-black/60" : "bg-black/45",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal
            aria-label={title}
            className={cn(
              "fixed z-[90] flex flex-col overflow-hidden border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950",
              expanded
                ? "inset-0 max-h-none rounded-none md:inset-3 md:rounded-2xl"
                : cn(
                    "inset-x-0 bottom-0 max-h-[min(88vh,720px)] rounded-t-2xl",
                    "md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[min(100vw-2rem,420px)] md:rounded-none md:rounded-l-2xl",
                  ),
              className,
            )}
            initial={reducedMotion ? { opacity: 0 } : { x: "100%", opacity: 0.9 }}
            animate={
              reducedMotion
                ? { opacity: 1 }
                : expanded
                  ? { x: 0, opacity: 1, scale: 1 }
                  : { x: 0, opacity: 1 }
            }
            exit={reducedMotion ? { opacity: 0 } : { x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-white/10">
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-app-fg">{title}</h2>
              <div className="flex shrink-0 items-center gap-1">
                {expandable ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10 sm:inline-flex"
                    aria-expanded={expanded}
                  >
                    {expanded ? (
                      <>
                        <Minimize2 className="h-3.5 w-3.5" aria-hidden />
                        {copy.collapsePanel}
                      </>
                    ) : (
                      <>
                        <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                        {copy.expandForMore}
                      </>
                    )}
                  </button>
                ) : null}
                {expandable ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="inline-flex rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-white/10 sm:hidden"
                    aria-label={expanded ? copy.collapsePanel : copy.expandForMore}
                  >
                    {expanded ? (
                      <Minimize2 className="h-5 w-5" aria-hidden />
                    ) : (
                      <Maximize2 className="h-5 w-5" aria-hidden />
                    )}
                  </button>
                ) : null}
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
                "min-h-0 flex-1 overflow-y-auto px-4 py-4",
                expanded && "md:px-8 md:py-6",
              )}
            >
              <SideDrawerExpandedContext.Provider value={expanded}>
                {children}
              </SideDrawerExpandedContext.Provider>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
