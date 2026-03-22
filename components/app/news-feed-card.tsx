import type { FeedMode, NewsItem } from "@/lib/types";

import { cn, effectLabel, impactTone } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { isMarketHeadlineSource } from "@/lib/services/news/source-config";

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
        "rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm transition",
        "hover:border-black/10 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]",
        selected && "ring-2 ring-[#17b67a]/35 ring-offset-2 ring-offset-[#f0f1f4]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {isMarket && isHeadline ? (
            <span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-800">
              Market headline
            </span>
          ) : null}
          {!isMarket && story.relevanceScore != null ? (
            <span className="rounded-full bg-[#17b67a] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white">
              {story.relevanceScore}% match
            </span>
          ) : null}
          {!isMarket && story.impact ? (
            <Badge
              tone={impactTone(story.impact)}
              className="border-slate-200/80 bg-slate-100 text-[11px] tracking-[0.12em] text-slate-700"
            >
              {story.impact} impact
            </Badge>
          ) : null}
          {isMarket && story.isPortfolioMatch ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-800">
              In portfolio
            </span>
          ) : null}
        </div>
        <p className="text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {meta}
        </p>
      </div>

      <h3 className="mt-4 text-xl font-semibold leading-snug tracking-tight text-slate-950">
        {story.headline}
      </h3>

      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-600">
        {story.globalSummary || story.aiSummary || ""}
      </p>

      {chips.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-black/[0.06] pt-4">
          <div className="flex -space-x-2">
            {chips.map((sym) => (
              <span
                key={sym}
                title={sym}
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-bold uppercase text-slate-700 shadow-sm"
              >
                {sym.slice(0, 3)}
              </span>
            ))}
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Affected holdings
          </span>
        </div>
      ) : null}

      {!isMarket && story.displayEffect !== "neutral" ? (
        <p className="mt-3 text-xs font-medium uppercase tracking-wider text-slate-400">
          Sentiment: {effectLabel(story.displayEffect)}
        </p>
      ) : null}
    </div>
  );
}
