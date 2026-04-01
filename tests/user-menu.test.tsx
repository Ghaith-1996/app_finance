import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
const maybeSingle = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
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
      getUser,
      signOut,
      onAuthStateChange,
    },
    from: (table: string) => {
      if (table !== "user_profiles") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: () => ({
          eq: () => ({
            maybeSingle,
          }),
        }),
      };
    },
  }),
}));

import { UserMenu } from "@/components/app/user-menu";
import { PreferencesProvider } from "@/components/providers/preferences-provider";

function renderMenu(props?: { showAdminLink?: boolean }) {
  return render(
    <PreferencesProvider initialTheme="dark" initialLocale="en">
      <UserMenu {...props} />
    </PreferencesProvider>,
  );
}

describe("UserMenu", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    getUser.mockReset();
    signOut.mockReset();
    maybeSingle.mockReset();
    unsubscribe.mockReset();
    onAuthStateChange.mockReset();

    getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "ada@example.com",
          user_metadata: {
            full_name: "Ada Lovelace",
            avatar_url: "https://example.com/avatar.png",
          },
        },
      },
    });
    maybeSingle.mockResolvedValue({
      data: {
        display_name: "Ada Lovelace",
        avatar_url: "https://example.com/avatar.png",
        handle: "adal",
      },
    });
    signOut.mockResolvedValue({ error: null });
    onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe,
        },
      },
    });
  });

  it("opens the profile menu and signs the user out", async () => {
    renderMenu();

    await screen.findByText("Ada Lovelace");
    expect(screen.getByText("@adal")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ada lovelace/i }));
    });

    const settingsLink = await screen.findByRole("menuitem", { name: /settings/i });
    expect(settingsLink).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("button", { name: /theme/i })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));
    });

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith("/");
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it("falls back to initials when the avatar URL is unsafe", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        display_name: "Ada Lovelace",
        avatar_url: "javascript:alert(1)",
        handle: "adal",
      },
    });

    renderMenu();

    await screen.findByText("Ada Lovelace");
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("shows an admin link when the server marks the viewer as admin", async () => {
    renderMenu({ showAdminLink: true });

    await screen.findByText("Ada Lovelace");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ada lovelace/i }));
    });

    const adminLink = await screen.findByRole("menuitem", { name: /admin/i });
    expect(adminLink).toHaveAttribute("href", "/admin");
  });
});
