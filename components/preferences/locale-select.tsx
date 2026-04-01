"use client";

import { useRouter } from "next/navigation";

import { usePreferences } from "@/components/providers/preferences-provider";
import type { Locale } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const localeOptions: Locale[] = ["en", "fr"];

export function LocaleSelect({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const { locale, setLocale, t } = usePreferences();

  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-subtle bg-surface/80 px-3 py-2 text-sm text-secondary",
        compact && "px-2.5 py-2",
        className,
      )}
    >
      <span className="sr-only">{t("preferences.languageLabel")}</span>
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        {t("preferences.publicLanguage")}
      </span>
      <select
        value={locale}
        onChange={(event) => {
          setLocale(event.target.value as Locale);
          router.refresh();
        }}
        className="themed-select min-w-[7rem] rounded-md bg-surface-raised px-2 py-1 text-sm font-medium text-primary outline-none"
      >
        {localeOptions.map((option) => (
          <option key={option} value={option}>
            {option === "en" ? t("common.english") : t("common.french")}
          </option>
        ))}
      </select>
    </label>
  );
}


