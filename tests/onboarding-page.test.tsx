import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  getUserPortfolios: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/actions/portfolio", () => ({
  getUserPortfolios: mockState.getUserPortfolios,
}));

vi.mock("next/navigation", () => ({
  redirect: mockState.redirect,
}));

vi.mock("@/components/app/onboarding-page-client", () => ({
  OnboardingPageClient: () => <div>Onboarding client</div>,
}));

import OnboardingPage from "@/app/onboarding/page";

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects users with an existing portfolio to /home", async () => {
    mockState.getUserPortfolios.mockResolvedValue({
      data: [{ id: "p1" }],
      error: null,
    });

    await expect(OnboardingPage()).rejects.toThrow("redirect:/home");
    expect(mockState.redirect).toHaveBeenCalledWith("/home");
  });

  it("renders the onboarding client for first-time users", async () => {
    mockState.getUserPortfolios.mockResolvedValue({
      data: [],
      error: null,
    });

    const page = await OnboardingPage();
    render(page);

    expect(screen.getByText("Onboarding client")).toBeTruthy();
  });
});
