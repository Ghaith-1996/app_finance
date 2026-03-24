"use client";

import { MessageCircle } from "lucide-react";

import type { ActiveDiscussion } from "@/lib/community/types";

interface Props {
  discussions: ActiveDiscussion[];
  onOpenComments: (postId: string) => void;
}

export function ActiveDiscussionsCard({ discussions, onOpenComments }: Props) {
  if (discussions.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-4">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        <MessageCircle className="h-3.5 w-3.5" />
        Active Discussions
      </div>
      <div className="space-y-2">
        {discussions.map((d) => (
          <button
            key={d.postId}
            type="button"
            onClick={() => onOpenComments(d.postId)}
            className="w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-white/5"
          >
            <p className="truncate text-[12px] text-slate-300">{d.bodyPreview}</p>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-600">
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
