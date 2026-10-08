import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Hero } from "@/components/marketing/hero";
import { UseCases } from "@/components/marketing/use-cases";
import { PreferencesProvider } from "@/components/providers/preferences-provider";
import { prefersReducedMotion, scrollBehavior } from "@/lib/motion";

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

function stubMatchMedia(reducedMotion: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion: reduce") ? reducedMotion : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

/** IntersectionObserver that reports the target as visible as soon as it is observed. */
class VisibleIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

describe("lib/motion", () => {
  afterEach(() => {
    // @ts-expect-error -- remove the stub so the jsdom default (no matchMedia) is restored
    delete window.matchMedia;
  });

  it("treats a missing matchMedia as no preference", () => {
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
  });

  it("reports the reduced-motion preference and switches JS scrolling to instant", () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe("auto");
  });
});

describe("globals.css motion rules", () => {
  it("collapses CSS animation and transition time under prefers-reduced-motion", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(block).not.toBe(css);
    expect(block).toMatch(/animation-duration:\s*0\.01ms !important/);
    expect(block).toMatch(/animation-iteration-count:\s*1 !important/);
    expect(block).toMatch(/transition-duration:\s*0\.01ms !important/);
    expect(block).toMatch(/scroll-behavior:\s*auto/);
  });

  it("keeps loading spinners turning under reduced motion", () => {
    expect(css).toContain("*:not(.animate-spin)");
  });

  it("only animates the hero mesh on large screens without a reduced-motion preference", () => {
    const animated = css.match(/@media \(min-width: 1024px\) and \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/);
    expect(animated?.[1]).toContain("hero-mesh-drift");
    const outside = css.replace(animated?.[0] ?? "", "");
    expect(outside).not.toMatch(/animation:\s*hero-mesh-drift/);
  });

  it("defines hero mesh colors for both themes", () => {
    expect(css).toMatch(/\.hero-mesh \{[^}]*--hero-mesh-a/);
    expect(css).toMatch(/\[data-theme="light"\] \.hero-mesh \{[^}]*--hero-mesh-a/);
  });
});

describe("Hero mesh backdrop", () => {
  beforeEach(() => stubMatchMedia(false));

  it("renders a decorative layer hidden from assistive technology", () => {
    render(
      <PreferencesProvider initialTheme="dark" initialLocale="en">
        <Hero />
      </PreferencesProvider>,
    );
    const mesh = screen.getByTestId("hero-mesh");
    expect(mesh).toHaveClass("hero-mesh");
    expect(mesh).toHaveAttribute("aria-hidden", "true");
    expect(mesh).toBeEmptyDOMElement();
  });
});

describe("UseCases auto-advance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IntersectionObserver", VisibleIntersectionObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Desktop cards render first; the mobile stack marks every card active. */
  function desktopCards(container: HTMLElement) {
    return Array.from(container.querySelectorAll("button[aria-pressed]")).slice(0, 2);
  }

  it("cycles to the next use case after four seconds by default", () => {
    stubMatchMedia(false);
    const { container } = render(<UseCases />);
    const [first, second] = desktopCards(container);
    expect(first).toHaveAttribute("aria-pressed", "true");

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second).toHaveAttribute("aria-pressed", "true");
  });

  it("stops auto-advancing once the visitor picks a card", () => {
    stubMatchMedia(false);
    const { container } = render(<UseCases />);
    const [first, second] = desktopCards(container);

    act(() => {
      fireEvent.click(second!);
    });
    expect(second).toHaveAttribute("aria-pressed", "true");

    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second).toHaveAttribute("aria-pressed", "true");
  });

  it("does not change the selection on hover", () => {
    stubMatchMedia(true);
    const { container } = render(<UseCases />);
    const [first, second] = desktopCards(container);

    fireEvent.mouseEnter(second!);

    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("aria-pressed", "false");
  });

  it("only pre-hides scroll-revealed content when scripts can reveal it", () => {
    stubMatchMedia(false);
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      disconnect() {}
    });
    const { container } = render(<UseCases />);
    expect(container.querySelector(".uc-pending")).not.toBeNull();
    expect(container.querySelector(".opacity-0")).toBeNull();
    expect(css).toMatch(/@media \(scripting: enabled\) \{\s*\.uc-pending \{\s*opacity: 0;/);
  });

  it("does not auto-advance when the viewer prefers reduced motion", () => {
    stubMatchMedia(true);
    const { container } = render(<UseCases />);
    const [first, second] = desktopCards(container);

    act(() => {
      vi.advanceTimersByTime(20000);
    });

    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(second).toHaveAttribute("aria-pressed", "false");
  });
});
