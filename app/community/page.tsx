import { Suspense } from "react";

import { AppShell } from "@/components/app/app-shell";
import { HomeFeedClient } from "@/components/app/home-feed";
import { isAdminUser } from "@/lib/security/admin";
import { loadOnboardingNavState } from "@/lib/server/page-loaders";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Community" };

// Audit D06: community is its own destination instead of the bottom of Home.
export default async function CommunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const showOnboardingNav = await loadOnboardingNavState();

  return (
    <AppShell
      eyebrow=""
      title="Community"
      description="Short market posts with $TICKER tags, comment threads, trending tickers and active discussions."
      activePath="/community"
      showOnboardingNav={showOnboardingNav}
      showAdminLink={isAdminUser(user)}
    >
      <Suspense>
        <HomeFeedClient />
      </Suspense>
    </AppShell>
  );
}
