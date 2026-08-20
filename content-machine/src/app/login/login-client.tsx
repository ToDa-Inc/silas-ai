"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export function LoginClient() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";
  const authError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const urlError =
    authError === "auth"
      ? t("signInLinkExpired")
      : authError === "config"
        ? t("appMisconfigured")
        : null;
  const displayError = error ?? urlError;
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signErr) {
        setError(signErr.message);
        setBusy(false);
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("couldNotSignIn"));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-container-lowest px-4">
      {busy ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/55 px-4 backdrop-blur-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950/90 px-6 py-5 text-center shadow-2xl">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" aria-hidden />
            <p className="text-sm font-semibold text-zinc-100">{t("signingYouIn")}</p>
            <p className="text-xs text-zinc-400">{t("openingWorkspace")}</p>
          </div>
        </div>
      ) : null}
      <div className="w-full max-w-sm rounded-2xl border border-outline-variant/10 bg-surface-container p-8 shadow-xl">
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
            <Lock className="h-7 w-7" aria-hidden />
          </div>
        </div>
        <h1 className="text-center text-xl font-bold text-on-surface">{t("signIn")}</h1>
        <p className="mt-2 text-center text-sm text-zinc-500">{t("signInSubtitle")}</p>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {t("email")}
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {t("password")}
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100"
              required
            />
          </label>
          {displayError ? <p className="text-sm text-red-400">{displayError}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container py-2.5 text-sm font-bold text-on-primary-container disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? t("signingIn") : t("continue")}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500">
          {t("noAccount")}{" "}
          <Link href="/signup" className="font-semibold text-primary hover:underline">
            {t("signUp")}
          </Link>
        </p>
      </div>
    </main>
  );
}
