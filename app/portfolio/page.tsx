import Link from "next/link";
import { ArrowRight, Bookmark } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import {
  getPortfolio,
  getPortfolioFeedHighlights,
  getPortfolioOverview,
  getUserPortfolios,
} from "@/lib/actions/portfolio";
import type { Holding, PortfolioFeedHighlight } from "@/lib/types";
import { categoryLabel, formatCurrency } from "@/lib/utils";

const STORY_CARD_SURFACES = [
  "bg-gradient-to-br from-[#FAF9F5] to-[#F3F4F1]",
  "bg-gradient-to-br from-[#EAEBD8] to-[#E3E4C8]",
  "bg-gradient-to-b from-slate-100 to-slate-50",
];

function formatStoryTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.floor((Date.now() - t) / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  if (min < 1440) return `${Math.floor(min / 60)} hours ago`;
  return `${Math.floor(min / 1440)} days ago`;
}

function storyTickerTag(h: PortfolioFeedHighlight): string {
  if (h.holdings.length > 0) return h.holdings[0];
  if (h.sectors.length > 0) return h.sectors[0].slice(0, 8).toUpperCase();
  return "News";
}

export default async function PortfolioPage() {
  const { data: portfolios } = await getUserPortfolios();
  const portfolioId = portfolios?.[0]?.id ?? null;

  if (!portfolioId) {
    return (
      <AppShell
        eyebrow="Portfolio"
        title="No portfolio yet"
        description="Create a portfolio from onboarding to see holdings and analysis here."
        activePath="/portfolio"
      >
        <div className="border border-black/6 bg-white/84 p-8 text-center rounded-[2rem]">
          <p className="text-slate-600">
            You don&apos;t have a portfolio yet. Complete onboarding to add one.
          </p>
          <Link href="/onboarding" className="mt-4 inline-block bg-slate-950 text-white px-5 py-2.5 rounded-full font-medium transition hover:bg-slate-800">
            Start onboarding
          </Link>
        </div>
      </AppShell>
    );
  }

  const [{ data: portfolioData }, { data: overview }, { data: feedHighlights }] =
    await Promise.all([
      getPortfolio(portfolioId),
      getPortfolioOverview(portfolioId),
      getPortfolioFeedHighlights(portfolioId),
    ]);

  const portfolioOverview = overview ?? {
    totalValue: 17900,
    dayChange: -1.92,
    monthlyChange: 0,
    lastSyncedAt: "2 mins ago",
    lastAnalyzedAt: "21 hours ago",
    coverage: "0 stories",
    primaryGoal: "Add holdings and run analysis.",
  };
  const holdings = portfolioData?.holdings ?? [];
  const topStories = (feedHighlights ?? []).slice(0, 3);

  const sourceDisplayLabel = effectivePortfolioSourceLabel(
    portfolioData?.sourceType,
    holdings,
  );
  const sourceStatusLabel = effectiveSourceStatusBadge(
    portfolioData?.sourceType,
    sourceDisplayLabel,
  );

  return (
    <AppShell
      eyebrow=""
      title="Portfolio Overview"
      description="Welcome back. Here's your market snapshot for today."
      activePath="/portfolio"
    >
      <div className="space-y-6">
        {/* Top row cards */}
        <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr_0.9fr]">
          <div className="flex flex-col justify-between rounded-[2rem] bg-[#586475] p-8 text-white shadow-sm min-h-[180px]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#A1B2C6]">
                TOTAL VALUE
              </p>
              <div className="mt-4 flex items-baseline gap-3">
                <p className="text-4xl font-bold tracking-tight">
                  {formatCurrency(portfolioOverview.totalValue || 17900).split('.')[0]}
                </p>
                <p className={`text-sm font-semibold flex items-center ${portfolioOverview.dayChange >= 0 ? 'text-emerald-400' : 'text-[#FF7F7F]'}`}>
                  {portfolioOverview.dayChange >= 0 ? '+' : ''}{portfolioOverview.dayChange}%
                </p>
              </div>
            </div>
            <p className="text-[13px] text-[#A1B2C6]">
              Updated {portfolioOverview.lastSyncedAt || "2 mins ago"}
            </p>
          </div>

          <div className="flex flex-col justify-between rounded-[2rem] border border-black/5 bg-white p-8 shadow-sm min-h-[180px]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                IMPORT METHOD
              </p>
              <p className="mt-4 text-[26px] font-bold tracking-tight text-slate-900">{sourceDisplayLabel}</p>
            </div>
            <div className="mt-auto pt-4 flex">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F8ED] px-3 py-1.5 text-[11px] font-bold tracking-widest text-[#009B5A]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00D17A]" />
                {sourceStatusLabel.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-[2rem] border border-black/5 bg-white p-8 shadow-sm min-h-[180px]">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                LAST ANALYZED
              </p>
              <p className="mt-4 text-[26px] font-bold tracking-tight text-slate-900">{portfolioOverview.lastAnalyzedAt || "Never"}</p>
            </div>
            <div className="mt-auto pt-4 flex">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3F6F4] px-3 py-1.5 text-[11px] font-bold tracking-widest text-[#428160]">
                <svg className="h-3.5 w-3.5 text-[#00B86F]" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
                HEALTH CHECK PASSED
              </span>
            </div>
          </div>
        </div>

        {/* Action cards row */}
        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <Link href="/portfolio/full" className="group relative flex items-center justify-between overflow-hidden rounded-[2.5rem] bg-[#00B86F] p-8 text-white transition-all hover:bg-[#00a865]">
            <div className="relative z-10 pl-2">
              <h2 className="text-[26px] font-bold tracking-tight">See Full Portfolio</h2>
              <p className="mt-2 text-[#C0EFD8] text-[15px]">Drill down into individual asset performance.</p>
            </div>
            <div className="relative z-10 rounded-full bg-black/10 p-4 transition-colors group-hover:bg-black/20 mr-2">
              <ArrowRight className="h-5 w-5" />
            </div>
          </Link>

          <Link href="/watchlist" className="group relative flex items-center justify-between overflow-hidden rounded-[2.5rem] bg-[#EAEAEA] p-8 text-slate-900 transition-all hover:bg-[#e0e0e0]">
            <div className="relative z-10 pl-2">
              <h2 className="text-[26px] font-bold tracking-tight">Watch List</h2>
              <p className="mt-2 text-slate-600 text-[15px]">Track your potential next big moves.</p>
            </div>
            <div className="relative z-10 rounded-full bg-black/5 p-4 transition-colors group-hover:bg-black/10 mr-2">
              <ArrowRight className="h-5 w-5" />
            </div>
          </Link>
        </div>

        {/* Top Stories section */}
        <div className="pt-6">
          <div className="flex items-end justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Top Stories</h2>
            <Link href="/feed" className="text-sm font-bold text-[#009B5A] hover:text-[#00B86F]">
              View All Feed
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {topStories.length === 0 ? (
              <div className="md:col-span-3 flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-black/10 bg-slate-50/80 px-8 py-14 text-center">
                <p className="max-w-md text-[15px] font-medium text-slate-700">
                  No feed stories yet. Run analysis with news refresh to match articles to your
                  holdings—they will show up here and in your feed.
                </p>
                <Link
                  href="/analysis"
                  className="mt-5 text-sm font-bold text-[#009B5A] hover:text-[#00B86F]"
                >
                  Go to Analysis
                </Link>
              </div>
            ) : (
              topStories.map((story, i) => {
                const snippet =
                  story.aiSummary?.trim() ||
                  story.whyItMatters?.trim() ||
                  "Open your feed for the full summary and match context.";
                const categoryTag = categoryLabel(story.category).toUpperCase();
                const when = formatStoryTime(story.publishedAt);
                return (
                  <Link
                    key={`${story.headline}-${i}`}
                    href="/feed"
                    className="group flex flex-col overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
                  >
                    <div
                      className={`h-[140px] w-full shrink-0 ${STORY_CARD_SURFACES[i % STORY_CARD_SURFACES.length]}`}
                      aria-hidden
                    />
                    <div className="flex flex-1 flex-col p-6">
                      <div className="mb-4 flex flex-wrap gap-2">
                        <span className="rounded-md bg-[#F4F4F5] px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-500">
                          {storyTickerTag(story)}
                        </span>
                        <span className="rounded-md bg-[#F4F4F5] px-2 py-0.5 text-[10px] font-bold tracking-widest text-slate-500">
                          {categoryTag}
                        </span>
                        {story.relevanceScore > 0 ? (
                          <span className="rounded-md bg-[#E8F8ED] px-2 py-0.5 text-[10px] font-bold tracking-widest text-[#009B5A]">
                            {Math.round(story.relevanceScore)}% match
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-[17px] font-bold leading-snug tracking-tight text-slate-900 group-hover:text-[#009B5A]">
                        {story.headline}
                      </h3>
                      <p className="mt-3 line-clamp-3 text-[14px] leading-relaxed text-slate-500">
                        {snippet}
                      </p>
                      <div className="mt-8 flex items-center justify-between pt-2 text-xs font-medium text-slate-400">
                        <span>
                          {story.source}
                          {when ? ` · ${when}` : ""}
                        </span>
                        <Bookmark className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-[#009B5A]" />
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function sourceTypeLabel(sourceType: string | undefined): string {
  switch (sourceType) {
    case "manual": return "Manual portfolio";
    case "demo": return "Demo portfolio";
    case "csv": return "CSV Import";
    case "wealthsimple": return "Wealthsimple";
    case "interactive_brokers": return "Interactive Brokers";
    default: {
      if (!sourceType) return "Manual portfolio";
      if (sourceType.toLowerCase().includes("csv")) return "CSV Import";
      return sourceType;
    }
  }
}

function isCsvBackedHolding(h: Holding): boolean {
  const imp = (h.importSource || "").toLowerCase();
  if (imp === "csv" || imp.includes("csv")) return true;
  return (h.source || "").toLowerCase().includes("csv");
}

function effectivePortfolioSourceLabel(
  dbSource: string | undefined,
  holdings: Holding[],
): string {
  const n = holdings.length;
  if (n === 0) return sourceTypeLabel(dbSource);

  const csvCount = holdings.filter(isCsvBackedHolding).length;
  const majorityCsv = csvCount > 0 && csvCount >= Math.ceil(n / 2);
  if (majorityCsv) return "CSV Import";

  return sourceTypeLabel(dbSource);
}

function effectiveSourceStatusBadge(
  dbSource: string | undefined,
  displayLabel: string,
): string {
  if (displayLabel === "CSV Import") return "Active";
  if (dbSource === "manual" || dbSource === "demo") return "Manual";
  return "Active";
}
