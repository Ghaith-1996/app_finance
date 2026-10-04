import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PreferencesProvider,
  usePreferences,
} from "@/components/providers/preferences-provider";

function PreferenceProbe() {
  const { locale, theme, setLocale, setTheme } = usePreferences();

  return (
    <div>
      <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
        toggle theme
      </button>
      <button type="button" onClick={() => setLocale(locale === "en" ? "fr" : "en")}>
        toggle locale
      </button>
    </div>
  );
}

describe("PreferencesProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = "pulsefolio-theme=; Max-Age=0; path=/";
    document.cookie = "pulsefolio-locale=; Max-Age=0; path=/";
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("dark"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "fr-CA",
    });
  });

  it("updates theme and keeps locale pinned to english", async () => {
    render(
      <PreferencesProvider initialTheme="dark" initialLocale="en">
        <PreferenceProbe />
      </PreferencesProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
      fireEvent.click(screen.getByRole("button", { name: /toggle locale/i }));
    });

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("pulsefolio-theme")).toBe("light");
    expect(window.localStorage.getItem("pulsefolio-locale")).toBe("en");
  });
});
