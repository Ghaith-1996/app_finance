import { cookies, headers } from "next/headers";

import { createTranslator } from "@/lib/i18n";
import {
  detectLocaleFromLanguageTag,
  isLocale,
  LOCALE_COOKIE_KEY,
  type Locale,
} from "@/lib/preferences";

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get(LOCALE_COOKIE_KEY)?.value;
  if (isLocale(localeCookie)) return localeCookie;

  const headerStore = await headers();
  const acceptLanguage = headerStore.get("accept-language");
  return detectLocaleFromLanguageTag(acceptLanguage);
}

export async function getTranslations() {
  const locale = await getRequestLocale();
  return {
    locale,
    t: createTranslator(locale),
  };
}
