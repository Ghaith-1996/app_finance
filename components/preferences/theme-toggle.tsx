"use client";

import { Moon, Sun } from "lucide-react";

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
        "inline-flex items-center gap-2 rounded-xl border border-subtle bg-surface/80 px-3 py-2 text-sm text-secondary transition hover:border-strong hover:bg-surface-hover hover:text-primary",
        compact && "px-2.5 py-2",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{theme === "dark" ? t("preferences.lightMode") : t("preferences.darkMode")}</span>
    </button>
  );
}

