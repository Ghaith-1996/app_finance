import { Suspense } from "react";

import { AppShell } from "@/components/app/app-shell";
import { HomeFeedClient } from "@/components/app/home-feed";
import { getTranslations } from "@/lib/i18n/server";
import { loadShellChromeState } from "@/lib/server/page-loaders";

export default async function HomePage() {
  const { showOnboardingNav, showAdminLink } = await loadShellChromeState();
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
      <Suspense>
        <HomeFeedClient />
      </Suspense>
    </AppShell>
  );
}
