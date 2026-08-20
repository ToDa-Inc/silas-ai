"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export function SignupClient() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const { data, error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
        },
      });
      if (signErr) {
        setError(signErr.message);
        return;
      }
      if (data.session) {
        router.replace("/onboarding");
        router.refresh();
        return;
      }
      setInfo(t("checkEmail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-container-lowest px-4">
      <div className="w-full max-w-sm rounded-2xl border border-outline-variant/10 bg-surface-container p-8 shadow-xl">
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
            <UserPlus className="h-7 w-7" aria-hidden />
          </div>
        </div>
        <h1 className="text-center text-xl font-bold text-on-surface">{t("createAccount")}</h1>
        <p className="mt-2 text-center text-sm text-zinc-500">{t("signUpSubtitle")}</p>
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100"
              required
              minLength={6}
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {info ? <p className="text-sm text-amber-200/90">{info}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container py-2.5 text-sm font-bold text-on-primary-container disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {busy ? t("creating") : t("signUp")}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-zinc-500">
          {t("alreadyHaveAccount")}{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            {t("signInLink")}
          </Link>
        </p>
      </div>
    </main>
  );
}
