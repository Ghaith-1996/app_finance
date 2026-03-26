import { Suspense } from "react";

import { AppShell } from "@/components/app/app-shell";
import { HomeFeedClient } from "@/components/app/home-feed";
import { loadOnboardingNavState } from "@/lib/server/page-loaders";

export default async function HomePage() {
  const showOnboardingNav = await loadOnboardingNavState();

  return (
    <AppShell
      eyebrow=""
      title="Home"
      description="Market conversations and community insights."
      activePath="/home"
      showOnboardingNav={showOnboardingNav}
    >
      <Suspense>
        <HomeFeedClient />
      </Suspense>
    </AppShell>
  );
}
