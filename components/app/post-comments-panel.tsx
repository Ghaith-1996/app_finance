"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, Loader2, Send } from "lucide-react";

import { getPostComments, createComment } from "@/lib/actions/community";
import { validateCommentBody } from "@/lib/community/types";
import type { CommunityComment } from "@/lib/community/types";
import { TurnstileBlock, useTurnstile } from "@/components/security/turnstile-widget";
import { cn } from "@/lib/utils";

interface Props {
  postId: string;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function PostCommentsPanel({ postId, onClose }: Props) {
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const turnstile = useTurnstile();

  useEffect(() => {
    setLoading(true);
    getPostComments(postId)
      .then(setComments)
      .finally(() => setLoading(false));
  }, [postId]);

  const validation = validateCommentBody(body);
  const canSubmit = !isPending && body.trim().length > 0 && !validation && turnstile.canSubmit;

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const result = await createComment(postId, body, turnstile.token ?? undefined);
      if (result.ok && result.comment) {
        setComments((prev) => [...prev, result.comment!]);
        setBody("");
      } else {
        setError(result.error ?? "Failed to post comment.");
      }
      turnstile.reset();
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-white">Comments</p>
      </div>

      {/* Comments list */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
          </div>
        ) : comments.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-600">No comments yet. Start the conversation.</p>
        ) : (
          comments.map((c) => {
            const initials = c.author.displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div key={c.id} className="flex gap-2.5">
                {c.author.avatarUrl ? (
                  <img src={c.author.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[9px] font-bold text-brand">
                    {initials}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[12px]">
                    <span className="font-semibold text-white">{c.author.displayName}</span>
                    <span className="ml-2 text-slate-600">{timeAgo(c.createdAt)}</span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-400">{c.body}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-white/[0.06] p-3">
        {error && <p className="mb-2 text-[11px] text-red-400">{error}</p>}
        <TurnstileBlock turnstile={turnstile} action="community-comment" />
        <div className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment…"
            maxLength={1000}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            className="flex-1 rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={cn(
              "shrink-0 rounded-xl p-2.5 transition",
              canSubmit ? "bg-brand text-[#080c11] hover:bg-brand-strong" : "bg-white/5 text-slate-600",
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
