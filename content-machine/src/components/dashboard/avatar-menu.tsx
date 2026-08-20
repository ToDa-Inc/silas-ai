"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Menu, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { LanguageSwitcher } from "./language-switcher";
import { useStudioNav } from "./nav";
import { SignOutButton } from "./sign-out-button";
import { SidebarClientPanel } from "./sidebar-client-panel";
import { ThemeToggle } from "./theme-toggle";
import type { ClientOption } from "./client-switcher";

type AvatarMenuProps = {
  clients?: ClientOption[];
  activeSlug?: string;
  orgSlug?: string;
  onNavigate?: () => void;
};

export function AvatarMenu({
  clients = [],
  activeSlug = "",
  orgSlug = "",
  onNavigate,
}: AvatarMenuProps) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const studioNav = useStudioNav();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setPendingHref(null));
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function navActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  }

  function close() {
    setOpen(false);
    onNavigate?.();
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        aria-label={t("openMenu")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <Menu className="h-4 w-4" aria-hidden />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label={t("closeMenu")}
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              "fixed inset-y-0 right-0 z-[80] flex w-[min(100vw,280px)] flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-950",
              "md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 md:max-h-[min(80vh,520px)] md:w-[260px] md:rounded-xl md:border md:shadow-xl",
            )}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-white/10">
              <span className="flex items-center gap-2 text-sm font-semibold text-app-fg">
                <User className="h-4 w-4 text-zinc-500" aria-hidden />
                {t("studio")}
              </span>
              <div className="flex items-center gap-2">
                <LanguageSwitcher compact />
                <ThemeToggle />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <SidebarClientPanel clients={clients} activeSlug={activeSlug} orgSlug={orgSlug} />

              <p className="mb-2 mt-4 px-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {t("powerFeatures")}
              </p>
              <nav className="space-y-0.5" aria-label={t("studioNav")}>
                {studioNav.map(({ href, label, icon: Icon, comingSoon }) => {
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
                          close();
                          return;
                        }
                        e.preventDefault();
                        setPendingHref(href);
                        startTransition(() => {
                          router.push(href);
                        });
                        close();
                      }}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/[0.06]",
                        isPending && !navigatingHere && "opacity-50",
                      )}
                    >
                      {navigatingHere ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                      ) : (
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      )}
                      <span className="flex flex-1 items-center justify-between gap-2">
                        {label}
                        {comingSoon ? (
                          <span className="rounded-sm bg-app-divider/60 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-app-fg-subtle">
                            {tCommon("soon")}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="shrink-0 border-t border-zinc-200 p-3 dark:border-white/10">
              <SignOutButton className="w-full justify-start" />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
