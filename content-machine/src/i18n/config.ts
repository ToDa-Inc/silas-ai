export const locales = ["en", "de"] as const;
export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = "en";

/** Fixed timezone for next-intl formatters (avoids server/client hydration mismatches). */
export const appTimeZone = "Europe/Berlin";

export const LOCALE_COOKIE = "locale";

export const localeLabels: Record<AppLocale, string> = {
  en: "English",
  de: "Deutsch",
};

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return value === "en" || value === "de";
}
