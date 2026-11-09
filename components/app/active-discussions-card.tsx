"use client";

import { ChatCircle as MessageCircle } from "@phosphor-icons/react/dist/ssr/ChatCircle";

import type { ActiveDiscussion } from "@/lib/community/types";

interface Props {
  discussions: ActiveDiscussion[];
  onOpenComments: (postId: string) => void;
}

export function ActiveDiscussionsCard({ discussions, onOpenComments }: Props) {
  if (discussions.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-600">
        <MessageCircle className="h-3.5 w-3.5" />
        Active discussions
      </div>
      <div className="space-y-2">
        {discussions.map((d) => (
          <button
            key={d.postId}
            type="button"
            onClick={() => onOpenComments(d.postId)}
            className="w-full rounded-lg px-3 py-2 text-left transition hover:bg-white/5"
          >
            <p className="truncate text-xs text-slate-300">{d.bodyPreview}</p>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
              <span>{d.authorName}</span>
              <span>·</span>
              <span>{d.commentCount} comment{d.commentCount === 1 ? "" : "s"}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
