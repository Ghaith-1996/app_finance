import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((target: string) => {
  throw new Error(`REDIRECT:${target}`);
});
const getCurrentUserProfileMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (target: string) => redirectMock(target),
}));

vi.mock("@/lib/actions/profile", () => ({
  completeProfileAction: vi.fn(),
  getCurrentUserProfile: () => getCurrentUserProfileMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1" } },
      }),
    },
  }),
}));

import CompleteProfilePage from "@/app/complete-profile/page";

describe("CompleteProfilePage", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getCurrentUserProfileMock.mockReset();
  });

  it("sanitizes external redirect targets for completed profiles", async () => {
    getCurrentUserProfileMock.mockResolvedValue({
      firstName: "Ada",
      lastName: "Lovelace",
      handle: "ada",
      displayName: "Ada Lovelace",
      avatarUrl: null,
      acceptedTermsAt: "2026-01-01T00:00:00Z",
    });

    await expect(
      CompleteProfilePage({
        searchParams: Promise.resolve({ redirectTo: "https://evil.example" }),
      }),
    ).rejects.toThrow("REDIRECT:/portfolio");
  });

  it("preserves valid internal redirect targets", async () => {
    getCurrentUserProfileMock.mockResolvedValue({
      firstName: "Ada",
      lastName: "Lovelace",
      handle: "ada",
      displayName: "Ada Lovelace",
      avatarUrl: null,
      acceptedTermsAt: "2026-01-01T00:00:00Z",
    });

    await expect(
      CompleteProfilePage({
        searchParams: Promise.resolve({ redirectTo: "/home" }),
      }),
    ).rejects.toThrow("REDIRECT:/home");
  });
});
