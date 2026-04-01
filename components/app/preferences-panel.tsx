"use client";

import { Panel } from "@/components/ui/panel";
import { usePreferences } from "@/components/providers/preferences-provider";
import { LocaleSelect } from "@/components/preferences/locale-select";
import type { Theme } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const themeOptions: Theme[] = ["light", "dark"];

export function PreferencesPanel() {
  const { theme, setTheme, t } = usePreferences();

  return (
    <Panel className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-primary">{t("preferences.title")}</h2>
        <p className="text-sm text-secondary">{t("preferences.description")}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-subtle bg-surface-soft px-5 py-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-primary">{t("preferences.themeLabel")}</p>
            <p className="text-sm text-secondary">{t("preferences.themeDescription")}</p>
          </div>
          <div className="flex gap-2">
            {themeOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTheme(option)}
                className={cn(
                  "rounded-xl border px-4 py-2.5 text-sm font-medium transition",
                  theme === option
                    ? "border-brand/30 bg-brand/10 text-brand"
                    : "border-subtle bg-surface text-secondary hover:border-strong hover:text-primary",
                )}
              >
                {option === "light" ? t("common.light") : t("common.dark")}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-subtle bg-surface-soft px-5 py-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-primary">{t("preferences.languageLabel")}</p>
            <p className="text-sm text-secondary">{t("preferences.languageDescription")}</p>
          </div>
          <div>
            <LocaleSelect className="w-full justify-between" />
          </div>
        </div>
      </div>
    </Panel>
  );
}
