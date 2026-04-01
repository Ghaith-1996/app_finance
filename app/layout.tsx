import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import {
  PreferenceScript,
  PreferencesProvider,
} from "@/components/providers/preferences-provider";
import { detectLocaleFromLanguageTag } from "@/lib/preferences";
import { isLocale, isTheme, LOCALE_COOKIE_KEY, THEME_COOKIE_KEY } from "@/lib/preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulsefolio",
  description:
    "Portfolio-aware finance frontend MVP for AI analysis and personalized market news.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const themeCookie = cookieStore.get(THEME_COOKIE_KEY)?.value;
  const localeCookie = cookieStore.get(LOCALE_COOKIE_KEY)?.value;

  const initialTheme = isTheme(themeCookie) ? themeCookie : "dark";
  const initialLocale = isLocale(localeCookie)
    ? localeCookie
    : detectLocaleFromLanguageTag(headerStore.get("accept-language"));

  return (
    <html
      lang={initialLocale}
      data-theme={initialTheme}
      className="bg-background"
      suppressHydrationWarning
    >
      <head>
        <PreferenceScript initialTheme={initialTheme} initialLocale={initialLocale} />
      </head>
      <body className="bg-background font-sans text-foreground antialiased" suppressHydrationWarning>
        <PreferencesProvider initialTheme={initialTheme} initialLocale={initialLocale}>
          {children}
        </PreferencesProvider>
      </body>
    </html>
  );
}
