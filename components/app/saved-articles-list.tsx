"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bookmark, ExternalLink, Newspaper, Search, Trash2 } from "lucide-react";

import { setSavedArticleState } from "@/lib/actions/saved-articles";
import type { SavedArticleItem } from "@/lib/server/saved-articles";
import { Badge } from "@/components/ui/badge";
import { cn, effectLabel, effectTone, categoryLabel } from "@/lib/utils";

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Saved";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function SavedArticlesList({
  initialArticles,
}: {
  initialArticles: SavedArticleItem[];
}) {
  const [articles, setArticles] = useState(initialArticles);
  const [query, setQuery] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const filteredArticles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return articles;
    return articles.filter((article) => {
      const haystack = [
        article.headline,
        article.source,
        article.category,
        article.stockTags.join(" "),
        article.summary,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [articles, query]);

  async function removeSaved(article: SavedArticleItem) {
    setRemovingId(article.newsItemId);
    const result = await setSavedArticleState(article.newsItemId, false);
    setRemovingId(null);
    if (result.ok) {
      setArticles((current) =>
        current.filter((item) => item.newsItemId !== article.newsItemId),
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-4">
        <label className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved articles, tickers, sources..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
          />
        </label>
      </div>

      {filteredArticles.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredArticles.map((article) => (
            <article
              key={article.id}
              className="rounded-2xl border border-white/[0.06] bg-surface-raised p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="neutral">{categoryLabel(article.category)}</Badge>
                    <Badge tone={effectTone(article.effect)}>
                      {effectLabel(article.effect)}
                    </Badge>
                    <span className="inline-flex items-center rounded-lg bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {formatSavedAt(article.savedAt)}
                    </span>
                  </div>
                  <h2 className="mt-4 text-lg font-bold leading-snug tracking-tight text-white">
                    {article.headline}
                  </h2>
                  <p className="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-600">
                    {article.source}
                  </p>
                </div>
                <Bookmark className="h-5 w-5 shrink-0 text-brand" />
              </div>

              {article.summary ? (
                <p className="mt-4 line-clamp-3 text-sm leading-7 text-slate-400">
                  {article.summary}
                </p>
              ) : null}

              {article.stockTags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {article.stockTags.slice(0, 8).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold uppercase text-slate-400"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                <Link
                  href={`/feed?story=${encodeURIComponent(article.newsItemId)}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-[#080c11] transition hover:bg-brand-strong"
                >
                  <Newspaper className="h-4 w-4" />
                  Open in feed
                </Link>
                {article.url ? (
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/10"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Source
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => void removeSaved(article)}
                  disabled={removingId === article.newsItemId}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-300 transition hover:bg-white/10",
                    removingId === article.newsItemId && "opacity-60",
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 bg-surface-raised/60 p-10 text-center">
          <Bookmark className="mx-auto h-8 w-8 text-slate-500" />
          <h2 className="mt-4 text-xl font-bold text-white">
            {articles.length === 0 ? "No saved articles yet" : "No saved article matches"}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500">
            Save stories from the feed detail panel to build a reading list you can
            revisit after the market close.
          </p>
        </div>
      )}
    </div>
  );
}
