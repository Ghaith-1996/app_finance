import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
  }),
}));

import { PreferencesPanel } from "@/components/app/preferences-panel";
import { PreferencesProvider } from "@/components/providers/preferences-provider";

describe("PreferencesPanel", () => {
  beforeEach(() => {
    refresh.mockReset();
    window.localStorage.clear();
    document.documentElement.lang = "en";
    document.documentElement.dataset.theme = "dark";
  });

  it("shows theme controls only and lets the user change theme", () => {
    render(
      <PreferencesProvider initialTheme="dark" initialLocale="en">
        <PreferencesPanel />
      </PreferencesProvider>,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /light/i }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(refresh).toHaveBeenCalledTimes(0);
  });
});
