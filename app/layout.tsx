import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";

import {
  PreferenceScript,
  PreferencesProvider,
} from "@/components/providers/preferences-provider";
import { APP_LOGO_ALT } from "@/lib/brand/logo";
import { isTheme, THEME_COOKIE_KEY } from "@/lib/preferences";
import "./globals.css";

// Bundled (OFL, see app/fonts) so builds never fetch from Google; the E2E build has no internet access.
const manrope = localFont({ src: "./fonts/manrope-latin-variable.woff2", weight: "200 800", variable: "--font-manrope", display: "swap" });
const geistMono = localFont({ src: "./fonts/geist-mono-variable.woff2", weight: "100 900", variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  // Audit D14: route pages set a short title; the template adds the product name.
  title: { default: "Pulsefolio", template: "%s - Pulsefolio" },
  description:
    "Portfolio-aware market news, AI analysis, and a daily brief built around the holdings you own.",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/logo.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    images: [{ url: "/icon-192.png", alt: APP_LOGO_ALT }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(THEME_COOKIE_KEY)?.value;
  const initialTheme = isTheme(themeCookie) ? themeCookie : "light";
  const initialLocale = "en";

  return (
    <html
      lang={initialLocale}
      data-theme={initialTheme}
      className={`${manrope.variable} ${geistMono.variable} bg-background`}
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


