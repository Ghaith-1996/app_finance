import Link from "next/link";
import { ArrowRight, MessagesSquare } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { TodayDashboard } from "@/components/app/today-dashboard";
import { getTranslations } from "@/lib/i18n/server";
import { loadHomeDashboardData } from "@/lib/server/page-loaders";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const { showOnboardingNav, showAdminLink, dashboard } =
    await loadHomeDashboardData();
  const { t } = await getTranslations();

  return (
    <AppShell
      eyebrow=""
      title={t("pages.homeTitle")}
      description={t("pages.homeDescription")}
      activePath="/home"
      showOnboardingNav={showOnboardingNav}
      showAdminLink={showAdminLink}
    >
      <div className="space-y-8">
        <TodayDashboard data={dashboard} />

        {/* Audit D06: community is a clear secondary destination, not the bottom of Home. */}
        <Link
          href="/community"
          className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.06] bg-surface-raised p-5 transition hover:bg-surface-hover sm:p-6"
        >
          <span className="flex items-center gap-3">
            <span className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300">
              <MessagesSquare className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-base font-bold text-white">Community</span>
              <span className="mt-1 block text-sm text-slate-500">
                Market conversations, trending tickers and active discussions
              </span>
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
        </Link>
      </div>
    </AppShell>
  );
}
