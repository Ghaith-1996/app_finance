"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  Globe,
  Home,
  LayoutDashboard,
  Newspaper,
  PanelLeftClose,
  PanelLeft,
  Upload,
} from "lucide-react";

import { UserMenu } from "@/components/app/user-menu";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "portfolio-signal-sidebar-collapsed";

const mainNav = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/onboarding", label: "Onboarding", icon: Upload },
  { href: "/analysis", label: "Analysis", icon: Activity },
  { href: "/feed", label: "Feed", icon: Newspaper },
] as const;

const overviewSubItems = [
  { href: "/portfolio/full", label: "Full portfolio" },
  { href: "/watchlist", label: "Watchlist" },
] as const;

function isOverviewSection(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/portfolio" ||
    pathname.startsWith("/portfolio/") ||
    pathname === "/watchlist"
  );
}

export function AppShellLayout({
  eyebrow,
  title,
  description,
  children,
  actions,
  mainClassName,
  backHref,
  backLabel = "Back to portfolio",
  showOnboardingNav = true,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
  mainClassName?: string;
  backHref?: string;
  backLabel?: string;
  showOnboardingNav?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isOverviewSection(pathname)) setOverviewOpen(true);
  }, [pathname]);

  const persistCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const OverviewIcon = LayoutDashboard;
  const visibleMainNav = showOnboardingNav
    ? mainNav
    : mainNav.filter((item) => item.href !== "/onboarding");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Expand rail when sidebar hidden */}
      {collapsed ? (
        <button
          type="button"
          onClick={() => persistCollapsed(false)}
          className="fixed left-0 top-1/2 z-[60] hidden -translate-y-1/2 rounded-r-lg border border-l-0 border-white/[0.08] bg-surface px-1.5 py-4 text-slate-400 shadow-lg transition hover:bg-surface-raised hover:text-slate-200 lg:flex"
          aria-label="Show navigation"
        >
          <PanelLeft className="h-5 w-5" />
        </button>
      ) : null}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 hidden h-full flex-col border-r border-white/[0.06] bg-surface transition-[width,transform,opacity] duration-300 ease-out lg:flex",
          collapsed ? "w-0 translate-x-[-4px] overflow-hidden border-0 opacity-0" : "w-[260px] opacity-100",
        )}
        aria-hidden={collapsed}
      >
        <div className="flex h-full min-w-[260px] flex-col">
          <div className="flex items-start justify-between gap-2 px-6 pt-8 pb-4">
            <Link href="/" className="flex min-w-0 flex-1 items-center gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-sm font-bold text-brand">
                PS
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Observatory
                </p>
                <p className="truncate text-sm font-semibold text-slate-200">PortfolioSignal</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => persistCollapsed(true)}
              className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
              aria-label="Hide navigation"
              title="Hide navigation"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
              Navigation
            </p>

            {visibleMainNav.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
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
                  {isActive ? (
                    <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  ) : null}
                </Link>
              );
            })}

            {/* Overview: link to dashboard + expandable Full portfolio / Watchlist */}
            <div className="pt-1">
              <div
                className={cn(
                  "flex w-full items-center gap-1 rounded-xl px-2 py-1.5 transition-colors",
                  isOverviewSection(pathname) ? "bg-brand/10" : "hover:bg-white/5",
                )}
              >
                <Link
                  href="/portfolio"
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors",
                    pathname === "/portfolio"
                      ? "text-brand"
                      : isOverviewSection(pathname)
                        ? "text-brand/90"
                        : "text-slate-500 hover:text-slate-300",
                  )}
                >
                  <OverviewIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">Overview</span>
                  {pathname === "/portfolio" ? (
                    <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  ) : null}
                </Link>
                <button
                  type="button"
                  onClick={() => setOverviewOpen((o) => !o)}
                  className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
                  aria-expanded={overviewOpen}
                  aria-label={overviewOpen ? "Collapse overview links" : "Expand overview links"}
                >
                  {overviewOpen ? (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
              {overviewOpen ? (
                <div className="ml-4 mt-1 space-y-0.5 border-l border-white/[0.06] pl-3">
                  {overviewSubItems.map((sub) => {
                    const isActive = pathname === sub.href;
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                          isActive
                            ? "font-medium text-brand"
                            : "text-slate-500 hover:text-slate-300",
                        )}
                      >
                        {sub.href === "/watchlist" ? (
                          <BookmarkPlus className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        ) : isActive ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                        ) : (
                          <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </nav>

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
      <header className="fixed left-0 right-0 top-0 z-40 flex flex-col border-b border-white/[0.06] bg-surface/95 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-xs font-bold text-brand">
              PS
            </span>
            <span className="text-sm font-semibold text-slate-200">PortfolioSignal</span>
          </Link>
          <nav className="flex max-w-[65%] items-center gap-1 overflow-x-auto">
            {visibleMainNav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                    pathname === item.href
                      ? "bg-brand/10 text-brand"
                      : "text-slate-500 hover:text-slate-300",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
            <Link
              href="/portfolio"
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                isOverviewSection(pathname)
                  ? "bg-brand/10 text-brand"
                  : "text-slate-500 hover:text-slate-300",
              )}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Overview</span>
            </Link>
          </nav>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/[0.04] px-4 py-2 text-[11px] text-slate-500">
          <Link href="/portfolio/full" className={cn(pathname === "/portfolio/full" && "font-medium text-brand")}>
            Full portfolio
          </Link>
          <Link href="/watchlist" className={cn(pathname === "/watchlist" && "font-medium text-brand")}>
            Watchlist
          </Link>
        </div>
      </header>

      <main
        className={cn(
          "flex-1 transition-[margin] duration-300 ease-out",
          collapsed ? "lg:ml-0" : "lg:ml-[260px]",
          "px-6 pt-28 pb-12 lg:px-10 lg:pt-10",
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
