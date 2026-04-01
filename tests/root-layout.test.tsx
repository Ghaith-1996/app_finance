import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, headersMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  headersMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
  headers: headersMock,
}));

import RootLayout from "@/app/layout";

describe("RootLayout", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    headersMock.mockReset();
  });

  it("uses cookie preferences when they are present", async () => {
    cookiesMock.mockResolvedValue({
      get: (key: string) => {
        if (key === "pulsefolio-theme") return { value: "light" };
        if (key === "pulsefolio-locale") return { value: "fr" };
        return undefined;
      },
    });
    headersMock.mockResolvedValue({
      get: () => "en-US,en;q=0.9",
    });

    const layout = await RootLayout({
      children: <div>child</div>,
    });

    expect(layout.props.lang).toBe("fr");
    expect(layout.props["data-theme"]).toBe("light");
  });

  it("falls back to the request language when locale cookie is missing", async () => {
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    });
    headersMock.mockResolvedValue({
      get: () => "fr-CA,fr;q=0.8,en;q=0.6",
    });

    const layout = await RootLayout({
      children: <div>child</div>,
    });

    expect(layout.props.lang).toBe("fr");
    expect(layout.props["data-theme"]).toBe("dark");
  });
});
