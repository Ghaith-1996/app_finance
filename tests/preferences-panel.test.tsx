import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { PreferencesPanel } from "@/components/app/preferences-panel";
import { PreferencesProvider } from "@/components/providers/preferences-provider";

describe("PreferencesPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = "en";
    document.documentElement.dataset.theme = "dark";
  });

  it("lets the user change theme", () => {
    render(
      <PreferencesProvider initialTheme="dark" initialLocale="en">
        <PreferencesPanel />
      </PreferencesProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /light/i }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
