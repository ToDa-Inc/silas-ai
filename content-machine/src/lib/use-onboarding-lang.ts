"use client";

import { useLocale } from "next-intl";
import type { OnboardingLang } from "@/lib/onboarding-voice-questions";

/** Maps app UI locale to onboarding voice / content language. */
export function useOnboardingLang(): OnboardingLang {
  const locale = useLocale();
  return locale === "en" ? "en" : "de";
}
