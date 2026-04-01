export const THEME_STORAGE_KEY = "pulsefolio-theme";
export const LOCALE_STORAGE_KEY = "pulsefolio-locale";
export const THEME_COOKIE_KEY = "pulsefolio-theme";
export const LOCALE_COOKIE_KEY = "pulsefolio-locale";
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const SUPPORTED_THEMES = ["light", "dark"] as const;
export const SUPPORTED_LOCALES = ["en", "fr"] as const;

export type Theme = (typeof SUPPORTED_THEMES)[number];
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function isTheme(value: string | null | undefined): value is Theme {
  return SUPPORTED_THEMES.includes(value as Theme);
}

export function isLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function detectLocaleFromLanguageTag(value: string | null | undefined): Locale {
  if (!value) return "en";
  return value.toLowerCase().startsWith("fr") ? "fr" : "en";
}

