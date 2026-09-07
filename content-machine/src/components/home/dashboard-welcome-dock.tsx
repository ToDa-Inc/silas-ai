"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useHomeCopy } from "@/lib/home-ui";
import { usePrefersReducedMotion } from "@/lib/use-prefers-reduced-motion";

const storageKey = (clientSlug: string) => `silas.welcomeDock.v1:${clientSlug}`;

type Props = {
  clientSlug: string;
  completed: boolean;
};

export function DashboardWelcomeDock({ clientSlug, completed }: Props) {
  const copy = useHomeCopy();
  const reducedMotion = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!completed || !clientSlug || typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(storageKey(clientSlug)) === "1") return;
    } catch {
      return;
    }
    setOpen(true);
  }, [clientSlug, completed]);

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey(clientSlug), "1");
    } catch {
      /* ignore quota / private mode */
    }
    setOpen(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("welcome")) {
        url.searchParams.delete("welcome");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    }
  }

  if (!open) return null;

  return (
    <motion.aside
      role="dialog"
      aria-label={copy.welcomeDockTitle}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className="fixed right-4 top-24 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-amber-400/40 bg-white p-5 shadow-[0_0_48px_-8px_rgba(245,158,11,0.55),0_18px_40px_-16px_rgba(0,0,0,0.25)] dark:border-amber-300/30 dark:bg-zinc-950"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-400/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-8 left-6 h-20 w-20 rounded-full bg-amber-300/25 blur-2xl"
      />
      <div className="relative">
        <button
          type="button"
          onClick={dismiss}
          className="absolute -right-1 -top-1 rounded-lg p-1.5 text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/10"
          aria-label={copy.welcomeDockDismiss}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-black shadow-[0_0_24px_rgba(251,191,36,0.65)]">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <h2 className="pr-6 text-lg font-semibold text-zinc-950 dark:text-white">
          {copy.welcomeDockTitle}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
          {copy.welcomeDockBody}
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400"
        >
          {copy.welcomeDockCta}
        </button>
      </div>
    </motion.aside>
  );
}
