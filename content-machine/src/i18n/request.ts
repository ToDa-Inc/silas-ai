import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, appTimeZone, isAppLocale, LOCALE_COOKIE } from "./config";

function localeFromAcceptLanguage(header: string | null): typeof defaultLocale | null {
  if (!header) return null;
  const parts = header.split(",").map((p) => p.trim().split(";")[0]?.toLowerCase() ?? "");
  if (parts.some((p) => p.startsWith("de"))) return "de";
  if (parts.some((p) => p.startsWith("en"))) return "en";
  return null;
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  let locale = isAppLocale(cookieLocale) ? cookieLocale : defaultLocale;

  if (!isAppLocale(cookieLocale)) {
    const h = await headers();
    locale = localeFromAcceptLanguage(h.get("accept-language")) ?? defaultLocale;
  }

  return {
    locale,
    timeZone: appTimeZone,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
