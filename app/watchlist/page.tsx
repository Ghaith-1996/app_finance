import { Suspense } from "react";

import { AppShell } from "@/components/app/app-shell";
import { WatchlistPageClient } from "@/components/app/watchlist-page-client";
import { loadWatchlistItems, refreshWatchlistPrices } from "@/lib/actions/watchlist";

export default async function WatchlistPage() {
  const items = await refreshWatchlistPrices().catch(() => loadWatchlistItems());

  return (
    <AppShell
      eyebrow=""
      title="Watchlist"
      description="Track symbols and open the news feed for any asset in one click."
      activePath="/watchlist"
      backHref="/portfolio"
    >
      <Suspense>
        <WatchlistPageClient items={items} />
      </Suspense>
    </AppShell>
  );
}
