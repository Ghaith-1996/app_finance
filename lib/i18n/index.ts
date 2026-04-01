import { dictionaries, type Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/preferences";

function lookup(dict: Dictionary, path: string): string {
  const parts = path.split(".");
  let current: unknown = dict;

  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return path;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : path;
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}

export function createTranslator(locale: Locale) {
  const dict = getDictionary(locale);
  return (path: string) => lookup(dict, path);
}

