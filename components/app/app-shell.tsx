import type { ReactNode } from "react";

import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { UserMenu } from "@/components/app/user-menu";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/onboarding", label: "Onboarding" },
  { href: "/analysis", label: "Analysis" },
  { href: "/feed", label: "Feed" },
  { href: "/portfolio", label: "Portfolio" },
];

export function AppShell({
  eyebrow,
  title,
  description,
  children,
  activePath,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  activePath: string;
  actions?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-black/6 bg-white/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-brand/20 bg-white/80 text-sm font-semibold text-brand shadow-sm">
                PS
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  PortfolioSignal
                </p>
                <p className="text-sm font-semibold text-slate-950">Personal AI finance</p>
              </div>
            </Link>
          </div>
          <nav className="hidden items-center gap-2 rounded-full border border-black/6 bg-white/70 p-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  activePath === item.href
                    ? "bg-slate-950 !text-white [color:#ffffff] shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
                    : "text-slate-600 hover:text-slate-950",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className={buttonStyles({
                variant: "ghost",
                className: "text-slate-700 hover:bg-black/5 hover:text-slate-950",
              })}
            >
              Landing
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="relative px-6 py-10 lg:px-8 lg:py-12">
        <div className="absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(23,182,122,0.08),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.5),transparent)]" />
        <div className="mx-auto max-w-7xl space-y-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
                {eyebrow}
              </p>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                  {title}
                </h1>
                <p className="text-lg leading-8 text-slate-600">{description}</p>
              </div>
            </div>
            {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
