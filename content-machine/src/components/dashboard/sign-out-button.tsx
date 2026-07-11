"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

type SignOutButtonProps = {
  className?: string;
};

export function SignOutButton({ className }: SignOutButtonProps) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      {busy ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/55 px-4 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950/90 px-6 py-5 text-center shadow-2xl">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" aria-hidden />
            <p className="text-sm font-semibold text-zinc-100">{t("signingOut")}</p>
            <p className="text-xs text-zinc-400">{t("signOutHint")}</p>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void signOut()}
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-200/80 hover:text-zinc-900 disabled:cursor-wait disabled:opacity-60 dark:text-zinc-500 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200",
          className,
        )}
        title={t("signOut")}
      >
        {busy ? (
          <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" aria-hidden />
        ) : (
          <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden />
        )}
        {busy ? t("signingOut") : t("signOut")}
      </button>
    </>
  );
}
