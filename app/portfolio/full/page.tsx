import Link from "next/link";
import { cookies } from "next/headers";
import {
  BarChart3,
  Cpu,
  Landmark,
  Layers3,
  Sparkles,
  Zap,
} from "lucide-react";

import { PortfolioCopilotPanel } from "@/components/app/portfolio-copilot-panel";
import { PortfolioPricingSection } from "@/components/app/portfolio-pricing-section";
import { AppShell } from "@/components/app/app-shell";
import { buttonStyles } from "@/components/ui/button";
import { getCurrentUserBillingSummary } from "@/lib/billing/subscriptions";
import { loadFullPortfolioPageData } from "@/lib/server/page-loaders";
import {
  chatGrantCookieName,
  hasValidChatGrantValue,
  type ChatGrantScope,
} from "@/lib/security/chat-turnstile-grant";
import { createClient } from "@/lib/supabase/server";
import type {
  Holding,
  PortfolioFeedHighlight,
  PortfolioInsight,
} from "@/lib/types";
import { categoryLabel, formatCurrency } from "@/lib/utils";

interface SectorCard {
  label: string;
  percent: number;
  detail: string;
  icon: typeof Cpu;
  iconClassName: string;
  barClassName: string;
}

function getHoldingPrice(holding: Holding) {
  return holding.currentPrice || holding.price || 0;
}

function getHoldingValue(holding: Holding) {
  if (holding.currentValue > 0) return holding.currentValue;
  const price = getHoldingPrice(holding);
  if (holding.quantity > 0) return holding.quantity * price;
  if (holding.allocation > 0) return holding.allocation;
  return 0;
}

function getSectorVisuals(sector: string) {
  const normalized = sector.toLowerCase();
  if (normalized.includes("tech")) {
    return {
      icon: Cpu,
      iconClassName: "bg-brand/10 text-brand",
      barClassName: "bg-brand",
    };
  }
  if (normalized.includes("energy")) {
    return {
      icon: Zap,
      iconClassName: "bg-amber-500/10 text-amber-400",
      barClassName: "bg-amber-400",
    };
  }
  return {
    icon: Layers3,
    iconClassName: "bg-white/5 text-slate-400",
    barClassName: "bg-slate-500",
  };
}

function classifyHoldingBucket(holding: Holding): "technology" | "energy" | "others" {
  const symbol = holding.symbol.trim().toUpperCase();
  const sector = holding.sector.trim().toLowerCase();
  const company = holding.company.trim().toLowerCase();

  const technologySymbols = new Set([
    "AAPL",
    "APPL",
    "MSFT",
    "NVDA",
    "GOOG",
    "GOOGL",
    "META",
    "AMZN",
    "TSM",
    "AMD",
    "AVGO",
    "ORCL",
    "CRM",
    "ADBE",
    "INTC",
  ]);

  if (technologySymbols.has(symbol)) {
    return "technology";
  }

  if (
    sector.includes("technology") ||
    sector.includes("tech") ||
    sector.includes("communication") ||
    sector.includes("semiconductor") ||
    sector.includes("software") ||
    sector.includes("internet") ||
    sector.includes("interactive media") ||
    sector.includes("consumer electronics") ||
    sector.includes("hardware")
  ) {
    return "technology";
  }

  if (
    company.includes("apple") ||
    company.includes("microsoft") ||
    company.includes("nvidia") ||
    company.includes("alphabet") ||
    company.includes("google") ||
    company.includes("meta")
  ) {
    return "technology";
  }

  if (
    sector.includes("energy") ||
    sector.includes("oil") ||
    sector.includes("gas") ||
    sector.includes("utilities")
  ) {
    return "energy";
  }

  return "others";
}

function buildSectorCards(holdings: Holding[]): SectorCard[] {
  if (holdings.length === 0) {
    return [
      {
        label: "Technology",
        percent: 0,
        detail: "No holdings loaded",
        ...getSectorVisuals("technology"),
      },
      {
        label: "Energy",
        percent: 0,
        detail: "No holdings loaded",
        ...getSectorVisuals("energy"),
      },
      {
        label: "Others",
        percent: 0,
        detail: "No holdings loaded",
        ...getSectorVisuals("others"),
      },
    ];
  }

  let technologyValue = 0;
  let energyValue = 0;
  let othersValue = 0;

  for (const holding of holdings) {
    const value = getHoldingValue(holding);
    const bucket = classifyHoldingBucket(holding);

    if (bucket === "technology") {
      technologyValue += value;
      continue;
    }
    if (bucket === "energy") {
      energyValue += value;
      continue;
    }

    othersValue += value;
  }

  const totalValue = technologyValue + energyValue + othersValue;

  return [
    {
      label: "Technology",
      percent: totalValue > 0 ? (technologyValue / totalValue) * 100 : 0,
      detail:
        technologyValue > 0
          ? `${formatCurrency(Math.round(technologyValue))} current value`
          : "No allocation",
      ...getSectorVisuals("technology"),
    },
    {
      label: "Energy",
      percent: totalValue > 0 ? (energyValue / totalValue) * 100 : 0,
      detail:
        energyValue > 0
          ? `${formatCurrency(Math.round(energyValue))} current value`
          : "No allocation",
      ...getSectorVisuals("energy"),
    },
    {
      label: "Others",
      percent: totalValue > 0 ? (othersValue / totalValue) * 100 : 0,
      detail:
        othersValue > 0
          ? `${formatCurrency(Math.round(othersValue))} across remaining sectors`
          : "No remaining sectors",
      ...getSectorVisuals("others"),
    },
  ];
}

function findInsight(insights: PortfolioInsight[], key: string) {
  return insights.find((insight) => insight.title.toLowerCase().includes(key));
}

function buildInsightSummary(
  insights: PortfolioInsight[],
  feedHighlights: PortfolioFeedHighlight[],
  sectorCards: SectorCard[],
) {
  const topThemeInsight = findInsight(insights, "most exposed");
  const macroInsight = findInsight(insights, "macro");
  const catalystInsight = findInsight(insights, "catalyst");
  const leadingFeed = feedHighlights[0];
  const macroFeed =
    feedHighlights.find((item) => item.category === "macro") ?? leadingFeed;

  return {
    topTheme: {
      value: topThemeInsight?.value ?? sectorCards[0]?.label ?? "No concentration yet",
      detail:
        topThemeInsight?.detail ??
        `${Math.round(sectorCards[0]?.percent ?? 0)}% of tracked portfolio value`,
    },
    macroWatch: {
      value:
        macroInsight?.value ??
        (macroFeed ? categoryLabel(macroFeed.category) : "No macro signal yet"),
      detail:
        macroInsight?.detail ??
        macroFeed?.whyItMatters ??
        macroFeed?.aiSummary ??
        "Run analysis to see a current macro watch item.",
    },
    freshCatalyst: {
      value:
        leadingFeed?.headline ??
        catalystInsight?.value ??
        "No catalyst available yet",
      detail:
        leadingFeed?.whyItMatters ??
        leadingFeed?.aiSummary ??
        catalystInsight?.detail ??
        "Run analysis to generate a portfolio-specific catalyst.",
    },
  };
}

export default async function FullPortfolioPage() {
  const billingSummary = await getCurrentUserBillingSummary();
  const {
    showOnboardingNav,
    showAdminLink,
    portfolioId,
    portfolioCreatedAt,
    holdings,
    portfolioOverview,
    portfolioValueSnapshots,
    insights,
    feedHighlights,
  } = await loadFullPortfolioPageData();

  if (!portfolioId) {
    return (
      <AppShell
        eyebrow="Portfolio"
        title="No portfolio yet"
        description="Create a portfolio from onboarding to unlock the detailed holdings view."
        activePath="/portfolio"
        backHref="/portfolio"
        showOnboardingNav={showOnboardingNav}
        showAdminLink={showAdminLink}
        actions={
          <Link href="/portfolio" className={buttonStyles({ variant: "secondary" })}>
            Back to overview
          </Link>
        }
      >
        <div className="space-y-4 rounded-[2rem] border border-white/[0.06] bg-surface-raised p-8 text-center shadow-sm">
          <p className="text-slate-400">
            You need a portfolio before the full holdings breakdown can load.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/onboarding" className={buttonStyles({ size: "lg" })}>
              Start onboarding
            </Link>
            <Link href="/portfolio" className={buttonStyles({ variant: "secondary" })}>
              Portfolio overview
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }
  const sectorCards = buildSectorCards(holdings);
  const insightSummary = buildInsightSummary(insights, feedHighlights, sectorCards);

  // Compute initial Turnstile grant state for the portfolio copilot.
  let initialCopilotTurnstileVerified = false;
  {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const scope: ChatGrantScope = {
        userId: user.id,
        surface: "portfolio-copilot",
        portfolioId,
      };
      const cookieStore = await cookies();
      const rawGrant = cookieStore.get(chatGrantCookieName(scope))?.value;
      initialCopilotTurnstileVerified = hasValidChatGrantValue(rawGrant, scope);
    }
  }

  return (
    <AppShell
      eyebrow=""
      title="Portfolio Strategy"
      description="Advanced position oversight for your diversified Signal Emerald custody account."
      activePath="/portfolio"
      backHref="/portfolio"
      showOnboardingNav={showOnboardingNav}
      showAdminLink={showAdminLink}
    >
      <div className="overflow-hidden rounded-[1.75rem] bg-[#0a0f15] p-4 shadow-inner sm:rounded-[2.25rem] sm:p-6 lg:p-8 xl:p-10">
        <div className="flex flex-col gap-8 lg:flex-row xl:gap-10 2xl:gap-12">
          <PortfolioPricingSection
            portfolioId={portfolioId}
            portfolioCreatedAt={portfolioCreatedAt ?? new Date().toISOString()}
            initialOverview={portfolioOverview}
            initialHoldings={holdings}
            initialValueSnapshots={portfolioValueSnapshots}
          >
            <div>
              <h2 className="mb-6 text-[22px] font-bold tracking-tight text-white">
                Allocation & Position
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {sectorCards.map((card) => {
                  const Icon = card.icon;

                  return (
                    <div
                      key={card.label}
                      className="rounded-[1.5rem] border border-white/[0.06] bg-surface-raised p-6 shadow-sm"
                    >
                      <div className="mb-4 flex items-start justify-between">
                        <div className={`rounded-xl p-2.5 ${card.iconClassName}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <span
                          className={`text-[14px] font-bold ${
                            card.label === "Energy"
                              ? "text-amber-400"
                              : card.label === "Others"
                                ? "text-slate-400"
                                : "text-brand"
                          }`}
                        >
                          {Math.round(card.percent)}%
                        </span>
                      </div>
                      <h3 className="font-bold text-white">{card.label}</h3>
                      <p className="mt-1 text-[12px] text-slate-500">{card.detail}</p>
                      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className={`h-full rounded-full ${card.barClassName}`}
                          style={{ width: `${card.percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </PortfolioPricingSection>

          <div className="w-full shrink-0 space-y-4 lg:w-[320px] xl:w-[340px] 2xl:w-[360px]">
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/[0.06] bg-surface-raised p-5 sm:p-8 shadow-sm">
              <div className="pointer-events-none absolute top-0 right-0 h-32 w-32 rounded-bl-full bg-gradient-to-bl from-white/5 to-transparent" />

              <div className="mb-8 flex items-center gap-3">
                <div className="text-brand">
                  <Sparkles className="h-6 w-6 fill-current" />
                </div>
                <h2 className="text-[20px] font-bold tracking-tight text-white">
                  Insight Summary
                </h2>
              </div>

              <div className="space-y-8">
                <div>
                  <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    MOST EXPOSED THEME
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-sm shadow-brand/20">
                      <Cpu className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-white">
                        {insightSummary.topTheme.value}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-400">
                        {insightSummary.topTheme.detail}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    MACRO WATCH
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-500">
                      <BarChart3 className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-white">
                        {insightSummary.macroWatch.value}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-400">
                        {insightSummary.macroWatch.detail}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    FRESH CATALYST
                  </p>
                  <div className="flex flex-col gap-2 rounded-2xl border-l-4 border-brand bg-surface-raised p-4 shadow-sm">
                    <p className="text-[14px] font-bold text-white">
                      {insightSummary.freshCatalyst.value}
                    </p>
                    <p className="text-[13px] leading-snug text-slate-400">
                      {insightSummary.freshCatalyst.detail}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <PortfolioCopilotPanel
              portfolioId={portfolioId}
              allowedTiers={billingSummary.allowedModelTiers}
              defaultModelTier={billingSummary.defaultModelTier}
              initialTurnstileVerified={initialCopilotTurnstileVerified}
            />

            <div className="rounded-[2.5rem] border border-brand/15 bg-brand/10 p-5 sm:p-8 shadow-sm">
              <p className="mb-3 text-[13px] font-bold text-brand">Emerald Advisor</p>
              <p className="text-[15px] leading-relaxed text-slate-400">
                {feedHighlights[0]?.whyItMatters ||
                  insights[0]?.detail ||
                  "Run analysis to surface a more specific recommendation for this portfolio."}
              </p>
              <div className="mt-5">
                <Link
                  href="/analysis"
                  className="inline-flex items-center gap-1 border-b-2 border-brand/20 pb-0.5 text-[14px] font-bold text-white transition-colors hover:border-brand"
                >
                  Review Analysis
                </Link>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/[0.06] bg-surface-raised p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <Landmark className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-sm font-semibold text-white">Latest analysis</p>
                  <p className="text-sm text-slate-500">
                    {portfolioOverview.lastAnalyzedAt}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-400">
                {portfolioOverview.coverage}. {portfolioOverview.primaryGoal}
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
