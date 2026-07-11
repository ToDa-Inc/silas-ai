import type { AppLocale } from "@/i18n/config";

/** Locale-aware number formatting for UI metrics. */
export function formatNumber(n: number, locale: AppLocale): string {
  return n.toLocaleString(locale === "de" ? "de-DE" : "en-US");
}

/** Locale-aware compact date (e.g. Mar 8). */
export function formatShortDate(iso: string | Date, locale: AppLocale): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(locale === "de" ? "de-DE" : "en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Locale-aware date + time for analysis timestamps. */
export function formatDateTime(iso: string | Date, locale: AppLocale): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString(locale === "de" ? "de-DE" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
