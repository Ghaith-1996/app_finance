"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

import type { CommunityPost } from "@/lib/community/types";
import { cn } from "@/lib/utils";

interface Props {
  post: CommunityPost;
  onOpenComments: (postId: string) => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function renderBodyWithTickers(body: string) {
  const parts = body.split(/(\$[A-Z]{1,10})/g);
  return parts.map((part, i) => {
    if (/^\$[A-Z]{1,10}$/.test(part)) {
      const ticker = part.slice(1);
      return (
        <Link
          key={i}
          href={`/watchlist?symbol=${encodeURIComponent(ticker)}`}
          className="font-bold text-brand transition hover:text-brand-strong"
        >
          {part}
        </Link>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function CommunityPostCard({ post, onOpenComments }: Props) {
  const initials = post.author.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-4 transition hover:border-white/10">
      {/* Author row */}
      <div className="flex items-center gap-3">
        {post.author.avatarUrl ? (
          <img
            src={post.author.avatarUrl}
            alt=""
            className="h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {post.author.displayName}
            {post.author.handle && (
              <span className="ml-1.5 font-normal text-slate-600">@{post.author.handle}</span>
            )}
          </p>
          <p className="text-[10px] text-slate-600">{timeAgo(post.createdAt)}</p>
        </div>
      </div>

      {/* Body */}
      <div className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300">
        {renderBodyWithTickers(post.body)}
      </div>

      {/* Ticker pills */}
      {post.tickers.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tickers.map((t) => (
            <Link
              key={t}
              href={`/watchlist?symbol=${encodeURIComponent(t)}`}
              className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-400 transition hover:bg-brand/10 hover:text-brand"
            >
              ${t}
            </Link>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 border-t border-white/[0.04] pt-2.5">
        <button
          type="button"
          onClick={() => onOpenComments(post.id)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 transition hover:text-brand"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {post.commentCount > 0 ? `${post.commentCount} comment${post.commentCount === 1 ? "" : "s"}` : "Comment"}
        </button>
      </div>
    </div>
  );
}
