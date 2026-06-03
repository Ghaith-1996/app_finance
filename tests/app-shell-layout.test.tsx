import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/feed",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/app/user-menu", () => ({
  UserMenu: () => <div>User menu</div>,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient,
}));

describe("AppShellLayout", () => {
  it("uses the server-provided onboarding visibility without client auth queries", async () => {
    const { AppShellLayout } = await import("@/components/app/app-shell-layout");
    const { PreferencesProvider } = await import("@/components/providers/preferences-provider");

    render(
      <PreferencesProvider
        initialTheme="dark"
        initialLocale="en"
      >
        <AppShellLayout
          eyebrow="Feed"
          title="Title"
          description="Description"
          showOnboardingNav={false}
          unreadAlertCount={0}
        >
          <div>Child content</div>
        </AppShellLayout>
      </PreferencesProvider>,
    );

    expect(screen.getByText("Child content")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /onboarding/i })).toBeNull();
    expect(screen.getAllByRole("link", { name: /feed/i }).length).toBeGreaterThan(0);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("renders an unread alert badge when a count is provided", async () => {
    const { AppShellLayout } = await import("@/components/app/app-shell-layout");
    const { PreferencesProvider } = await import("@/components/providers/preferences-provider");

    render(
      <PreferencesProvider initialTheme="dark" initialLocale="en">
        <AppShellLayout
          eyebrow="Feed"
          title="Title"
          description="Description"
          unreadAlertCount={12}
        >
          <div>Child content</div>
        </AppShellLayout>
      </PreferencesProvider>,
    );

    expect(screen.getByText("12")).toBeTruthy();
  });
});
