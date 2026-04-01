import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("lets the user change theme and locale", async () => {
    render(
      <PreferencesProvider initialTheme="dark" initialLocale="en">
        <PreferencesPanel />
      </PreferencesProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /light/i }));
    expect(document.documentElement.dataset.theme).toBe("light");

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "fr" },
    });

    await waitFor(() => {
      expect(document.documentElement.lang).toBe("fr");
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

