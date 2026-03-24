"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  BookmarkPlus,
  Loader2,
  Newspaper,
  RefreshCw,
} from "lucide-react";

import { getHomeFeed, getTrendingTickers, getActiveDiscussions } from "@/lib/actions/community";
import type { CommunityPost, TrendingTicker, ActiveDiscussion } from "@/lib/community/types";
import { PostComposer } from "@/components/app/post-composer";
import { CommunityPostCard } from "@/components/app/community-post-card";
import { PostCommentsPanel } from "@/components/app/post-comments-panel";
import { TrendingTickersCard } from "@/components/app/trending-tickers-card";
import { ActiveDiscussionsCard } from "@/components/app/active-discussions-card";
import { cn } from "@/lib/utils";

export function HomeFeedClient() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [trending, setTrending] = useState<TrendingTicker[]>([]);
  const [discussions, setDiscussions] = useState<ActiveDiscussion[]>([]);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  const loadFeed = useCallback(async () => {
    setLoading(true);
    const result = await getHomeFeed();
    setPosts(result.posts);
    setNextCursor(result.nextCursor);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFeed();
    getTrendingTickers().then(setTrending);
    getActiveDiscussions().then(setDiscussions);
  }, [loadFeed]);

  function handlePostCreated(post: CommunityPost) {
    setPosts((prev) => [post, ...prev]);
  }

  function handleLoadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    getHomeFeed(nextCursor).then((result) => {
      setPosts((prev) => [...prev, ...result.posts]);
      setNextCursor(result.nextCursor);
      setLoadingMore(false);
    });
  }

  function handleRefresh() {
    startRefresh(async () => {
      await loadFeed();
      const [t, d] = await Promise.all([getTrendingTickers(), getActiveDiscussions()]);
      setTrending(t);
      setDiscussions(d);
    });
  }

  function handleOpenComments(postId: string) {
    setOpenPostId(postId);
  }

  function handleCloseComments() {
    setOpenPostId(null);
    loadFeed();
  }

  if (openPostId) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="min-h-[400px] rounded-2xl border border-white/[0.06] bg-surface-raised">
          <PostCommentsPanel postId={openPostId} onClose={handleCloseComments} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
      {/* Left rail */}
      <aside className="hidden space-y-4 lg:block">
        <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">Quick Links</p>
          <nav className="space-y-1">
            <Link
              href="/watchlist"
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Watchlist
            </Link>
            <Link
              href="/feed"
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
            >
              <Newspaper className="h-3.5 w-3.5" />
              News Feed
            </Link>
          </nav>
        </div>

        <TrendingTickersCard tickers={trending} />
      </aside>

      {/* Center feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">Community</h2>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 transition hover:text-brand"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            Refresh
          </button>
        </div>

        <PostComposer onPostCreated={handlePostCreated} />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-white/10 py-12 text-center">
            <p className="text-sm text-slate-500">No posts yet. Be the first to share something.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {posts.map((post) => (
                <CommunityPostCard
                  key={post.id}
                  post={post}
                  onOpenComments={handleOpenComments}
                />
              ))}
            </div>
            {nextCursor && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="rounded-xl bg-white/5 px-6 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-200"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right rail */}
      <aside className="hidden space-y-4 lg:block">
        <ActiveDiscussionsCard
          discussions={discussions}
          onOpenComments={handleOpenComments}
        />

        {/* Mobile-hidden trending fallback */}
        <div className="lg:hidden">
          <TrendingTickersCard tickers={trending} />
        </div>
      </aside>
    </div>
  );
}
