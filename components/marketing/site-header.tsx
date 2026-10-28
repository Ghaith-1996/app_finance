"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import { AppLogo } from "@/components/brand/app-logo";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { usePreferences } from "@/components/providers/preferences-provider";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#benefits", key: "landing.product" },
  { href: "#use-cases", key: "landing.useCases" },
  { href: "#workflow", key: "landing.howItWorks" },
  { href: "#faq", key: "landing.faq" },
] as const;

export function SiteHeader() {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 px-4 pt-4">
      <div className="relative z-50 mx-auto flex w-fit max-w-full items-center gap-6 rounded-2xl border border-subtle bg-surface-raised/80 py-2 pl-3 pr-2 shadow-[var(--surface-shadow)] backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <AppLogo size="sm" priority />
          <span className="text-sm font-semibold text-primary">Pulsefolio</span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm text-secondary md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition hover:text-primary">
              {t(link.key)}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle compact className="hidden lg:inline-flex" />
          <Link href="/login" className={buttonStyles({ variant: "ghost", className: "hidden sm:inline-flex" })}>
            {t("landing.footerSignIn")}
          </Link>
          <Link href="/onboarding" className={buttonStyles({ className: "hidden sm:inline-flex" })}>
            Start free
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((value) => !value)}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-primary transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:hidden"
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute h-0.5 w-4 rounded-full bg-current transition-transform duration-500",
                open ? "rotate-45" : "-translate-y-1",
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                "absolute h-0.5 w-4 rounded-full bg-current transition-transform duration-500",
                open ? "-rotate-45" : "translate-y-1",
              )}
            />
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        hidden={!open}
        className="fixed inset-0 z-40 flex flex-col bg-background/95 px-6 pb-12 pt-24 backdrop-blur-2xl md:hidden"
      >
        <nav aria-label="Mobile" className="flex flex-col gap-2">
          {[...NAV_LINKS.map((link) => ({ href: link.href, label: t(link.key) })), { href: "/login", label: t("landing.footerSignIn") }].map(
            (link, index) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                style={{ animationDelay: `${Math.min(index * 60, 340)}ms` }}
                className="menu-link-in rounded-lg py-3 text-3xl font-semibold text-primary"
              >
                {link.label}
              </a>
            ),
          )}
        </nav>
        <div className="mt-auto flex flex-col gap-4">
          <ThemeToggle className="justify-center" />
          <Link href="/onboarding" onClick={() => setOpen(false)} className={buttonStyles({ size: "lg" })}>
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
