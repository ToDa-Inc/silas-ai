import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { getLocale, getTranslations } from "next-intl/server";
import { LocaleProvider } from "@/components/locale-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { isAppLocale } from "@/i18n/config";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const appLocale = isAppLocale(locale) ? locale : "en";

  return (
    <html lang={appLocale} className={plusJakarta.variable} suppressHydrationWarning>
      <body className="min-h-screen min-h-svh font-sans antialiased">
        <LocaleProvider initialLocale={appLocale}>
          <ThemeProvider>{children}</ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
