import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { buttonStyles } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/6 bg-white/92 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-brand/20 bg-white/80 text-sm font-semibold text-brand shadow-sm">
            PS
          </span>
          <div>
            <span className="block text-sm font-semibold tracking-[0.18em] uppercase text-slate-950">
              PortfolioSignal
            </span>
            <span className="block text-xs text-slate-500">
              AI portfolio news, made personal
            </span>
          </div>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
          <a href="#platform" className="transition hover:text-slate-950">
            Product
          </a>
          <a href="#workflow" className="transition hover:text-slate-950">
            How it works
          </a>
          <a href="#faq" className="transition hover:text-slate-950">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/feed"
            className={buttonStyles({
              variant: "ghost",
              className: "hidden sm:inline-flex text-slate-700 hover:bg-black/5 hover:text-slate-950",
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
