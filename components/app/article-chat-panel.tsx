"use client";

import { useEffect, useMemo, useState } from "react";

import { Loader2, SendHorizonal, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ArticleChatMessage } from "@/lib/types";

const STARTER_QUESTIONS = [
  "What matters most here for my portfolio?",
  "What is the main risk in this story?",
  "What follow-up should I watch next?",
];

export function ArticleChatPanel({
  portfolioId,
  newsItemId,
  headline,
}: {
  portfolioId?: string | null;
  newsItemId: string;
  headline: string;
}) {
  const [messages, setMessages] = useState<ArticleChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const disabled = !portfolioId;
  const starterQuestions = useMemo(
    () => STARTER_QUESTIONS.map((q) => q.replace("this story", `"${headline}"`)),
    [headline],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadThread() {
      if (!portfolioId) {
        setMessages([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          portfolioId,
          newsItemId,
        });
        const res = await fetch(`/api/article-chat?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load article chat");
        }
        if (!cancelled) {
          setMessages((data.messages ?? []) as ArticleChatMessage[]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load article chat");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadThread();
    return () => {
      cancelled = true;
    };
  }, [portfolioId, newsItemId]);

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || !portfolioId) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/article-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          newsItemId,
          message: trimmed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to send message");
      }
      setMessages((data.messages ?? []) as ArticleChatMessage[]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-3xl border border-black/6 bg-[#fbf7ef] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">
            Ask AI
          </p>
          <p className="text-sm text-slate-600">
            Ask follow-up questions about this article in the context of the portfolio.
          </p>
        </div>
        <Badge tone="brand">
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          Story chat
        </Badge>
      </div>

      {disabled ? (
        <p className="text-sm text-slate-500">
          Connect a portfolio to use article chat.
        </p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading conversation…
        </div>
      ) : (
        <>
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-2xl border border-black/6 bg-white/80 p-3">
            {messages.length > 0 ? (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    message.role === "assistant"
                      ? "rounded-2xl bg-[#f6efe0] p-3 text-sm text-slate-700"
                      : "ml-auto max-w-[90%] rounded-2xl bg-[#17243a] p-3 text-sm text-white"
                  }
                >
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] opacity-70">
                    {message.role}
                  </p>
                  <p className="whitespace-pre-wrap leading-6">{message.content}</p>
                </div>
              ))
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Start a conversation about this story.
                </p>
                <div className="flex flex-wrap gap-2">
                  {starterQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => void sendMessage(question)}
                      disabled={sending}
                      className="rounded-full border border-black/8 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-brand/30 hover:text-slate-950"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor={`article-chat-${newsItemId}`}>
              Ask a follow-up
            </label>
            <textarea
              id={`article-chat-${newsItemId}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              placeholder="Ask how this article affects the portfolio, what to watch next, or where the risk sits."
              className="w-full rounded-2xl border border-black/8 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand/40"
            />
            <div className="flex items-center justify-between gap-3">
              {error ? <p className="text-sm text-rose-600">{error}</p> : <span />}
              <Button
                type="button"
                onClick={() => void sendMessage(draft)}
                disabled={sending || !draft.trim() || disabled}
              >
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizonal className="mr-2 h-4 w-4" />}
                Send
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
