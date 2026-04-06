import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const onAuthStateChange = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange,
      signInWithOAuth: vi.fn(),
    },
  }),
}));

import LoginPage from "@/app/(auth)/login/page";
import { PreferencesProvider } from "@/components/providers/preferences-provider";

describe("LoginPage", () => {
  it("does not expose a language selector", () => {
    onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });

    render(
      <PreferencesProvider initialTheme="dark" initialLocale="en">
        <LoginPage />
      </PreferencesProvider>,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("links to the Terms and Privacy pages", () => {
    onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });

    render(
      <PreferencesProvider initialTheme="dark" initialLocale="en">
        <LoginPage />
      </PreferencesProvider>,
    );

    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });
});
