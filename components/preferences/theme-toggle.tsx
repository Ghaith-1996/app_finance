"use client";

import { Moon } from "@phosphor-icons/react/dist/ssr/Moon";
import { Sun } from "@phosphor-icons/react/dist/ssr/Sun";

import { usePreferences } from "@/components/providers/preferences-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { theme, toggleTheme, t } = usePreferences();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={t("preferences.themeLabel")}
      title={t("preferences.themeLabel")}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-subtle bg-surface/80 px-3 py-2 text-sm text-secondary transition hover:border-strong hover:bg-surface-hover hover:text-primary",
        compact && "px-2 py-2",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className={cn(compact && "sr-only")}>
        {theme === "dark" ? t("preferences.lightMode") : t("preferences.darkMode")}
      </span>
    </button>
  );
}

