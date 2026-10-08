import Link from "next/link";
import { cookies } from "next/headers";

import { ArrowRight } from "lucide-react";

import { ActivePortfolioValueCard } from "@/components/app/active-portfolio-value-card";
import { AppShell } from "@/components/app/app-shell";
import { FeedView } from "@/components/app/feed-view";
import { buttonStyles } from "@/components/ui/button";
import { getBillingSummaryForUser } from "@/lib/billing/subscriptions";
import { getTranslations } from "@/lib/i18n/server";
import { Panel } from "@/components/ui/panel";
import { loadDeepLinkedStory } from "@/lib/server/feed";
import { loadFeedPageData } from "@/lib/server/page-loaders";
import {
  chatGrantCookieName,
  hasValidChatGrantValue,
  type ChatGrantScope,
} from "@/lib/security/chat-turnstile-grant";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Feed" };

export default async function FeedPage({
  searchParams,
}: {
  searchParams?: Promise<{
    symbol?: string | string[];
    ticker?: string | string[];
    story?: string | string[];
  }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const raw = sp.symbol;
  const initialSymbol =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const rawTicker = sp.ticker;
  const initialTicker =
    typeof rawTicker === "string" ? rawTicker : Array.isArray(rawTicker) ? rawTicker[0] : undefined;
  const rawStory = sp.story;
  const initialStoryId =
    typeof rawStory === "string" ? rawStory : Array.isArray(rawStory) ? rawStory[0] : undefined;

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
  const billingSummary = user ? await getBillingSummaryForUser(user.id, user.email, user) : null;
  // Resolve ?story= by ID so saved/digest/alert links work outside the 24h feed window (F05).
  const initialStory = await loadDeepLinkedStory(supabase, initialStoryId, {
    portfolioSymbols: initialFeedPayload?.portfolioSymbols ?? [],
    watchlistSymbols: initialFeedPayload?.watchlistSymbols ?? [],
  });
  const { t } = await getTranslations();

  // Compute initial Turnstile grant state for the general "Ask AI" chat.
  // Only possible when we actually have a portfolio scope to key the grant on.
  let initialGeneralChatTurnstileVerified = false;
  if (user && portfolioId) {
    const scope: ChatGrantScope = {
      userId: user.id,
      surface: "article-chat-general",
      portfolioId,
    };
    const cookieStore = await cookies();
    const rawGrant = cookieStore.get(chatGrantCookieName(scope))?.value;
    initialGeneralChatTurnstileVerified = hasValidChatGrantValue(rawGrant, scope);
  }


  return (
    <AppShell
      eyebrow={t("pages.feedEyebrow")}
      title={t("pages.feedTitle")}
      description={t("pages.feedDescription")}
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
      <div className="space-y-5">
        {/* Audit D01: one compact strip instead of three tall cards, so the first stories sit
            above the fold. */}
        <Panel className="grid gap-4 rounded-2xl p-4 sm:grid-cols-3 sm:gap-6 sm:px-6">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Intelligence coverage
            </p>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-semibold tracking-tight text-white">
                {marketStoryCount24h}
              </span>
              <span className="text-sm text-slate-500">market stories in the last 24 hours</span>
            </p>
            <p className="text-xs text-slate-400">{matchedStoryCount24h} matched to your portfolio</p>
          </div>

          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Last analysis
            </p>
            <p className="text-xl font-semibold tracking-tight text-white">
              {portfolioOverview.lastAnalyzedAt}
            </p>
            <p className="text-xs text-slate-500">Auto-updated every 20 min</p>
          </div>

          <ActivePortfolioValueCard
            portfolioId={portfolioId}
            initialOverview={portfolioOverview}
            compact
          />
        </Panel>

        <FeedView
          portfolioId={portfolioId}
          insights={portfolioInsights}
          initialSymbol={initialSymbol}
          initialTicker={initialTicker}
          initialStoryId={initialStoryId}
          initialStory={initialStory}
          initialFeedPayload={initialFeedPayload}
          allowedModelTiers={billingSummary?.allowedModelTiers}
          defaultModelTier={billingSummary?.defaultModelTier}
          initialGeneralChatTurnstileVerified={initialGeneralChatTurnstileVerified}
        />
      </div>
    </AppShell>
  );
}
