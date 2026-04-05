import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

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

import { SiteHeader } from "@/components/marketing/site-header";
import { PreferencesProvider } from "@/components/providers/preferences-provider";

describe("SiteHeader", () => {
  it("does not expose a language selector", () => {
    render(
      <PreferencesProvider initialTheme="dark" initialLocale="en">
        <SiteHeader />
      </PreferencesProvider>,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

