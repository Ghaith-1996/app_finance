"use client";

import { useMemo, useState } from "react";

import { Loader2, SendHorizonal, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const STARTER_QUESTIONS = [
  "What is my biggest portfolio risk right now?",
  "Where am I most concentrated?",
  "What should I watch next for this portfolio?",
];

export function PortfolioCopilotPanel({
  portfolioId,
  watchlistSymbols,
}: {
  portfolioId: string;
  watchlistSymbols?: string[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const starterQuestions = useMemo(() => STARTER_QUESTIONS, []);

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || sending) return;

    const nextUserMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };

    setMessages((current) => [...current, nextUserMessage]);
    setDraft("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/portfolio-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolioId,
          message: trimmed,
          watchlistSymbols,
          history: messages
            .concat(nextUserMessage)
            .slice(-10)
            .map((item) => ({ role: item.role, content: item.content })),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
      };

      if (!res.ok || !data.answer) {
        throw new Error(data.error ?? "Failed to get copilot answer");
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer ?? "",
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get copilot answer");
      setMessages((current) => current.filter((item) => item.id !== nextUserMessage.id));
      setDraft(trimmed);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-[2rem] border border-white/[0.06] bg-surface-raised p-5">
      <div className="flex items-center gap-3">
        <div className="text-brand">
          <Sparkles className="h-5 w-5 fill-current" />
        </div>
        <div>
          <p className="text-[15px] font-bold text-white">Portfolio Copilot</p>
          <p className="text-sm text-slate-400">
            Ask about holdings, exposure, catalysts, or your watchlist.
          </p>
        </div>
      </div>

      <div className="max-h-72 space-y-3 overflow-y-auto rounded-[1.5rem] border border-white/[0.06] bg-white/[0.03] p-3">
        {messages.length > 0 ? (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "assistant"
                  ? "rounded-2xl bg-white/5 p-3 text-sm text-slate-300"
                  : "ml-auto max-w-[90%] rounded-2xl bg-brand/10 p-3 text-sm text-white"
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
            <p className="text-sm text-slate-400">
              Start with a portfolio question.
            </p>
            <div className="flex flex-wrap gap-2">
              {starterQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void sendMessage(question)}
                  disabled={sending}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-slate-400 transition hover:border-brand/30 hover:text-slate-200"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
          placeholder="Ask anything about your portfolio or watchlist."
          className="w-full rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-brand/40"
        />
        <div className="flex items-center justify-between gap-3">
          {error ? <p className="text-sm text-red-400">{error}</p> : <span />}
          <Button
            type="button"
            onClick={() => void sendMessage(draft)}
            disabled={sending || !draft.trim()}
          >
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <SendHorizonal className="mr-2 h-4 w-4" />
            )}
            Ask Copilot
          </Button>
        </div>
      </div>
    </div>
  );
}
