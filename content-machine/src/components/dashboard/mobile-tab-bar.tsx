"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { usePrimaryNav } from "./nav";

export function MobileTabBar() {
  const t = useTranslations("nav");
  const primaryNav = usePrimaryNav();
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
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/95 md:hidden"
      aria-label={t("primaryNav")}
    >
      <div className="mx-auto flex max-w-lg">
        {primaryNav.map(({ href, label, icon: Icon }) => {
          const active = navActive(href);
          const navigatingHere = isPending && pendingHref === href;
          return (
            <Link
              key={href}
              href={href}
              prefetch
              aria-current={active ? "page" : undefined}
              aria-busy={navigatingHere}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                  return;
                }
                if (active) return;
                e.preventDefault();
                setPendingHref(href);
                startTransition(() => {
                  router.push(href);
                });
              }}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                active
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-500 dark:hover:text-zinc-300",
                isPending && !navigatingHere && "opacity-50",
              )}
            >
              {navigatingHere ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Icon className="h-5 w-5" aria-hidden />
              )}
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
