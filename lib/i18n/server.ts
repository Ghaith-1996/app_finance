import { createTranslator } from "@/lib/i18n";
import { type Locale } from "@/lib/preferences";

async function getRequestLocale(): Promise<Locale> {
  return "en";
}

export async function getTranslations() {
  const locale = await getRequestLocale();
  return {
    locale,
    t: createTranslator(locale),
  };
}
