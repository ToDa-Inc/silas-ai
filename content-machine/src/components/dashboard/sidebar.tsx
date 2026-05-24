"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useTransition, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { mainNav } from "./nav";
import { SignOutButton } from "./sign-out-button";
import { SidebarClientPanel } from "./sidebar-client-panel";
import { ThemeToggle } from "./theme-toggle";
import type { ClientOption } from "./client-switcher";

type SidebarProps = {
  onNavigate?: () => void;
  /** Inside mobile drawer — scrollable column, not sticky */
  embedded?: boolean;
  clients?: ClientOption[];
  activeSlug?: string;
  orgSlug?: string;
};

export function Sidebar({
  onNavigate,
  embedded,
  clients = [],
  activeSlug = "",
  orgSlug = "",
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPendingHref(null));
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  function navActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  }

  return (
    <aside
      className={cn(
        "z-40 flex w-[220px] flex-col border-r border-zinc-200/80 bg-white/90 px-4 py-4 backdrop-blur-md dark:border-app-card-border dark:bg-zinc-950/95",
        embedded
          ? "relative flex h-full min-h-0 flex-col"
          : "hidden md:sticky md:top-0 md:flex md:h-svh md:shrink-0 md:self-start",
      )}
    >
      <div className="mb-4 flex shrink-0 items-center justify-between gap-2 px-0.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-zinc-950">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          </div>
          <span className="truncate text-sm font-semibold text-app-fg">
            Silas
          </span>
        </div>
        <ThemeToggle />
      </div>

      <nav
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden py-1"
        aria-label="Main navigation"
      >
        {mainNav.map(({ href, label, icon: Icon, comingSoon }) => {
          const active = navActive(href);
          const navigatingHere = isPending && pendingHref === href;
          return (
            <Link
              key={href}
              href={href}
              prefetch
              aria-busy={navigatingHere}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                  return;
                }
                if (active) {
                  onNavigate?.();
                  return;
                }
                e.preventDefault();
                setPendingHref(href);
                startTransition(() => {
                  router.push(href);
                });
                onNavigate?.();
              }}
              className={cn(
                "flex items-center gap-3 rounded-r-lg border-l-2 border-transparent py-2 pl-3 pr-2 text-[13px] font-medium transition-opacity",
                active
                  ? "border-amber-500 bg-amber-500/12 text-amber-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  : "text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900 dark:text-app-fg-subtle dark:hover:bg-white/[0.06] dark:hover:text-app-fg-secondary",
                isPending && !navigatingHere && "opacity-50",
              )}
            >
              {navigatingHere ? (
                <Loader2
                  className="h-[18px] w-[18px] shrink-0 animate-spin text-amber-400"
                  aria-hidden
                />
              ) : (
                <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              )}
              <span className="flex flex-1 items-center justify-between gap-2">
                {label}
                {comingSoon ? (
                  <span className="rounded-sm bg-app-divider/60 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-app-fg-subtle">
                    Soon
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto shrink-0 space-y-1 border-t border-zinc-200 pt-4 dark:border-white/[0.06]">
        {/* The previous "New project" button was a toast-only stub
            ("Projects aren't multi-tenant yet"). Removed — every workspace
            already maps to a client, so the action had no real meaning. */}
        <SidebarClientPanel clients={clients} activeSlug={activeSlug} orgSlug={orgSlug} />
        <SignOutButton className="w-full justify-start" />
      </div>
    </aside>
  );
}
