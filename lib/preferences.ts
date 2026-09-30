export const THEME_STORAGE_KEY = "pulsefolio-theme";
export const LOCALE_STORAGE_KEY = "pulsefolio-locale";
export const THEME_COOKIE_KEY = "pulsefolio-theme";
export const LOCALE_COOKIE_KEY = "pulsefolio-locale";
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const SUPPORTED_THEMES = ["light", "dark"] as const;

export type Theme = (typeof SUPPORTED_THEMES)[number];
export type Locale = "en" | "fr";

export function isTheme(value: string | null | undefined): value is Theme {
  return SUPPORTED_THEMES.includes(value as Theme);
}

