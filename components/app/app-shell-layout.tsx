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

import { AppLogo } from "@/components/brand/app-logo";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { usePreferences } from "@/components/providers/preferences-provider";
import { UserMenu } from "@/components/app/user-menu";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "pulsefolio-sidebar-collapsed";

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
  backLabel,
  showOnboardingNav = true,
  showAdminLink = false,
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
  showAdminLink?: boolean;
}) {
  const pathname = usePathname();
  const { t } = usePreferences();
  const [collapsed, setCollapsed] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(true);

  const mainNav = [
    { href: "/home", label: t("shell.home"), icon: Home },
    { href: "/onboarding", label: t("shell.onboarding"), icon: Upload },
    { href: "/analysis", label: t("shell.analysis"), icon: Activity },
    { href: "/feed", label: t("shell.feed"), icon: Newspaper },
  ] as const;

  const overviewSubItems = [
    { href: "/portfolio/full", label: t("shell.fullPortfolio") },
    { href: "/watchlist", label: t("shell.watchlist") },
  ] as const;

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
    <div className="flex min-h-screen overflow-x-clip bg-background text-foreground">
      {/* Expand rail when sidebar hidden */}
      {collapsed ? (
        <button
          type="button"
          onClick={() => persistCollapsed(false)}
          className="fixed left-0 top-1/2 z-[60] hidden -translate-y-1/2 rounded-r-lg border border-l-0 border-subtle bg-surface px-1.5 py-4 text-secondary shadow-[var(--surface-shadow)] transition hover:bg-surface-raised hover:text-primary lg:flex"
          aria-label={t("shell.showNavigation")}
        >
          <PanelLeft className="h-5 w-5" />
        </button>
      ) : null}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 hidden h-full flex-col border-r border-subtle bg-surface/95 backdrop-blur-xl transition-[width,transform,opacity] duration-300 ease-out lg:flex",
          collapsed ? "w-0 translate-x-[-4px] overflow-hidden border-0 opacity-0" : "w-[260px] opacity-100",
        )}
        aria-hidden={collapsed}
      >
        <div className="flex h-full min-w-[260px] flex-col">
          <div className="flex items-start justify-between gap-2 px-6 pt-8 pb-4">
            <Link href="/" className="flex min-w-0 flex-1 items-center gap-3">
              <AppLogo size="md" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {t("shell.observatory")}
                </p>
                <p className="truncate text-sm font-semibold text-primary">Pulsefolio</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => persistCollapsed(true)}
              className="shrink-0 rounded-lg p-2 text-secondary transition hover:bg-surface-soft hover:text-primary"
              aria-label={t("shell.hideNavigation")}
              title={t("shell.hideNavigation")}
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              {t("shell.navigation")}
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
                      : "text-secondary hover:bg-surface-soft hover:text-primary",
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
                  isOverviewSection(pathname) ? "bg-brand/10" : "hover:bg-surface-soft",
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
                        : "text-secondary hover:text-primary",
                  )}
                >
                  <OverviewIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t("shell.overview")}</span>
                  {pathname === "/portfolio" ? (
                    <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  ) : null}
                </Link>
                <button
                  type="button"
                  onClick={() => setOverviewOpen((o) => !o)}
                  className="shrink-0 rounded-lg p-2 text-secondary transition hover:bg-surface-soft hover:text-primary"
                  aria-expanded={overviewOpen}
                  aria-label={overviewOpen ? t("shell.collapseOverviewLinks") : t("shell.expandOverviewLinks")}
                >
                  {overviewOpen ? (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
              {overviewOpen ? (
                <div className="ml-4 mt-1 space-y-0.5 border-l border-subtle pl-3">
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
                            : "text-secondary hover:text-primary",
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

          <div className="border-t border-subtle px-4 py-4">
            <Link
              href="/"
              className="mb-3 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-surface-soft hover:text-secondary"
            >
              <Globe className="h-4 w-4" />
              {t("shell.landingPage")}
            </Link>
            <div className="mb-3 px-3">
              <ThemeToggle className="w-full justify-center" />
            </div>
            <UserMenu showAdminLink={showAdminLink} />
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="fixed left-0 right-0 top-0 z-40 flex flex-col border-b border-subtle bg-surface/95 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <Link href="/" className="flex items-center gap-2">
            <AppLogo size="sm" />
            <span className="text-sm font-semibold text-primary">Pulsefolio</span>
          </Link>
          <nav className="flex flex-1 items-center justify-end gap-1 overflow-x-auto pb-1">
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
                      : "text-secondary hover:text-primary",
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
                  : "text-secondary hover:text-primary",
              )}
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("shell.overview")}</span>
            </Link>
            <ThemeToggle compact />
          </nav>
        </div>
        <div className="flex gap-4 overflow-x-auto whitespace-nowrap border-t border-subtle px-4 py-2 text-[11px] text-secondary sm:px-5">
          <Link href="/portfolio/full" className={cn(pathname === "/portfolio/full" && "font-medium text-brand")}>
            {t("shell.fullPortfolio")}
          </Link>
          <Link href="/watchlist" className={cn(pathname === "/watchlist" && "font-medium text-brand")}>
            {t("shell.watchlist")}
          </Link>
        </div>
      </header>

      <main
        className={cn(
          "min-w-0 flex-1 transition-[margin] duration-300 ease-out",
          collapsed ? "lg:ml-0" : "lg:ml-[260px]",
          "px-4 pt-28 pb-10 sm:px-6 md:px-8 lg:px-10 lg:pt-8 xl:px-12",
          mainClassName,
        )}
      >
        <div className="mx-auto w-full max-w-[1680px] space-y-8">
          {backHref ? (
            <div>
              <Link
                href={backHref}
                className="inline-flex items-center gap-2 text-sm font-medium text-secondary transition hover:text-primary"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-subtle bg-surface-raised text-secondary transition hover:border-strong hover:bg-surface-hover">
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </span>
                {backLabel ?? t("shell.backToPortfolio")}
              </Link>
            </div>
          ) : null}
          <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              {eyebrow ? (
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand">
                  {eyebrow}
                </p>
              ) : null}
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
                  {title}
                </h1>
                <p className="text-base leading-7 text-secondary">{description}</p>
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
