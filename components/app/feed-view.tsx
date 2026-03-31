"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ArrowRight,
  ChevronDown,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

import {
  ArticleChatPanel,
  type ArticleChatActivityState,
} from "@/components/app/article-chat-panel";
import { NewsFeedCard } from "@/components/app/news-feed-card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  NEWS_CATEGORIES,
  type ArticleChatModelTier,
  type FeedMode,
  type NewsItem,
  type PortfolioInsight,
} from "@/lib/types";
import {
  INGEST_SOURCE_KEYS,
  INGEST_SOURCE_LABELS,
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
import type { FeedResponsePayload } from "@/lib/server/feed";
import { sanitizeExternalUrl } from "@/lib/security/external-url";

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

const DESKTOP_CHAT_BREAKPOINT = 1280;
const FEED_PAGE_SIZE = 50;
const DEFAULT_CHAT_ACTIVITY: ArticleChatActivityState = {
  hasMessages: false,
  hasDraft: false,
};
const REALTIME_REFRESH_DEBOUNCE_MS = 800;
type FeedChatContext = "story" | "general";

export function FeedView({
  portfolioId,
  insights = [],
  initialSymbol,
  initialTicker,
  initialFeedPayload,
  allowedModelTiers = ["free", "premium", "ultimate"],
  defaultModelTier = "free",
}: {
  portfolioId?: string | null;
  insights?: PortfolioInsight[];
  /** When set (e.g. from `/feed?symbol=AAPL`), pre-select that holding in personal mode if it appears in the feed. */
  initialSymbol?: string;
  /** When set (e.g. from `/feed?ticker=AAPL`), switch to market mode and filter by this ticker tag. */
  initialTicker?: string;
  initialFeedPayload?: FeedResponsePayload | null;
  allowedModelTiers?: ArticleChatModelTier[];
  defaultModelTier?: ArticleChatModelTier;
}) {
  const [mode, setMode] = useState<FeedMode>(() => initialTicker ? "market" : "personal");
  const [feed, setFeed] = useState<NewsItem[]>(() => initialFeedPayload?.feed ?? []);
  const [isInitialLoading, setIsInitialLoading] = useState(() => !initialFeedPayload);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);

  const [portfolioSymbols, setPortfolioSymbols] = useState<string[]>(
    () => initialFeedPayload?.portfolioSymbols ?? [],
  );
  const [portfolioSectors, setPortfolioSectors] = useState<string[]>(
    () => initialFeedPayload?.portfolioSectors ?? [],
  );

  // Personal-mode filters
  const [selectedHolding, setSelectedHolding] = useState("All holdings");
  const [selectedSector, setSelectedSector] = useState("All sectors");

  // Market-mode filters
  const [selectedSourceType, setSelectedSourceType] = useState(
    sourceTypeOptions[0].label,
  );
  const [tickerInput, setTickerInput] = useState(() => initialTicker?.trim().toUpperCase() ?? "");
  const [appliedTickerQuery, setAppliedTickerQuery] = useState(() => initialTicker?.trim().toUpperCase() ?? "");

  // Shared filters
  const [selectedCategory, setSelectedCategory] = useState("All categories");
  const [selectedRecency, setSelectedRecency] = useState(recencyOptions[0].label);
  const [page, setPage] = useState(() => initialFeedPayload?.page ?? 1);
  const [totalCount, setTotalCount] = useState(
    () => initialFeedPayload?.totalCount ?? 0,
  );
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [lastIngestHint, setLastIngestHint] = useState<LastIngestSnapshot | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<FeedChatContext>("story");
  const [chatActivity, setChatActivity] = useState<ArticleChatActivityState>(
    DEFAULT_CHAT_ACTIVITY,
  );
  const [selectedChatTier, setSelectedChatTier] = useState<ArticleChatModelTier>(
    defaultModelTier,
  );
  const [pendingStoryId, setPendingStoryId] = useState<string | null>(null);
  const [switchConfirmOpen, setSwitchConfirmOpen] = useState(false);
  const [isDesktopChatLayout, setIsDesktopChatLayout] = useState(
    () =>
      typeof window === "undefined"
        ? true
        : window.innerWidth >= DESKTOP_CHAT_BREAKPOINT,
  );

  const loadingRef = useRef(false);
  const queuedSilentRefreshRef = useRef(false);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedFeedRef = useRef(Boolean(initialFeedPayload));
  const initialFetchHandledRef = useRef(false);
  const initialSymbolAppliedRef = useRef(false);

  useEffect(() => {
    setLastIngestHint(readLastIngestSnapshot());
  }, [feed]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const updateLayoutMode = () => {
      setIsDesktopChatLayout(window.innerWidth >= DESKTOP_CHAT_BREAKPOINT);
    };

    updateLayoutMode();
    window.addEventListener("resize", updateLayoutMode);
    return () => window.removeEventListener("resize", updateLayoutMode);
  }, []);

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
    if (!allowedModelTiers.includes(selectedChatTier)) {
      setSelectedChatTier(defaultModelTier);
    }
  }, [allowedModelTiers, defaultModelTier, selectedChatTier]);

  useEffect(() => {
    setPage(1);
  }, [
    mode,
    selectedHolding,
    selectedSector,
    selectedCategory,
    selectedRecency,
    selectedSourceType,
    appliedTickerQuery,
  ]);

  const fetchFeed = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (loadingRef.current) {
        if (silent && hasLoadedFeedRef.current) {
          queuedSilentRefreshRef.current = true;
        }
        return;
      }

      loadingRef.current = true;
      const showInlineRefresh = silent || hasLoadedFeedRef.current;
      if (showInlineRefresh) {
        setIsRefreshing(true);
      } else {
        setIsInitialLoading(true);
      }
      if (!silent) {
        setError(null);
      }
      setBackgroundError(null);

      try {
        const recencyMax =
          recencyOptions.find((option) => option.label === selectedRecency)
            ?.maxMinutes ?? FEED_HARD_CAP_MINUTES;
        const params = new URLSearchParams();
        params.set("mode", mode);
        if (portfolioId) params.set("portfolioId", portfolioId);
        params.set("maxMinutes", String(recencyMax));
        params.set("page", String(page));
        params.set("pageSize", String(FEED_PAGE_SIZE));
        if (mode === "personal") {
          if (selectedHolding !== "All holdings") {
            params.set("holding", selectedHolding);
          }
          if (selectedSector !== "All sectors") {
            params.set("sector", selectedSector);
          }
          if (selectedCategory !== "All categories") {
            params.set("category", selectedCategory);
          }
        }
        if (mode === "market") {
          if (selectedCategory !== "All categories") {
            params.set("category", selectedCategory);
          }
          const sourceValue =
            sourceTypeOptions.find((option) => option.label === selectedSourceType)?.value ?? "";
          if (sourceValue) {
            params.set("sourceType", sourceValue);
          }
          if (appliedTickerQuery.trim()) {
            params.set("ticker", appliedTickerQuery.trim().toUpperCase());
          }
        }
        const res = await fetch(`/api/feed?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const message = data.error ?? "Failed to load feed";
          if (silent && hasLoadedFeedRef.current) {
            setBackgroundError(message);
            return;
          }
          setError(message);
          setFeed([]);
          setTotalCount(0);
          hasLoadedFeedRef.current = false;
          return;
        }
        const newFeed: NewsItem[] = data.feed ?? [];
        setFeed(newFeed);
        setTotalCount(
          typeof data.totalCount === "number" ? data.totalCount : newFeed.length,
        );
        if (typeof data.page === "number") {
          setPage(data.page);
        }
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
        setError(null);
        setBackgroundError(null);
        hasLoadedFeedRef.current = true;
      } catch (fetchError) {
        const message =
          fetchError instanceof Error ? fetchError.message : "Failed to load feed";
        if (silent && hasLoadedFeedRef.current) {
          setBackgroundError(message);
          return;
        }
        setError(message);
        setFeed([]);
        setTotalCount(0);
        hasLoadedFeedRef.current = false;
      } finally {
        if (showInlineRefresh) {
          setIsRefreshing(false);
        } else {
          setIsInitialLoading(false);
        }
        loadingRef.current = false;
        if (queuedSilentRefreshRef.current) {
          queuedSilentRefreshRef.current = false;
          void fetchFeed({ silent: true });
        }
      }
    },
    [
      mode,
      page,
      portfolioId,
      appliedTickerQuery,
      selectedCategory,
      selectedHolding,
      selectedRecency,
      selectedSector,
      selectedSourceType,
    ],
  );

  useEffect(() => {
    const shouldUseInitialPayload =
      !initialFetchHandledRef.current &&
      Boolean(initialFeedPayload) &&
      mode === "personal" &&
      page === (initialFeedPayload?.page ?? 1) &&
      selectedHolding === "All holdings" &&
      selectedSector === "All sectors" &&
      selectedCategory === "All categories" &&
      selectedRecency === recencyOptions[0].label &&
      selectedSourceType === sourceTypeOptions[0].label &&
      appliedTickerQuery.trim().length === 0;

    if (shouldUseInitialPayload) {
      initialFetchHandledRef.current = true;
      hasLoadedFeedRef.current = true;
      setIsInitialLoading(false);
      return;
    }

    initialFetchHandledRef.current = true;
    void fetchFeed();
  }, [
    appliedTickerQuery,
    fetchFeed,
    initialFeedPayload,
    mode,
    page,
    selectedCategory,
    selectedHolding,
    selectedRecency,
    selectedSector,
    selectedSourceType,
  ]);

  const scheduleSilentRefresh = useCallback(() => {
    if (realtimeRefreshTimerRef.current) return;
    realtimeRefreshTimerRef.current = setTimeout(() => {
      realtimeRefreshTimerRef.current = null;
      void fetchFeed({ silent: true });
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }, [fetchFeed]);

  useEffect(() => {
    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
    };
  }, []);

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
          scheduleSilentRefresh();
        },
      )
      .subscribe();
    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [portfolioId, mode, scheduleSilentRefresh]);

  function handleModeChange(newMode: FeedMode) {
    setMode(newMode);
    setSelectedHolding("All holdings");
    setSelectedSector("All sectors");
    setSelectedSourceType(sourceTypeOptions[0].label);
    setTickerInput("");
    setAppliedTickerQuery("");
    setSelectedCategory("All categories");
    setSelectedRecency(recencyOptions[0].label);
    setPage(1);
    setTotalCount(0);
    setSelectedStoryId(null);
    resetChatSurface();
  }

  const scrollToTopAfterPageChange = useCallback(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handlePageChange = useCallback(
    (updater: (currentPage: number) => number) => {
      setPage((currentPage) => updater(currentPage));
      scrollToTopAfterPageChange();
    },
    [scrollToTopAfterPageChange],
  );

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
    () =>
      mode === "market"
        ? ["All categories", ...NEWS_CATEGORIES]
        : ["All categories", ...new Set(feed.map((s) => s.category).filter(Boolean))],
    [feed, mode],
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

      return matchesCategory && matchesRecency;
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
  const totalPages = Math.max(1, Math.ceil(totalCount / FEED_PAGE_SIZE));
  const visibleStories = filteredStories;
  const hasActiveMarketFilters =
    mode === "market" &&
    (selectedSourceType !== sourceTypeOptions[0].label ||
      selectedCategory !== "All categories" ||
      selectedRecency !== recencyOptions[0].label ||
      appliedTickerQuery.trim().length > 0);

  const selectedStory = selectedStoryId
    ? visibleStories.find((s) => s.id === selectedStoryId) ??
      visibleStories[0] ??
      null
    : null;
  const chatHasActivity = chatActivity.hasMessages || chatActivity.hasDraft;
  const chatStory = chatContext === "story" ? selectedStory : null;
  const isStoryChatOpen = Boolean(chatOpen && chatStory);
  const showDesktopChat = Boolean(chatOpen && isDesktopChatLayout);
  const showMobileChat = Boolean(chatOpen && !isDesktopChatLayout);

  const resetChatSurface = useCallback(() => {
    setChatOpen(false);
    setChatContext("story");
    setChatActivity(DEFAULT_CHAT_ACTIVITY);
    setPendingStoryId(null);
    setSwitchConfirmOpen(false);
  }, []);

  useEffect(() => {
    if (chatContext !== "story" || !chatOpen || selectedStory) return;
    resetChatSurface();
  }, [chatContext, chatOpen, resetChatSurface, selectedStory]);

  useEffect(() => {
    if (!showMobileChat || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showMobileChat]);

  const handleChatActivityChange = useCallback(
    (next: ArticleChatActivityState) => {
      setChatActivity(next);
    },
    [],
  );

  const handleStoryOpen = useCallback(
    (storyId: string) => {
      if (storyId === selectedStoryId) return;

      if (chatOpen && chatContext === "story" && chatHasActivity) {
        setPendingStoryId(storyId);
        setSwitchConfirmOpen(true);
        return;
      }

      setSelectedStoryId(storyId);
    },
    [chatContext, chatHasActivity, chatOpen, selectedStoryId],
  );

  const handleCloseStory = useCallback(() => {
    setSelectedStoryId(null);
    setPendingStoryId(null);
    setSwitchConfirmOpen(false);
    if (chatContext === "story") {
      resetChatSurface();
    }
  }, [chatContext, resetChatSurface]);

  const handleGlobalAskAiClick = useCallback(() => {
    const nextContext: FeedChatContext = selectedStory ? "story" : "general";

    if (chatOpen && chatContext === nextContext) {
      resetChatSurface();
      return;
    }

    setChatContext(nextContext);
    setChatOpen(true);
    setChatActivity(DEFAULT_CHAT_ACTIVITY);
    setPendingStoryId(null);
    setSwitchConfirmOpen(false);
  }, [chatContext, chatOpen, resetChatSurface, selectedStory]);

  const handleToggleChat = useCallback(() => {
    handleGlobalAskAiClick();
  }, [handleGlobalAskAiClick]);

  const handleCancelStorySwitch = useCallback(() => {
    setPendingStoryId(null);
    setSwitchConfirmOpen(false);
  }, []);

  const handleConfirmStorySwitch = useCallback(() => {
    if (!pendingStoryId) return;
    setSelectedStoryId(pendingStoryId);
    setPendingStoryId(null);
    setSwitchConfirmOpen(false);
  }, [pendingStoryId]);

  function resetFilters() {
    setSelectedHolding("All holdings");
    setSelectedSector("All sectors");
    setSelectedSourceType(sourceTypeOptions[0].label);
    setTickerInput("");
    setAppliedTickerQuery("");
    setSelectedCategory("All categories");
    setSelectedRecency(recencyOptions[0].label);
    setPage(1);
    setTotalCount(0);
    setSelectedStoryId(null);
    resetChatSurface();
  }

  // --- Render ---

  if (error) {
    return (
      <Panel className="space-y-4 border-white/[0.06] bg-surface-raised p-8 text-center">
        <Badge tone="warning" className="mx-auto">
          Error
        </Badge>
        <p className="text-slate-400">{error}</p>
        <Button onClick={() => void fetchFeed()}>Retry</Button>
      </Panel>
    );
  }

  if (isInitialLoading) {
    return (
      <Panel className="space-y-4 border-white/[0.06] bg-surface-raised p-8 text-center">
        <p className="text-slate-400">Loading feed…</p>
      </Panel>
    );
  }

  return (
    <>
      <div
        className={cn(
          "grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]",
        )}
      >
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
              <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:max-w-4xl lg:grid-cols-4 lg:justify-self-end">
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
                <label className="block min-w-0 space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Ticker
                  </span>
                  <input
                    className="w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2.5 text-sm text-slate-200 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    placeholder="e.g. NVDA"
                    value={tickerInput}
                    onChange={(e) => setTickerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const normalizedTicker = tickerInput.trim().toUpperCase();
                        setTickerInput(normalizedTicker);
                        setAppliedTickerQuery(normalizedTicker);
                        setPage(1);
                      }
                    }}
                  />
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
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-[1.25rem] text-xs font-medium text-slate-400" aria-live="polite">
              {isRefreshing ? "Updating..." : backgroundError ? `Update paused: ${backgroundError}` : null}
            </div>
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

        {visibleStories.length === 0 ? (
          <FeedEmptyState
            mode={mode}
            hasAnyData={mode === "market" ? hasActiveMarketFilters : feed.length > 0}
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
                  onOpen={() => handleStoryOpen(story.id)}
                />
              ))}
            </div>
            {totalPages > 1 ? (
              <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
                <span>
                  Page {page} of {totalPages} · Showing {feed.length} of {totalCount} articles
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() =>
                      handlePageChange((currentPage) =>
                        Math.max(1, currentPage - 1),
                      )
                    }
                    className={cn(
                      buttonStyles({ variant: "ghost", className: "h-9 px-3" }),
                      "disabled:opacity-40",
                    )}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() =>
                      handlePageChange((currentPage) =>
                        Math.min(totalPages, currentPage + 1),
                      )
                    }
                    className={cn(
                      buttonStyles({ variant: "ghost", className: "h-9 px-3" }),
                      "disabled:opacity-40",
                    )}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5 xl:sticky xl:top-28 xl:self-start xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto">
        <FeedMomentumCard insights={insights} />
        <GlobalAskAiButton
          hasSelectedStory={Boolean(selectedStory)}
          isOpen={chatOpen}
          onClick={handleGlobalAskAiClick}
        />
        {showDesktopChat ? (
          <StoryChatSidebar
            context={chatContext}
            story={chatStory}
            portfolioId={portfolioId}
            allowedTiers={allowedModelTiers}
            selectedTier={selectedChatTier}
            onSelectedTierChange={setSelectedChatTier}
            onClose={resetChatSurface}
            onActivityChange={handleChatActivityChange}
          />
        ) : selectedStory && !chatOpen ? (
          <DetailPanel
            story={selectedStory}
            mode={mode}
            isChatOpen={isStoryChatOpen}
            onToggleChat={handleToggleChat}
            onClose={handleCloseStory}
          />
        ) : null}
      </div>
      </div>


      {showMobileChat ? (
        <StoryChatMobileSheet
          context={chatContext}
          story={chatStory}
          portfolioId={portfolioId}
          allowedTiers={allowedModelTiers}
          selectedTier={selectedChatTier}
          onSelectedTierChange={setSelectedChatTier}
          onClose={resetChatSurface}
          onActivityChange={handleChatActivityChange}
        />
      ) : null}

      {switchConfirmOpen && pendingStoryId ? (
        <StorySwitchConfirmDialog
          onCancel={handleCancelStorySwitch}
          onConfirm={handleConfirmStorySwitch}
        />
      ) : null}
    </>
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

function StoryChatHeader({
  context,
  story,
  onClose,
}: {
  context: FeedChatContext;
  story: NewsItem | null;
  onClose: () => void;
}) {
  const isStoryContext = context === "story" && story;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">
          {isStoryContext ? "Story chat" : "Portfolio / market chat"}
        </p>
        <h2 className="text-lg font-semibold leading-snug tracking-tight text-white">
          {isStoryContext ? story.headline : "No active article"}
        </h2>
        <p className="text-sm leading-6 text-slate-400">
          {isStoryContext
            ? "Ask follow-up questions about the selected story without leaving the feed."
            : "Ask about your portfolio, watchlist, or today's market, then select a story any time to switch into article context."}
        </p>
      </div>
      <button
        type="button"
        aria-label="Close Ask AI chat"
        className="shrink-0 rounded-full border border-white/10 bg-white/5 p-2 text-slate-500 transition hover:bg-white/10 hover:text-slate-300"
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function StoryChatSidebar({
  context,
  story,
  portfolioId,
  allowedTiers,
  selectedTier,
  onSelectedTierChange,
  onClose,
  onActivityChange,
}: {
  context: FeedChatContext;
  story: NewsItem | null;
  portfolioId?: string | null;
  allowedTiers: ArticleChatModelTier[];
  selectedTier: ArticleChatModelTier;
  onSelectedTierChange: (tier: ArticleChatModelTier) => void;
  onClose: () => void;
  onActivityChange: (state: ArticleChatActivityState) => void;
}) {
  const isStoryContext = context === "story" && story;

  return (
    <Panel
      data-testid="story-chat-sidebar"
      className="h-fit space-y-5 rounded-2xl border-white/[0.06] bg-surface-raised p-6 shadow-sm"
    >
      <StoryChatHeader context={context} story={story} onClose={onClose} />
      <ArticleChatPanel
        portfolioId={portfolioId}
        newsItemId={isStoryContext ? story.newsItemId : undefined}
        headline={isStoryContext ? story.headline : "No active article"}
        contextMode={isStoryContext ? "story" : "general"}
        allowedTiers={allowedTiers}
        selectedTier={selectedTier}
        onSelectedTierChange={onSelectedTierChange}
        onActivityChange={onActivityChange}
        showHeader={false}
        className="border-0 bg-transparent p-0"
      />
    </Panel>
  );
}

function StoryChatMobileSheet({
  context,
  story,
  portfolioId,
  allowedTiers,
  selectedTier,
  onSelectedTierChange,
  onClose,
  onActivityChange,
}: {
  context: FeedChatContext;
  story: NewsItem | null;
  portfolioId?: string | null;
  allowedTiers: ArticleChatModelTier[];
  selectedTier: ArticleChatModelTier;
  onSelectedTierChange: (tier: ArticleChatModelTier) => void;
  onClose: () => void;
  onActivityChange: (state: ArticleChatActivityState) => void;
}) {
  const isStoryContext = context === "story" && story;

  return (
    <div
      data-testid="story-chat-sheet"
      className="fixed inset-0 z-50 xl:hidden"
    >
      <button
        type="button"
        aria-label="Close Ask AI chat"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ask AI chat"
        className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-background shadow-2xl"
      >
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5 shadow-sm">
            <StoryChatHeader context={context} story={story} onClose={onClose} />
            <div className="mt-5">
              <ArticleChatPanel
                portfolioId={portfolioId}
                newsItemId={isStoryContext ? story.newsItemId : undefined}
                headline={isStoryContext ? story.headline : "No active article"}
                contextMode={isStoryContext ? "story" : "general"}
                allowedTiers={allowedTiers}
                selectedTier={selectedTier}
                onSelectedTierChange={onSelectedTierChange}
                onActivityChange={onActivityChange}
                showHeader={false}
                className="border-0 bg-transparent p-0"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GlobalAskAiButton({
  hasSelectedStory,
  isOpen,
  onClick,
}: {
  hasSelectedStory: boolean;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <Panel className="border-white/[0.06] bg-surface-raised p-4 shadow-sm">
      <button
        type="button"
        data-testid="global-ask-ai-button"
        aria-label="Open Ask AI chat"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand/25 bg-brand/10 px-4 py-4 text-left text-white transition hover:border-brand/40 hover:bg-brand/15"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-[#080c11] shadow-[0_0_20px_rgba(16,185,129,0.2)]">
            <MessageSquare className="h-4 w-4" />
          </span>
          <span className="space-y-1">
            <span className="block text-sm font-semibold uppercase tracking-[0.18em] text-brand">
              Ask AI
            </span>
            <span className="block text-sm text-slate-300">
              {hasSelectedStory ? "Use the selected story as context." : "Open a portfolio or market-wide conversation."}
            </span>
          </span>
        </span>
        <span className="text-sm font-semibold text-white/90">
          {isOpen ? "Close" : hasSelectedStory ? "Selected story" : "No article selected"}
        </span>
      </button>
    </Panel>
  );
}

function StorySwitchConfirmDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss story switch confirmation"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Switch story chat"
        className="relative w-full max-w-md rounded-3xl border border-white/[0.08] bg-surface-raised p-6 shadow-2xl"
      >
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">
            Switch story?
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-white">
            Keep this chat or switch to the new article
          </h2>
          <p className="text-sm leading-7 text-slate-400">
            The current story chat has messages or an unsent draft. Switching will replace the active story context in the chat panel.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Stay here
          </Button>
          <Button type="button" onClick={onConfirm}>
            Switch story
          </Button>
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
  isChatOpen,
  onToggleChat,
  onClose,
}: {
  story: NewsItem;
  mode: FeedMode;
  isChatOpen: boolean;
  onToggleChat: () => void;
  onClose: () => void;
}) {
  const isMarket = mode === "market";
  const safeStoryUrl = sanitizeExternalUrl(story.url);

  return (
    <Panel className="h-fit space-y-5 rounded-2xl border-white/[0.06] bg-surface-raised p-6 shadow-sm">
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

          <div className="border-t border-white/[0.06] pt-5">
            <Button
              type="button"
              variant="secondary"
              onClick={onToggleChat}
            >
              <MessageSquare className="mr-2 h-4 w-4" />
              {isChatOpen ? "Hide Ask AI" : "Ask AI about this story"}
            </Button>
          </div>

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

          {safeStoryUrl && (
            <a
              href={safeStoryUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonStyles({ variant: "secondary" })}
            >
              Open full story
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          )}
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
              No articles were returned by EDGAR, NewsAPI, GNews, NewsAPI.ai, or NewsCatcher in the current lookback window.
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
              No articles were returned by EDGAR, NewsAPI, GNews, NewsAPI.ai, or NewsCatcher in the current lookback window.
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
          pipeline for EDGAR, NewsAPI, GNews, NewsAPI.ai, or NewsCatcher errors (API key, firewall, or network issues).
        </p>
      </div>
    </Panel>
  );
}

function formatCategoryOption(option: string): string {
  if (option.startsWith("All")) return option;
  return categoryLabel(option);
}
