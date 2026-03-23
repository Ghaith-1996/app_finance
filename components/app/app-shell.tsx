import type { ReactNode } from "react";

import Link from "next/link";

import {
  Activity,
  ArrowLeft,
  BookmarkPlus,
  Globe,
  LayoutDashboard,
  Newspaper,
  Upload,
} from "lucide-react";

import { UserMenu } from "@/components/app/user-menu";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/portfolio", label: "Overview", icon: LayoutDashboard },
  { href: "/feed", label: "Intelligence", icon: Newspaper },
  { href: "/analysis", label: "Analysis", icon: Activity },
  { href: "/watchlist", label: "Watchlist", icon: BookmarkPlus },
  { href: "/onboarding", label: "Onboarding", icon: Upload },
];

export function AppShell({
  eyebrow,
  title,
  description,
  children,
  activePath,
  actions,
  mainClassName,
  backHref,
  backLabel = "Back to portfolio",
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  activePath: string;
  actions?: ReactNode;
  mainClassName?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-50 hidden h-full w-[260px] flex-col border-r border-white/[0.06] bg-surface lg:flex">
        <div className="flex h-full flex-col">
          {/* Brand */}
          <div className="px-6 pt-8 pb-6">
            <Link href="/" className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-sm font-bold text-brand">
                PS
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Observatory
                </p>
                <p className="text-sm font-semibold text-slate-200">PortfolioSignal</p>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3">
            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
              Navigation
            </p>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePath === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand/10 text-brand"
                      : "text-slate-500 hover:bg-white/5 hover:text-slate-300",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Bottom section */}
          <div className="border-t border-white/[0.06] px-4 py-4">
            <Link
              href="/"
              className="mb-3 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-600 transition hover:bg-white/5 hover:text-slate-400"
            >
              <Globe className="h-4 w-4" />
              Landing Page
            </Link>
            <UserMenu />
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between border-b border-white/[0.06] bg-surface/95 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-xs font-bold text-brand">
            PS
          </span>
          <span className="text-sm font-semibold text-slate-200">PortfolioSignal</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {navItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                  activePath === item.href
                    ? "bg-brand/10 text-brand"
                    : "text-slate-500 hover:text-slate-300",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Main content */}
      <main
        className={cn(
          "flex-1 lg:ml-[260px]",
          "px-6 pt-20 pb-12 lg:px-10 lg:pt-10",
          mainClassName,
        )}
      >
        <div className="mx-auto max-w-[1400px] space-y-8">
          {backHref ? (
            <div>
              <Link
                href={backHref}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-300"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-surface-raised text-slate-400 transition hover:border-white/10 hover:bg-surface-hover">
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </span>
                {backLabel}
              </Link>
            </div>
          ) : null}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              {eyebrow ? (
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand">
                  {eyebrow}
                </p>
              ) : null}
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {title}
                </h1>
                <p className="text-base leading-7 text-slate-500">{description}</p>
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
