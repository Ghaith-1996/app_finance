"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createTranslator } from "@/lib/i18n";
import {
  detectLocaleFromLanguageTag,
  isLocale,
  isTheme,
  LOCALE_COOKIE_KEY,
  LOCALE_STORAGE_KEY,
  PREFERENCE_COOKIE_MAX_AGE,
  THEME_COOKIE_KEY,
  THEME_STORAGE_KEY,
  type Locale,
  type Theme,
} from "@/lib/preferences";

type PreferencesContextValue = {
  locale: Locale;
  theme: Theme;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  t: (path: string) => string;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${PREFERENCE_COOKIE_MAX_AGE}; samesite=lax`;
}

function resolveBrowserTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyDocumentPreferences(theme: Theme, locale: Locale) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.lang = locale;
  root.style.colorScheme = theme;
}

export function PreferenceScript({
  initialTheme,
  initialLocale,
}: {
  initialTheme: Theme;
  initialLocale: Locale;
}) {
  const script = `
    (function () {
      var themeKey = ${JSON.stringify(THEME_STORAGE_KEY)};
      var localeKey = ${JSON.stringify(LOCALE_STORAGE_KEY)};
      var themeCookie = ${JSON.stringify(THEME_COOKIE_KEY)};
      var localeCookie = ${JSON.stringify(LOCALE_COOKIE_KEY)};
      var fallbackTheme = ${JSON.stringify(initialTheme)};
      var fallbackLocale = ${JSON.stringify(initialLocale)};
      var rawTheme = null;
      var rawLocale = null;
      try {
        rawTheme = window.localStorage.getItem(themeKey);
        rawLocale = window.localStorage.getItem(localeKey);
      } catch (_) {}
      var theme = rawTheme === "light" || rawTheme === "dark"
        ? rawTheme
        : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : fallbackTheme === "light" ? "light" : "dark");
      var locale = rawLocale === "en" || rawLocale === "fr"
        ? rawLocale
        : ((navigator.language || fallbackLocale).toLowerCase().indexOf("fr") === 0 ? "fr" : fallbackLocale === "fr" ? "fr" : "en");
      var root = document.documentElement;
      root.dataset.theme = theme;
      root.lang = locale;
      root.style.colorScheme = theme;
      document.cookie = themeCookie + "=" + theme + "; path=/; max-age=${PREFERENCE_COOKIE_MAX_AGE}; samesite=lax";
      document.cookie = localeCookie + "=" + locale + "; path=/; max-age=${PREFERENCE_COOKIE_MAX_AGE}; samesite=lax";
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export function PreferencesProvider({
  children,
  initialTheme,
  initialLocale,
}: {
  children: ReactNode;
  initialTheme: Theme;
  initialLocale: Locale;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      const nextTheme = isTheme(storedTheme) ? storedTheme : resolveBrowserTheme();
      const nextLocale = isLocale(storedLocale)
        ? storedLocale
        : detectLocaleFromLanguageTag(window.navigator.language);

      setThemeState(nextTheme);
      setLocaleState(nextLocale);
      applyDocumentPreferences(nextTheme, nextLocale);
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
      writeCookie(THEME_COOKIE_KEY, nextTheme);
      writeCookie(LOCALE_COOKIE_KEY, nextLocale);
    } catch {
      applyDocumentPreferences(theme, locale);
    }
  }, []);

  useEffect(() => {
    applyDocumentPreferences(theme, locale);
  }, [theme, locale]);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      /* ignore */
    }
    writeCookie(THEME_COOKIE_KEY, nextTheme);
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    } catch {
      /* ignore */
    }
    writeCookie(LOCALE_COOKIE_KEY, nextLocale);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      locale,
      theme,
      setLocale,
      setTheme,
      toggleTheme,
      t: createTranslator(locale),
    }),
    [locale, setLocale, setTheme, theme, toggleTheme],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return context;
}
