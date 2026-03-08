"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ArrowRight, RefreshCw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

import { NewsFeedCard } from "@/components/app/news-feed-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { NewsItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const recencyOptions = [
  { label: "Any time", maxMinutes: Number.POSITIVE_INFINITY },
  { label: "Past hour", maxMinutes: 60 },
  { label: "Past 2 hours", maxMinutes: 120 },
];

export function FeedView({ portfolioId }: { portfolioId?: string | null }) {
  const [feed, setFeed] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedHolding, setSelectedHolding] = useState("All holdings");
  const [selectedSector, setSelectedSector] = useState("All sectors");
  const [selectedRecency, setSelectedRecency] = useState(recencyOptions[0].label);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (portfolioId) params.set("portfolioId", portfolioId);
    const res = await fetch(`/api/feed?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to load feed");
      setFeed([]);
      return;
    }
    setFeed(data.feed ?? []);
    if (data.feed?.length && !selectedStoryId) {
      setSelectedStoryId(data.feed[0].id);
    }
  }, [portfolioId]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  useEffect(() => {
    if (!portfolioId) return;
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
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [portfolioId, fetchFeed]);

  const holdingOptions = useMemo(
    () => ["All holdings", ...new Set(feed.flatMap((s) => s.holdings))],
    [feed]
  );
  const sectorOptions = useMemo(
    () => ["All sectors", ...new Set(feed.flatMap((s) => s.sectors))],
    [feed]
  );

  const filteredStories = useMemo(() => {
    const recency = recencyOptions.find((option) => option.label === selectedRecency);
    return feed.filter((story) => {
      const matchesHolding =
        selectedHolding === "All holdings" || story.holdings.includes(selectedHolding);
      const matchesSector =
        selectedSector === "All sectors" || story.sectors.includes(selectedSector);
      const matchesRecency = !recency || story.publishedMinutesAgo <= recency.maxMinutes;
      return matchesHolding && matchesSector && matchesRecency;
    });
  }, [feed, selectedHolding, selectedSector, selectedRecency]);

  const selectedStory = selectedStoryId
    ? filteredStories.find((s) => s.id === selectedStoryId) ??
      filteredStories[0] ??
      null
    : null;

  function resetFilters() {
    setSelectedHolding("All holdings");
    setSelectedSector("All sectors");
    setSelectedRecency(recencyOptions[0].label);
    setSelectedStoryId(feed[0]?.id ?? null);
  }

  if (error) {
    return (
      <Panel className="space-y-4 border-black/6 bg-white/82 p-8 text-center">
        <Badge tone="warning" className="mx-auto">
          Error
        </Badge>
        <p className="text-slate-600">{error}</p>
        <Button onClick={fetchFeed}>Retry</Button>
      </Panel>
    );
  }

  if (loading) {
    return (
      <Panel className="space-y-4 border-black/6 bg-white/82 p-8 text-center">
        <p className="text-slate-600">Loading feed…</p>
      </Panel>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Panel className="space-y-5 border-black/6 bg-white/82">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
                Feed controls
              </p>
              <p className="text-sm leading-7 text-slate-600">
                Filter by holding, sector, or recency to simulate a personalized
                investor workflow.
              </p>
            </div>
            <Button variant="secondary" onClick={resetFilters}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reset filters
            </Button>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <FilterGroup
              label="Holdings"
              options={holdingOptions}
              value={selectedHolding}
              onChange={setSelectedHolding}
            />
            <FilterGroup
              label="Sectors"
              options={sectorOptions}
              value={selectedSector}
              onChange={setSelectedSector}
            />
            <FilterGroup
              label="Recency"
              options={recencyOptions.map((option) => option.label)}
              value={selectedRecency}
              onChange={setSelectedRecency}
            />
          </div>
        </Panel>

        {filteredStories.length === 0 ? (
          <Panel className="space-y-4 border-black/6 bg-white/82 p-8 text-center">
            <Badge tone="warning" className="mx-auto">
              No exact matches
            </Badge>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-slate-950">
                This filter set is empty
              </h2>
              <p className="mx-auto max-w-xl text-sm leading-7 text-slate-600">
                In the real product this is where a fallback general-news stream or
                a broader recommendation prompt would appear.
              </p>
            </div>
            <Button onClick={resetFilters}>Show full feed</Button>
          </Panel>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {filteredStories.map((story) => (
              <NewsFeedCard
                key={story.id}
                story={story}
                onOpen={() => setSelectedStoryId(story.id)}
              />
            ))}
          </div>
        )}
      </div>

      <Panel className="h-fit space-y-5 border-black/6 bg-white/86 p-6 xl:sticky xl:top-28">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
              Article detail
            </p>
            <h2 className="text-2xl font-semibold text-slate-950">
              {selectedStory ? selectedStory.headline : "Pick a story"}
            </h2>
          </div>
          {selectedStory ? (
            <button
              type="button"
              className="rounded-full border border-black/8 bg-[#f7f2ea] p-2 text-slate-500 transition hover:bg-white hover:text-slate-950"
              onClick={() => setSelectedStoryId(null)}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {selectedStory ? (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">{selectedStory.relevanceScore}% match</Badge>
              <Badge tone="neutral">{selectedStory.source}</Badge>
              <Badge tone="warning">{selectedStory.publishedAt}</Badge>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                AI summary
              </p>
              <p className="text-sm leading-7 text-slate-600">
                {selectedStory.aiSummary}
              </p>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Why it matters
              </p>
              <p className="text-sm leading-7 text-slate-600">
                {selectedStory.whyItMatters}
              </p>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Connected holdings
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedStory.holdings.map((holding) => (
                  <Badge key={holding} tone="brand">
                    {holding}
                  </Badge>
                ))}
              </div>
            </div>
            <Button variant="secondary">
              Open full story
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Badge tone="neutral">Select a card</Badge>
            <p className="text-sm leading-7 text-slate-600">
              The side panel is designed for a fast read: source, relevance,
              summary, and the reason the story is rising in the feed.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-950">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "rounded-full border px-3 py-2 text-sm transition",
              option === value
                ? "border-brand/28 bg-brand/12 text-emerald-700"
                : "border-black/8 bg-[#f7f2ea] text-slate-700 hover:border-black/12 hover:bg-white hover:text-slate-950",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
