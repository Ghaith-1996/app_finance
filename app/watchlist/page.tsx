import { Suspense } from "react";

import { AppShell } from "@/components/app/app-shell";
import { WatchlistPageClient } from "@/components/app/watchlist-page-client";
import { loadWatchlistItems } from "@/lib/actions/watchlist";

export default async function WatchlistPage() {
  const items = await loadWatchlistItems();

  return (
    <AppShell
      eyebrow=""
      title="Watchlist"
      description="Track symbols and open the news feed for any asset in one click."
      activePath="/watchlist"
      showOnboardingNav={false}
      backHref="/portfolio"
    >
      <Suspense>
        <WatchlistPageClient items={items} />
      </Suspense>
    </AppShell>
  );
}
