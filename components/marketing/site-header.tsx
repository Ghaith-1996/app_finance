import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { buttonStyles } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-sm font-semibold text-brand">
            PF
          </span>
          <div>
            <span className="block text-sm font-semibold tracking-[0.18em] uppercase text-white">
              Pulsefolio
            </span>
            <span className="block text-xs text-slate-500">
              AI portfolio news, made personal
            </span>
          </div>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-slate-500 md:flex">
          <a href="#platform" className="transition hover:text-slate-300">
            Product
          </a>
          <a href="#use-cases" className="transition hover:text-slate-300">
            Use cases
          </a>
          <a href="#workflow" className="transition hover:text-slate-300">
            How it works
          </a>
          <a href="#faq" className="transition hover:text-slate-300">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/feed"
            className={buttonStyles({
              variant: "ghost",
              className: "hidden sm:inline-flex",
            })}
          >
            View demo
          </Link>
          <Link
            href="/onboarding"
            className={buttonStyles({ size: "lg" })}
          >
            Get started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
