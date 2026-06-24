"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { AvatarMenu } from "./avatar-menu";
import { ClientSwitcher, type ClientOption } from "./client-switcher";

type TopBarProps = {
  clients?: ClientOption[];
  activeSlug?: string;
  orgSlug?: string;
};

export function TopBar({ clients = [], activeSlug = "", orgSlug = "" }: TopBarProps) {
  const pathname = usePathname();
  const onHome = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 md:max-w-4xl md:px-6">
        <Link
          href="/dashboard"
          className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-zinc-950">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
          </div>
          <span className="truncate text-sm font-semibold text-app-fg">Silas</span>
        </Link>

        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          {clients.length > 0 ? (
            <div className="hidden min-w-0 sm:block">
              <ClientSwitcher clients={clients} activeSlug={activeSlug} orgLabel={orgSlug} />
            </div>
          ) : null}
          <AvatarMenu clients={clients} activeSlug={activeSlug} orgSlug={orgSlug} />
        </div>
      </div>

      {clients.length > 0 ? (
        <div className="border-t border-zinc-200/80 px-4 py-2 dark:border-white/10 sm:hidden">
          <ClientSwitcher clients={clients} activeSlug={activeSlug} orgLabel={orgSlug} />
        </div>
      ) : null}

      {onHome ? (
        <div className="sr-only" aria-live="polite">
          Home
        </div>
      ) : null}
    </header>
  );
}
