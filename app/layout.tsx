import type { Metadata } from "next";
import { cookies } from "next/headers";

import {
  PreferenceScript,
  PreferencesProvider,
} from "@/components/providers/preferences-provider";
import { APP_LOGO_ALT, APP_LOGO_SRC } from "@/lib/brand/logo";
import { isTheme, THEME_COOKIE_KEY } from "@/lib/preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulsefolio",
  description:
    "Portfolio-aware finance frontend MVP for AI analysis and personalized market news.",
  icons: {
    icon: APP_LOGO_SRC,
    apple: APP_LOGO_SRC,
  },
  openGraph: {
    images: [{ url: APP_LOGO_SRC, alt: APP_LOGO_ALT }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(THEME_COOKIE_KEY)?.value;
  const initialTheme = isTheme(themeCookie) ? themeCookie : "dark";
  const initialLocale = "en";

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


