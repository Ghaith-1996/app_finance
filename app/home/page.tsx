import { Suspense } from "react";

import { AppShell } from "@/components/app/app-shell";
import { HomeFeedClient } from "@/components/app/home-feed";

export default function HomePage() {
  return (
    <AppShell
      eyebrow=""
      title="Home"
      description="Market conversations and community insights."
      activePath="/home"
    >
      <Suspense>
        <HomeFeedClient />
      </Suspense>
    </AppShell>
  );
}
