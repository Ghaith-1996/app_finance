import { Suspense } from "react";

import { AppShell } from "@/components/app/app-shell";
import { HomeFeedClient } from "@/components/app/home-feed";
import { TodayDashboard } from "@/components/app/today-dashboard";
import { getTranslations } from "@/lib/i18n/server";
import { loadHomeDashboardData } from "@/lib/server/page-loaders";

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

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                Community
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-white">
                Market conversations
              </h2>
            </div>
          </div>
          <Suspense>
            <HomeFeedClient />
          </Suspense>
        </section>
      </div>
    </AppShell>
  );
}
