"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";

import { createPost } from "@/lib/actions/community";
import { TurnstileBlock, useTurnstile } from "@/components/security/turnstile-widget";
import {
  extractHashtags,
  extractTickerHashtags,
  extractTickers,
  validatePostBody,
} from "@/lib/community/types";
import type { CommunityPost } from "@/lib/community/types";
import { cn } from "@/lib/utils";

interface Props {
  onPostCreated: (post: CommunityPost) => void;
}

export function PostComposer({ onPostCreated }: Props) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const turnstile = useTurnstile();

  const tickers = [...new Set([...extractTickers(body), ...extractTickerHashtags(body)])];
  const hashtags = extractHashtags(body);
  const charCount = body.trim().length;
  const validationError = validatePostBody(body);
  const canSubmit = !isPending && charCount > 0 && !validationError && turnstile.canSubmit;

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await createPost(body, turnstile.token ?? undefined);
      if (result.ok && result.post) {
        onPostCreated(result.post);
        setBody("");
      } else {
        setError(result.error ?? "Failed to post.");
      }
      turnstile.reset();
    });
  }

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What's on your mind? Use $TICKER or #AAPL for stocks, or #crypto / #stocks for markets..."
        rows={3}
        maxLength={2000}
        className="w-full resize-none bg-transparent text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none"
      />

      {(tickers.length > 0 || hashtags.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tickers.map((t) => (
            <span
              key={t}
              className="rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand"
            >
              ${t}
            </span>
          ))}
          {hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-sky-500/10 px-2 py-0.5 text-[11px] font-bold text-sky-300"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <TurnstileBlock turnstile={turnstile} action="community-post" />

      <div className="mt-3 flex items-center justify-between">
        <span className={cn("text-[11px]", charCount > 1800 ? "text-amber-400" : "text-slate-600")}>
          {charCount}/2000
        </span>
        <div className="flex items-center gap-3">
          {error && <span className="text-[11px] text-red-400">{error}</span>}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition",
              canSubmit
                ? "bg-brand text-[#080c11] hover:bg-brand-strong"
                : "cursor-not-allowed bg-white/5 text-slate-600",
            )}
          >
            <Send className="h-3.5 w-3.5" />
            {isPending ? "Posting..." : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
