import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { ActivePortfolioValueCard } from "@/components/app/active-portfolio-value-card";
import { AppShell } from "@/components/app/app-shell";
import { FeedView } from "@/components/app/feed-view";
import { buttonStyles } from "@/components/ui/button";
import { getBillingSummaryForUser } from "@/lib/billing/subscriptions";
import { Panel } from "@/components/ui/panel";
import { loadFeedPageData } from "@/lib/server/page-loaders";
import { createClient } from "@/lib/supabase/server";

function analysisPulseFill(lastAnalyzedAt: string): number {
  if (lastAnalyzedAt === "Never") return 12;
  if (lastAnalyzedAt.includes("Just now")) return 98;
  if (lastAnalyzedAt.includes("minute")) return 90;
  const hoursMatch = lastAnalyzedAt.match(/(\d+)\s*hours?/);
  if (hoursMatch) return Math.max(38, 88 - Number(hoursMatch[1]) * 9);
  const daysMatch = lastAnalyzedAt.match(/(\d+)\s*days?/);
  if (daysMatch) return Math.max(18, 55 - Number(daysMatch[1]) * 10);
  return 55;
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams?: Promise<{ symbol?: string | string[]; ticker?: string | string[] }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const raw = sp.symbol;
  const initialSymbol =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const rawTicker = sp.ticker;
  const initialTicker =
    typeof rawTicker === "string" ? rawTicker : Array.isArray(rawTicker) ? rawTicker[0] : undefined;

  const {
    showOnboardingNav,
    showAdminLink,
    portfolioId,
    portfolioOverview,
    portfolioInsights,
    initialFeedPayload,
    marketStoryCount24h,
    matchedStoryCount24h,
  } = await loadFeedPageData();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const billingSummary = user ? await getBillingSummaryForUser(user.id, user.email) : null;

  const pulsePct = analysisPulseFill(portfolioOverview.lastAnalyzedAt);

  return (
    <AppShell
      eyebrow="Daily brief"
      title="A personalized news feed built around what you own."
      description="Leveraging compound analysis to distill 14,000+ daily data points into your critical performance drivers."
      activePath="/feed"
      showOnboardingNav={showOnboardingNav}
      showAdminLink={showAdminLink}
      actions={
        <Link href="/portfolio" className={buttonStyles({ size: "lg" })}>
          View portfolio
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      }
    >
      <div className="space-y-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Panel className="space-y-3 rounded-2xl p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Intelligence coverage
            </p>
            <p className="text-3xl font-semibold tracking-tight text-white">
              {marketStoryCount24h}
            </p>
            <p className="text-sm text-slate-500">market stories in the last 24 hours</p>
            <div className="pt-1">
              <span className="inline-flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                <span className="h-2 w-2 rounded-full bg-brand" />
                Feed ready
              </span>
            </div>
            <p className="text-sm text-slate-400">
              {matchedStoryCount24h} matched to your portfolio
            </p>
          </Panel>

          <ActivePortfolioValueCard
            portfolioId={portfolioId}
            initialOverview={portfolioOverview}
          />

          <Panel className="space-y-3 rounded-2xl p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Analysis pulse
            </p>
            <p className="text-3xl font-semibold tracking-tight text-white">
              {portfolioOverview.lastAnalyzedAt}
            </p>
            <p className="text-sm text-slate-500">Auto-updated every 20 min</p>
            <div className="pt-2">
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-500"
                  style={{ width: `${pulsePct}%` }}
                />
              </div>
            </div>
          </Panel>
        </div>

        <FeedView
          portfolioId={portfolioId}
          insights={portfolioInsights}
          initialSymbol={initialSymbol}
          initialTicker={initialTicker}
          initialFeedPayload={initialFeedPayload}
          allowedModelTiers={billingSummary?.allowedModelTiers}
          defaultModelTier={billingSummary?.defaultModelTier}
        />
      </div>
    </AppShell>
  );
}
