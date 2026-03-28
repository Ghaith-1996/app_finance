import { Suspense } from "react";

import { AppShell } from "@/components/app/app-shell";
import { HomeFeedClient } from "@/components/app/home-feed";
import { loadShellChromeState } from "@/lib/server/page-loaders";

export default async function HomePage() {
  const { showOnboardingNav, showAdminLink } = await loadShellChromeState();

  return (
    <AppShell
      eyebrow=""
      title="Home"
      description="Market conversations and community insights."
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
