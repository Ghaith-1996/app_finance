import type { FeedMode, MatchSource, NewsItem } from "@/lib/types";

import { cn, effectLabel, impactTone } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { isMarketHeadlineSource } from "@/lib/services/news/source-config";

function matchSourceLabel(sources: MatchSource[]): string | null {
  const has = (s: MatchSource) => sources.includes(s);
  if (has("portfolio") && has("watchlist")) return "Portfolio + Watchlist";
  if (has("watchlist")) return "Watchlist";
  if (has("portfolio")) return "Portfolio";
  return null;
}

function formatFeedTimeAgo(minutes: number): string {
  if (minutes < 60) return `${minutes}M AGO`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}H AGO`;
  return `${Math.floor(minutes / 1440)}D AGO`;
}

function holdingChips(story: NewsItem, mode: FeedMode): string[] {
  if (mode === "personal") {
    const h = story.holdings ?? [];
    if (h.length > 0) return h.slice(0, 6);
    const m = story.matchedStockTags ?? [];
    if (m.length > 0) return m.slice(0, 6);
  }
  const matched = story.matchedStockTags ?? [];
  if (matched.length > 0) return matched.slice(0, 6);
  return story.stockTags.slice(0, 6);
}

export function NewsFeedCard({
  story,
  mode = "personal",
  selected = false,
  onOpen,
}: {
  story: NewsItem;
  mode?: FeedMode;
  selected?: boolean;
  onOpen?: () => void;
}) {
  const isMarket = mode === "market";
  const isHeadline =
    isMarketHeadlineSource(story.sourceType) && story.sourceType !== "edgar";
  const chips = holdingChips(story, mode);
  const meta = `${story.source.toUpperCase()} · ${formatFeedTimeAgo(story.publishedMinutesAgo)}`;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.();
        }
      }}
      className={cn(
        "rounded-2xl border border-white/[0.06] bg-surface-raised p-6 transition",
        "hover:border-white/10 hover:bg-surface-hover",
        selected && "ring-2 ring-brand/30 ring-offset-2 ring-offset-background",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {isMarket && isHeadline ? (
            <span className="rounded-lg bg-teal-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-400">
              Market headline
            </span>
          ) : null}
          {!isMarket && story.relevanceScore != null ? (
            <span className="rounded-lg bg-brand px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#080c11]">
              {story.relevanceScore}% match
            </span>
          ) : null}
          {!isMarket && story.impact ? (
            <Badge
              tone={impactTone(story.impact)}
              className="text-[11px] tracking-[0.12em]"
            >
              {story.impact} impact
            </Badge>
          ) : null}
          {isMarket && story.isPortfolioMatch ? (
            <span className="rounded-lg bg-brand/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
              In portfolio
            </span>
          ) : null}
          {isMarket && story.isWatchlistMatch && !story.isPortfolioMatch ? (
            <span className="rounded-lg bg-violet-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-400">
              Watchlist
            </span>
          ) : null}
          {isMarket && story.isPortfolioMatch && story.isWatchlistMatch ? (
            <span className="rounded-lg bg-violet-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-400">
              + Watchlist
            </span>
          ) : null}
          {!isMarket && (() => {
            const label = matchSourceLabel(story.matchSources ?? []);
            if (!label || label === "Portfolio") return null;
            return (
              <span className="rounded-lg bg-violet-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-400">
                {label}
              </span>
            );
          })()}
        </div>
        <p className="text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
          {meta}
        </p>
      </div>

      <h3 className="mt-4 text-xl font-semibold leading-snug tracking-tight text-white">
        {story.headline}
      </h3>

      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-400">
        {story.globalSummary || story.aiSummary || ""}
      </p>

      {chips.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
          <div className="flex -space-x-2">
            {chips.map((sym) => (
              <span
                key={sym}
                title={sym}
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface-raised bg-white/5 text-[10px] font-bold uppercase text-slate-400"
              >
                {sym.slice(0, 3)}
              </span>
            ))}
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            Affected holdings
          </span>
        </div>
      ) : null}

      {!isMarket && story.displayEffect !== "neutral" ? (
        <p className="mt-3 text-xs font-medium uppercase tracking-wider text-slate-600">
          Sentiment: {effectLabel(story.displayEffect)}
        </p>
      ) : null}
    </div>
  );
}
