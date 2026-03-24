"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ArrowRight,
  ChevronDown,
  FileText,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

import { ArticleChatPanel } from "@/components/app/article-chat-panel";
import { NewsFeedCard } from "@/components/app/news-feed-card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { FeedMode, NewsItem, PortfolioInsight } from "@/lib/types";
import {
  INGEST_SOURCE_KEYS,
  INGEST_SOURCE_LABELS,
  isMarketHeadlineSource,
} from "@/lib/services/news/source-config";
import {
  categoryLabel,
  cn,
  effectLabel,
  effectTone,
  matchReasonLabel,
} from "@/lib/utils";
import {
  readLastIngestSnapshot,
  isRecentIngestHint,
  type LastIngestSnapshot,
} from "@/lib/ingest-hint";

/** UI recency choices; API and ingestion cap visibility at 24 hours. */
const FEED_HARD_CAP_MINUTES = 24 * 60;

const recencyOptions = [
  { label: "Last 24 Hours", maxMinutes: FEED_HARD_CAP_MINUTES },
  { label: "Past hour", maxMinutes: 60 },
  { label: "Past 2 hours", maxMinutes: 120 },
];

const sourceTypeOptions = [
  { label: "All sources", value: "" },
  { label: "SEC Filings", value: "edgar" },
  { label: "Market Headlines", value: "headlines" },
];

const selectTriggerClass =
  "w-full min-w-0 appearance-none rounded-xl border border-white/10 bg-surface-raised py-2.5 pl-3 pr-9 text-sm font-medium text-slate-200 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

export function FeedView({
  portfolioId,
  insights = [],
  initialSymbol,
}: {
  portfolioId?: string | null;
  insights?: PortfolioInsight[];
  /** When set (e.g. from `/feed?symbol=AAPL`), pre-select that holding in personal mode if it appears in the feed. */
  initialSymbol?: string;
}) {
  const [mode, setMode] = useState<FeedMode>("personal");
  const [feed, setFeed] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const [portfolioSymbols, setPortfolioSymbols] = useState<string[]>([]);
  const [portfolioSectors, setPortfolioSectors] = useState<string[]>([]);

  // Personal-mode filters
  const [selectedHolding, setSelectedHolding] = useState("All holdings");
  const [selectedSector, setSelectedSector] = useState("All sectors");

  // Market-mode filters
  const [selectedSourceType, setSelectedSourceType] = useState(
    sourceTypeOptions[0].label,
  );

  // Shared filters
  const [selectedCategory, setSelectedCategory] = useState("All categories");
  const [selectedRecency, setSelectedRecency] = useState(recencyOptions[0].label);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [lastIngestHint, setLastIngestHint] = useState<LastIngestSnapshot | null>(null);

  const loadingRef = useRef(false);
  const initialSymbolAppliedRef = useRef(false);

  useEffect(() => {
    setLastIngestHint(readLastIngestSnapshot());
  }, [feed]);

  useEffect(() => {
    const raw = initialSymbol?.trim();
    if (!raw || initialSymbolAppliedRef.current) return;
    const sym = raw.toUpperCase();
    const match = portfolioSymbols.find((holding) => holding.toUpperCase() === sym);
    if (match) {
      setMode("personal");
      setSelectedHolding(match);
      initialSymbolAppliedRef.current = true;
    }
  }, [initialSymbol, portfolioSymbols]);

  useEffect(() => {
    setVisibleCount(8);
  }, [
    mode,
    selectedHolding,
    selectedSector,
    selectedCategory,
    selectedRecency,
    selectedSourceType,
  ]);

  const fetchFeed = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("mode", mode);
      if (portfolioId) params.set("portfolioId", portfolioId);
      const res = await fetch(`/api/feed?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to load feed");
        setFeed([]);
        return;
      }
      const newFeed: NewsItem[] = data.feed ?? [];
      setFeed(newFeed);
      setPortfolioSymbols(
        Array.isArray(data.portfolioSymbols)
          ? data.portfolioSymbols.filter((symbol: unknown): symbol is string => typeof symbol === "string")
          : [],
      );
      setPortfolioSectors(
        Array.isArray(data.portfolioSectors)
          ? data.portfolioSectors.filter((sector: unknown): sector is string => typeof sector === "string")
          : [],
      );
      setSelectedStoryId((prev) => {
        if (prev && newFeed.some((item) => item.id === prev)) return prev;
        return null;
      });
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [portfolioId, mode]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  // Realtime subscription only matters in personal mode
  useEffect(() => {
    if (!portfolioId || mode !== "personal") return;
    const supabase = createClient();
    const channel = supabase
      .channel(`feed-items-${portfolioId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "feed_items",
          filter: `portfolio_id=eq.${portfolioId}`,
        },
        () => {
          fetchFeed();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [portfolioId, mode, fetchFeed]);

  function handleModeChange(newMode: FeedMode) {
    setMode(newMode);
    setSelectedHolding("All holdings");
    setSelectedSector("All sectors");
    setSelectedSourceType(sourceTypeOptions[0].label);
    setSelectedCategory("All categories");
    setSelectedRecency(recencyOptions[0].label);
    setSelectedStoryId(null);
  }

  // --- Derived filter options ---

  const holdingOptions = useMemo(
    () => [
      "All holdings",
      ...portfolioSymbols,
    ],
    [portfolioSymbols],
  );
  const sectorOptions = useMemo(
    () => [
      "All sectors",
      ...portfolioSectors,
    ],
    [portfolioSectors],
  );
  const categoryOptions = useMemo(
    () => [
      "All categories",
      ...new Set(feed.map((s) => s.category).filter(Boolean)),
    ],
    [feed],
  );

  // --- Client-side filtering ---

  const filteredStories = useMemo(() => {
    const recency = recencyOptions.find(
      (option) => option.label === selectedRecency,
    );

    return feed.filter((story) => {
      const recencyMax = recency
        ? Math.min(recency.maxMinutes, FEED_HARD_CAP_MINUTES)
        : FEED_HARD_CAP_MINUTES;
      const matchesRecency = story.publishedMinutesAgo <= recencyMax;
      const matchesCategory =
        selectedCategory === "All categories" ||
        story.category === selectedCategory;

      if (mode === "personal") {
        const matchesHolding =
          selectedHolding === "All holdings" ||
          (story.holdings ?? []).includes(selectedHolding);
        const matchesSector =
          selectedSector === "All sectors" ||
          (story.sectors ?? []).includes(selectedSector);
        return matchesHolding && matchesSector && matchesCategory && matchesRecency;
      }

      // Market mode
      const sourceVal =
        sourceTypeOptions.find((o) => o.label === selectedSourceType)?.value ??
        "";
      const matchesSource =
        !sourceVal ||
        (sourceVal === "headlines"
          ? isMarketHeadlineSource(story.sourceType)
          : story.sourceType === sourceVal);
      return matchesSource && matchesCategory && matchesRecency;
    });
  }, [
    feed,
    mode,
    selectedHolding,
    selectedSector,
    selectedSourceType,
    selectedCategory,
    selectedRecency,
  ]);

  const holdingSummaryLabel = useMemo(() => {
    if (portfolioSymbols.length === 0) return "All portfolio";
    return `All portfolio (${portfolioSymbols.length} holding${portfolioSymbols.length === 1 ? "" : "s"})`;
  }, [portfolioSymbols]);

  const visibleStories = useMemo(
    () => filteredStories.slice(0, visibleCount),
    [filteredStories, visibleCount],
  );
  const remainingStories = Math.max(0, filteredStories.length - visibleCount);

  const selectedStory = selectedStoryId
    ? filteredStories.find((s) => s.id === selectedStoryId) ??
      filteredStories[0] ??
      null
    : null;

  function resetFilters() {
    setSelectedHolding("All holdings");
    setSelectedSector("All sectors");
    setSelectedSourceType(sourceTypeOptions[0].label);
    setSelectedCategory("All categories");
    setSelectedRecency(recencyOptions[0].label);
    setSelectedStoryId(null);
  }

  // --- Render ---

  if (error) {
    return (
      <Panel className="space-y-4 border-white/[0.06] bg-surface-raised p-8 text-center">
        <Badge tone="warning" className="mx-auto">
          Error
        </Badge>
        <p className="text-slate-400">{error}</p>
        <Button onClick={fetchFeed}>Retry</Button>
      </Panel>
    );
  }

  if (loading) {
    return (
      <Panel className="space-y-4 border-white/[0.06] bg-surface-raised p-8 text-center">
        <p className="text-slate-400">Loading feed…</p>
      </Panel>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <ModeToggle mode={mode} onChange={handleModeChange} />
            {mode === "personal" ? (
              <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:max-w-xl lg:justify-self-end">
                <label className="block min-w-0 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Select holding
                  </span>
                  <div className="relative">
                    <select
                      className={selectTriggerClass}
                      value={selectedHolding}
                      onChange={(e) => setSelectedHolding(e.target.value)}
                    >
                      {holdingOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === "All holdings" ? holdingSummaryLabel : opt}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </label>
                <label className="block min-w-0 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Recency
                  </span>
                  <div className="relative">
                    <select
                      className={selectTriggerClass}
                      value={selectedRecency}
                      onChange={(e) => setSelectedRecency(e.target.value)}
                    >
                      {recencyOptions.map((o) => (
                        <option key={o.label} value={o.label}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </label>
              </div>
            ) : (
              <div className="grid flex-1 gap-4 sm:grid-cols-3 lg:max-w-3xl lg:justify-self-end">
                <label className="block min-w-0 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Source
                  </span>
                  <div className="relative">
                    <select
                      className={selectTriggerClass}
                      value={selectedSourceType}
                      onChange={(e) => setSelectedSourceType(e.target.value)}
                    >
                      {sourceTypeOptions.map((o) => (
                        <option key={o.label} value={o.label}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </label>
                <label className="block min-w-0 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Category
                  </span>
                  <div className="relative">
                    <select
                      className={selectTriggerClass}
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                      {categoryOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {formatCategoryOption(opt)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </label>
                <label className="block min-w-0 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Recency
                  </span>
                  <div className="relative">
                    <select
                      className={selectTriggerClass}
                      value={selectedRecency}
                      onChange={(e) => setSelectedRecency(e.target.value)}
                    >
                      {recencyOptions.map((o) => (
                        <option key={o.label} value={o.label}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </label>
              </div>
            )}
          </div>
          {mode === "personal" ? (
            <details className="group mt-4 border-t border-white/[0.06] pt-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-500 hover:text-slate-300 [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                  Refine by sector or category
                  <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                </span>
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block min-w-0 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Sector
                  </span>
                  <div className="relative">
                    <select
                      className={selectTriggerClass}
                      value={selectedSector}
                      onChange={(e) => setSelectedSector(e.target.value)}
                    >
                      {sectorOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </label>
                <label className="block min-w-0 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Category
                  </span>
                  <div className="relative">
                    <select
                      className={selectTriggerClass}
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                      {categoryOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {formatCategoryOption(opt)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                </label>
              </div>
            </details>
          ) : null}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 transition hover:text-slate-300"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset filters
            </button>
          </div>
        </div>

        {filteredStories.length === 0 ? (
          <FeedEmptyState
            mode={mode}
            hasAnyData={feed.length > 0}
            onResetFilters={resetFilters}
            lastIngestHint={lastIngestHint}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-5">
              {visibleStories.map((story) => (
                <NewsFeedCard
                  key={story.id}
                  story={story}
                  mode={mode}
                  selected={story.id === selectedStoryId}
                  onOpen={() => setSelectedStoryId(story.id)}
                />
              ))}
            </div>
            {remainingStories > 0 ? (
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + 10)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/5 py-4 text-sm font-semibold text-slate-300 shadow-sm transition hover:border-white/16 hover:bg-surface-hover"
              >
                View {remainingStories} more intelligence reports
                <ChevronDown className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <FeedMomentumCard insights={insights} />
        <DetailPanel
          story={selectedStory}
          mode={mode}
          portfolioId={portfolioId}
          onClose={() => setSelectedStoryId(null)}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function pickInsight(insights: PortfolioInsight[], needle: string) {
  return insights.find((i) => i.title.toLowerCase().includes(needle));
}

function themeMeterPercent(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h + seed.charCodeAt(i) * (i + 1)) % 41;
  }
  return 52 + h;
}

function FeedMomentumCard({ insights }: { insights: PortfolioInsight[] }) {
  const themeInsight = pickInsight(insights, "theme") ?? insights[0];
  const macroInsight = pickInsight(insights, "macro") ?? insights[1];
  const catalystInsight = pickInsight(insights, "catalyst") ?? insights[2];
  const macroCritical =
    macroInsight &&
    /critical|inversion|recession|crash|emergency|\bselloff\b/i.test(
      `${macroInsight.value} ${macroInsight.detail}`,
    );
  const themePct = themeInsight
    ? themeMeterPercent(themeInsight.value + themeInsight.detail)
    : 62;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d1117] p-6 text-white shadow-[0_24px_60px_rgba(13,17,23,0.28)]">
      <div className="flex items-center gap-2 border-b border-white/10 pb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#14b8a6]/20 text-[#5eead4]">
          <Zap className="h-4 w-4" />
        </span>
        <h3 className="text-base font-semibold tracking-tight">Feed momentum</h3>
      </div>
      <div className="mt-5 space-y-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Most exposed theme
          </p>
          <p className="mt-2 text-lg font-semibold text-white">
            {themeInsight?.value ?? "—"}
          </p>
          {themeInsight?.detail ? (
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              {themeInsight.detail}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">
              Run analysis to surface the theme your feed is overweighting.
            </p>
          )}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#14b8a6]"
              style={{ width: `${themePct}%` }}
            />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Macro watch
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-white">
              {macroInsight?.value ?? "—"}
            </p>
            {macroCritical ? (
              <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-300">
                Critical
              </span>
            ) : null}
          </div>
          {macroInsight?.detail ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {macroInsight.detail}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Macro drivers from your last compound analysis run will land here.
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Fresh catalyst
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            {catalystInsight?.detail ??
              "New regulatory, earnings, or M&A catalysts will appear here after the next refresh."}
          </p>
        </div>
      </div>
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: FeedMode;
  onChange: (m: FeedMode) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-white/5 p-1">
      <button
        type="button"
        onClick={() => onChange("personal")}
        className={cn(
          "rounded-full px-5 py-2.5 text-sm font-semibold transition",
          mode === "personal"
            ? "bg-brand/15 text-brand"
            : "text-slate-500 hover:text-slate-300",
        )}
      >
        Personal Feed
      </button>
      <button
        type="button"
        onClick={() => onChange("market")}
        className={cn(
          "rounded-full px-5 py-2.5 text-sm font-semibold transition",
          mode === "market"
            ? "bg-brand/15 text-brand"
            : "text-slate-500 hover:text-slate-300",
        )}
      >
        Full Market
      </button>
    </div>
  );
}

function DetailPanel({
  story,
  mode,
  portfolioId,
  onClose,
}: {
  story: NewsItem | null;
  mode: FeedMode;
  portfolioId?: string | null;
  onClose: () => void;
}) {
  const isMarket = mode === "market";
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    setChatOpen(false);
  }, [story?.newsItemId]);

  if (!story) {
    return (
      <div className="flex h-fit min-h-[320px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/10 bg-surface-raised/50 px-6 py-12 text-center xl:sticky xl:top-28">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
          <FileText className="h-7 w-7 text-slate-500" />
        </div>
        <h2 className="mt-6 text-lg font-semibold text-white">
          Pick a story to dive deep
        </h2>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-500">
          Selecting an article will reveal institutional-grade breakdown, relevance
          summary, and why it&apos;s trending in your signal feed.
        </p>
      </div>
    );
  }

  return (
    <Panel className="h-fit space-y-5 rounded-2xl border-white/[0.06] bg-surface-raised p-6 shadow-sm xl:sticky xl:top-28">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Article detail
          </p>
          <h2 className="text-xl font-semibold leading-snug tracking-tight text-white">
            {story.headline}
          </h2>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-full border border-white/10 bg-white/5 p-2 text-slate-500 transition hover:bg-white/10 hover:text-slate-300"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-5">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">
              {categoryLabel(story.category)}
            </Badge>
            <Badge tone={effectTone(story.displayEffect)}>
              {effectLabel(story.displayEffect)}
            </Badge>

            {!isMarket && story.relevanceScore != null && (
              <Badge tone="brand">{story.relevanceScore}% match</Badge>
            )}
            {isMarket && story.isPortfolioMatch && (
              <Badge tone="brand">
                <ShieldCheck className="mr-1 h-3 w-3" />
                In portfolio
              </Badge>
            )}
            {isMarket && story.isWatchlistMatch && (
              <Badge tone="neutral">
                Watchlist
              </Badge>
            )}
            {!isMarket && (story.matchSources ?? []).includes("watchlist") && (
              <Badge tone="neutral">
                {(story.matchSources ?? []).includes("portfolio") ? "Portfolio + Watchlist" : "Watchlist"}
              </Badge>
            )}

            <Badge tone="neutral">{story.source}</Badge>
            <Badge tone="warning">{story.publishedAt}</Badge>
          </div>

          {/* Stock tags */}
          {story.stockTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {story.stockTags.map((tag) => {
                const isMatched = (story.matchedStockTags ?? []).includes(tag);
                return (
                  <Badge key={tag} tone={isMatched ? "brand" : "neutral"}>
                    #{tag}
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Per-ticker impacts */}
          {story.tickerImpacts.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Ticker impacts
              </p>
              <div className="flex flex-wrap gap-2">
                {story.tickerImpacts.map((ti) => (
                  <Badge key={ti.symbol} tone={effectTone(ti.effect)}>
                    #{ti.symbol} {effectLabel(ti.effect).toLowerCase()}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              {isMarket ? "Summary" : "AI summary"}
            </p>
            <p className="text-sm leading-7 text-slate-400">
              {story.globalSummary || story.aiSummary || ""}
            </p>
          </div>

          {/* Why it matters — personal only */}
          {!isMarket && story.whyItMatters && (
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Why it matters
              </p>
              <p className="text-sm leading-7 text-slate-400">
                {story.whyItMatters}
              </p>
            </div>
          )}

          {/* Connected holdings — personal only */}
          {!isMarket && (story.holdings ?? []).length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Connected holdings
              </p>
              <div className="flex flex-wrap gap-2">
                {(story.holdings ?? []).map((holding) => (
                  <Badge key={holding} tone="brand">
                    {holding}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {!isMarket && (story.matchReasonCodes ?? []).length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Match reasons
              </p>
              <div className="flex flex-wrap gap-2">
                {(story.matchReasonCodes ?? []).map((reason) => (
                  <Badge key={reason} tone="neutral">
                    {matchReasonLabel(reason)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Portfolio / watchlist matches — market only */}
          {isMarket &&
            (story.isPortfolioMatch || story.isWatchlistMatch) &&
            (story.matchedStockTags ?? []).length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {story.isPortfolioMatch && story.isWatchlistMatch
                    ? "Portfolio & watchlist matches"
                    : story.isWatchlistMatch
                      ? "Watchlist matches"
                      : "Portfolio matches"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(story.matchedStockTags ?? []).map((tag) => (
                    <Badge key={tag} tone="brand">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

          {story.url && (
            <a
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonStyles({ variant: "secondary" })}
            >
              Open full story
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          )}

          <div className="border-t border-white/[0.06] pt-5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setChatOpen((open) => !open)}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              {chatOpen ? "Hide story chat" : "Ask AI about this story"}
            </Button>
          </div>

          {chatOpen ? (
            <ArticleChatPanel
              portfolioId={portfolioId}
              newsItemId={story.newsItemId}
              headline={story.headline}
            />
          ) : null}
      </div>
    </Panel>
  );
}

function FeedEmptyState({
  mode,
  hasAnyData,
  onResetFilters,
  lastIngestHint,
}: {
  mode: FeedMode;
  hasAnyData: boolean;
  onResetFilters: () => void;
  lastIngestHint: LastIngestSnapshot | null;
}) {
  if (hasAnyData) {
    return (
      <Panel className="space-y-4 border-white/[0.06] bg-surface-raised p-8 text-center">
        <Badge tone="warning" className="mx-auto">
          No exact matches
        </Badge>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-white">
            {mode === "personal"
              ? "No stories match these filters"
              : "No market stories match these filters"}
          </h2>
          <p className="mx-auto max-w-xl text-sm leading-7 text-slate-400">
            Try broadening your filters to see more articles.
          </p>
        </div>
        <Button onClick={onResetFilters}>Reset filters</Button>
      </Panel>
    );
  }

  // No data at all — different guidance per mode
  if (mode === "personal") {
    const recent = isRecentIngestHint(lastIngestHint);
    const ingest = lastIngestHint?.ingest;
    const bd = lastIngestHint?.breakdown;
    const failedOrPartial =
      recent &&
      ingest &&
      (ingest.status === "failed" || ingest.status === "partial");

    const totalFetched =
      INGEST_SOURCE_KEYS.reduce((sum, key) => sum + (bd?.[key]?.fetched ?? 0), 0);
    const allDuplicates =
      recent && totalFetched > 0 && (bd?.total_inserted ?? 0) === 0;
    const presentSources = INGEST_SOURCE_KEYS.filter((key) => Boolean(bd?.[key]));
    const allEmptyWindow =
      recent &&
      presentSources.length > 0 &&
      presentSources.every((key) => bd?.[key]?.fetch_outcome === "empty_window");

    return (
      <Panel className="space-y-4 border-white/[0.06] bg-surface-raised p-8 text-center">
        <Badge tone="neutral" className="mx-auto">
          No feed yet
        </Badge>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-white">
            Your personal feed is empty
          </h2>
          <p className="mx-auto max-w-xl text-sm leading-7 text-slate-400">
            {recent
              ? "Nothing in the current 24-hour market pool qualified for your portfolio or watchlist. New articles are checked automatically every 20 minutes."
              : "Your feed updates automatically every 20 minutes. If your feed is empty, check back soon or add more holdings and watchlist items."}
          </p>
          {failedOrPartial && ingest?.detail ? (
            <p className="mx-auto max-w-xl text-sm leading-7 text-amber-400">
              Last refresh: <strong>{ingest.status}</strong> — {ingest.detail}
            </p>
          ) : null}
          {allDuplicates ? (
            <p
              data-testid="ingest-hint-duplicates"
              className="mx-auto max-w-xl text-sm leading-7 text-slate-400"
            >
              The last refresh fetched {totalFetched} article{totalFetched === 1 ? "" : "s"} but
              they were already in the database — nothing new to add.
            </p>
          ) : allEmptyWindow ? (
            <p
              data-testid="ingest-hint-empty-window"
              className="mx-auto max-w-xl text-sm leading-7 text-slate-400"
            >
              No articles were returned by EDGAR, NewsAPI, or GNews in the current lookback window.
              Broader market stories may still appear in <strong>Market</strong> mode.
            </p>
          ) : recent &&
            ingest?.status === "empty" &&
            (bd?.total_inserted ?? 0) === 0 ? (
            <p className="mx-auto max-w-xl text-sm leading-7 text-slate-400">
              Last run found no new articles in the global lookback window (sources succeeded).
              Broader market stories may still appear in <strong>Market</strong> mode.
            </p>
          ) : null}
        </div>
      </Panel>
    );
  }

  const recent = isRecentIngestHint(lastIngestHint);
  const ingest = lastIngestHint?.ingest;
  const sourceErrors = INGEST_SOURCE_KEYS
    .map((key) => {
      const fetchError = lastIngestHint?.breakdown?.[key]?.fetch_error;
      return fetchError ? `${INGEST_SOURCE_LABELS[key]}: ${fetchError}` : null;
    })
    .filter(Boolean) as string[];

  if (recent && ingest?.status === "failed") {
    return (
      <Panel className="space-y-4 border-white/[0.06] bg-surface-raised p-8 text-center">
        <Badge tone="warning" className="mx-auto">
          Ingestion failed
        </Badge>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-white">
            Market feed could not load new articles
          </h2>
          <p className="mx-auto max-w-xl text-sm leading-7 text-slate-400">
            {ingest.detail ?? "Both news sources failed or all database writes failed."}
          </p>
          {sourceErrors.length > 0 && (
            <ul className="mx-auto max-w-xl list-disc pl-5 text-left text-sm text-slate-400">
              {sourceErrors.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
          <p className="mx-auto max-w-xl text-sm leading-7 text-slate-400">
            Open <strong>Analysis</strong> for the full pipeline view, or see{" "}
            <code className="rounded bg-white/5 px-1">workers/news_ingestion/TROUBLESHOOTING.md</code>{" "}
            for Python worker setup and API key notes.
          </p>
        </div>
      </Panel>
    );
  }

  if (recent && ingest?.status === "partial") {
    return (
      <Panel className="space-y-4 border-white/[0.06] bg-surface-raised p-8 text-center">
        <Badge tone="warning" className="mx-auto">
          Partial ingest
        </Badge>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-white">
            Some market sources did not return articles
          </h2>
          <p className="mx-auto max-w-xl text-sm leading-7 text-slate-400">
            {ingest.detail}
          </p>
          {sourceErrors.length > 0 && (
            <ul className="mx-auto max-w-xl list-disc pl-5 text-left text-sm text-slate-400">
              {sourceErrors.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
        </div>
      </Panel>
    );
  }

  if (recent && ingest?.status === "empty") {
    const lb = lastIngestHint?.lookbackHours ?? 24;
    const bd = lastIngestHint?.breakdown;
    const totalFetched =
      INGEST_SOURCE_KEYS.reduce((sum, key) => sum + (bd?.[key]?.fetched ?? 0), 0);
    const allDuplicates = totalFetched > 0 && (bd?.total_inserted ?? 0) === 0;
    const presentSources = INGEST_SOURCE_KEYS.filter((key) => Boolean(bd?.[key]));
    const allEmptyWindow =
      presentSources.length > 0 &&
      presentSources.every((key) => bd?.[key]?.fetch_outcome === "empty_window");

    return (
      <Panel className="space-y-4 border-white/[0.06] bg-surface-raised p-8 text-center">
        <Badge tone="neutral" className="mx-auto">
          No articles in window
        </Badge>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-white">
            No market news in the last {lb} hour{lb === 1 ? "" : "s"}
          </h2>
          {allDuplicates ? (
            <p
              data-testid="ingest-hint-duplicates"
              className="mx-auto max-w-xl text-sm leading-7 text-slate-400"
            >
              The last refresh fetched {totalFetched} article{totalFetched === 1 ? "" : "s"} but
              they were already in the database.
            </p>
          ) : allEmptyWindow ? (
            <p
              data-testid="ingest-hint-empty-window"
              className="mx-auto max-w-xl text-sm leading-7 text-slate-400"
            >
              No articles were returned by EDGAR, NewsAPI, or GNews in the current lookback window.
            </p>
          ) : (
            <p className="mx-auto max-w-xl text-sm leading-7 text-slate-400">
              {ingest.detail ??
                "Sources completed without errors but returned nothing in the current lookback window."}
            </p>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="space-y-4 border-white/[0.06] bg-surface-raised p-8 text-center">
      <Badge tone="neutral" className="mx-auto">
        No articles
      </Badge>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-white">
          No market news ingested yet
        </h2>
        <p className="mx-auto max-w-xl text-sm leading-7 text-slate-400">
          Run a news refresh from the Analysis page to populate the market feed
          with SEC filings and market headlines. If the feed stays empty, check the Analysis
          pipeline for EDGAR, NewsAPI, or GNews errors (API key, firewall, or network issues).
        </p>
      </div>
    </Panel>
  );
}

function formatCategoryOption(option: string): string {
  if (option.startsWith("All")) return option;
  return categoryLabel(option);
}
