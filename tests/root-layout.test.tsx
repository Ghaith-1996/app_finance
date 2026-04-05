import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

import RootLayout from "@/app/layout";

describe("RootLayout", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
  });

  it("uses cookie theme and keeps english locale", async () => {
    cookiesMock.mockResolvedValue({
      get: (key: string) => {
        if (key === "pulsefolio-theme") return { value: "light" };
        if (key === "pulsefolio-locale") return { value: "fr" };
        return undefined;
      },
    });

    const layout = await RootLayout({
      children: <div>child</div>,
    });

    expect(layout.props.lang).toBe("en");
    expect(layout.props["data-theme"]).toBe("light");
  });

  it("defaults to dark theme and english locale when no cookie exists", async () => {
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    });

    const layout = await RootLayout({
      children: <div>child</div>,
    });

    expect(layout.props.lang).toBe("en");
    expect(layout.props["data-theme"]).toBe("dark");
  });
});
