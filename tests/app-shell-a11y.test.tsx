import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Audit F12 (collapsed nav not focusable), F20 (named icon links), F21 (mobile account menu).

vi.mock("next/navigation", () => ({ usePathname: () => "/feed" }));
vi.mock("@/components/providers/preferences-provider", () => ({
  usePreferences: () => ({ t: (key: string) => key.replace("shell.", "") }),
}));
vi.mock("@/components/preferences/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/app/user-menu", () => ({
  UserMenu: ({ compact }: { compact?: boolean }) => (
    <button type="button" data-testid={compact ? "mobile-account-menu" : "sidebar-account-menu"}>
      Account
    </button>
  ),
}));

import { AppShellLayout } from "@/components/app/app-shell-layout";

function renderShell() {
  return render(
    <AppShellLayout eyebrow="" title="Feed" description="desc" unreadAlertCount={3}>
      <p>content</p>
    </AppShellLayout>,
  );
}

describe("app shell accessibility", () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unreadCount: 3 }) }) as never;
  });

  it("F12: collapsing makes the sidebar inert and moves focus to Show navigation; expanding returns it", async () => {
    const { container } = renderShell();
    const aside = container.querySelector("aside")!;
    expect(aside).not.toHaveAttribute("inert");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "hideNavigation" }));
    });
    expect(aside).toHaveAttribute("inert");
    expect(aside).toHaveAttribute("aria-hidden", "true");
    const show = screen.getByRole("button", { name: "showNavigation" });
    expect(document.activeElement).toBe(show);

    await act(async () => {
      fireEvent.click(show);
    });
    expect(aside).not.toHaveAttribute("inert");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "hideNavigation" }));
  });

  it("F20: every mobile icon link has an accessible name", () => {
    const { container } = renderShell();
    const header = container.querySelector("header")!;
    const nav = within(header).getByRole("navigation");
    const links = within(nav).getAllByRole("link");
    expect(links.length).toBeGreaterThan(5);
    for (const link of links) {
      expect(link.getAttribute("aria-label")?.trim()).toBeTruthy();
    }
    expect(within(nav).getByRole("link", { name: "alerts (3 unread)" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "feed" })).toHaveAttribute("aria-current", "page");
  });

  it("F21: the small-screen header includes the account menu", () => {
    const { container } = renderShell();
    const header = container.querySelector("header")!;
    expect(within(header).getByTestId("mobile-account-menu")).toBeTruthy();
  });
});
