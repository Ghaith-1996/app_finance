"use client";

import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { usePreferences } from "@/components/providers/preferences-provider";
import { buttonStyles } from "@/components/ui/button";

export function SiteHeader() {
  const { t } = usePreferences();

  return (
    <header className="sticky top-0 z-40 border-b border-subtle bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-sm font-semibold text-brand">
            PF
          </span>
          <div>
            <span className="block text-sm font-semibold uppercase tracking-[0.18em] text-primary">Pulsefolio</span>
            <span className="block text-xs text-secondary">{t("landing.headerTagline")}</span>
          </div>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-secondary md:flex">
          <a href="#platform" className="transition hover:text-primary">
            {t("landing.product")}
          </a>
          <a href="#use-cases" className="transition hover:text-primary">
            {t("landing.useCases")}
          </a>
          <a href="#workflow" className="transition hover:text-primary">
            {t("landing.howItWorks")}
          </a>
          <a href="#faq" className="transition hover:text-primary">
            {t("landing.faq")}
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle compact className="hidden sm:inline-flex" />
          <Link
            href="/demo"
            className={buttonStyles({
              variant: "ghost",
              className: "hidden sm:inline-flex",
            })}
          >
            {t("landing.viewDemo")}
          </Link>
          <Link
            href="/onboarding"
            className={buttonStyles({ size: "lg" })}
          >
            {t("landing.getStarted")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
