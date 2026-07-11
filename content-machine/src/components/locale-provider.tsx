"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { NextIntlClientProvider } from "next-intl";
import deMessages from "../../messages/de.json";
import enMessages from "../../messages/en.json";
import { type AppLocale, appTimeZone, isAppLocale, LOCALE_COOKIE } from "@/i18n/config";

const MESSAGE_CATALOG: Record<AppLocale, typeof enMessages> = {
  en: enMessages,
  de: deMessages,
};

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function setLocaleCookie(locale: AppLocale) {
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
}

export function useAppLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useAppLocale must be used within LocaleProvider");
  }
  return ctx;
}

/** Client-side locale + messages — instant DE/EN switch without router.refresh(). */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: AppLocale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(
    isAppLocale(initialLocale) ? initialLocale : "en",
  );

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState((current) => {
      if (current === next) return current;
      setLocaleCookie(next);
      document.documentElement.lang = next;
      return next;
    });
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={MESSAGE_CATALOG[locale]} timeZone={appTimeZone}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
