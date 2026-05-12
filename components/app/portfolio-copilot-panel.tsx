"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Loader2, SendHorizonal, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TurnstileBlock, useTurnstile } from "@/components/security/turnstile-widget";
import type { ArticleChatModelTier } from "@/lib/types";

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
  allowedTiers = ["free", "premium", "ultimate"],
  defaultModelTier = "free",
  initialTurnstileVerified = false,
}: {
  portfolioId: string;
  watchlistSymbols?: string[];
  allowedTiers?: ArticleChatModelTier[];
  defaultModelTier?: ArticleChatModelTier;
  /**
   * Initial "portfolio chat window already passed a Turnstile challenge"
   * hint from the server (derived from the signed grant cookie).
   * When `true`, the widget is hidden and the send button does not wait on
   * a fresh challenge.
   */
  initialTurnstileVerified?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<ArticleChatModelTier>(defaultModelTier);
  const [isVerifiedForCurrentChat, setIsVerifiedForCurrentChat] = useState(
    initialTurnstileVerified,
  );
  const turnstile = useTurnstile();

  const starterQuestions = useMemo(() => STARTER_QUESTIONS, []);
  const planAccessCopy = useMemo(
    () =>
      `Current plan access: ${allowedTiers
        .map((tier) => tier[0].toUpperCase() + tier.slice(1))
        .join(", ")}.`,
    [allowedTiers],
  );

  useEffect(() => {
    if (!allowedTiers.includes(selectedTier)) {
      setSelectedTier(defaultModelTier);
    }
  }, [allowedTiers, defaultModelTier, selectedTier]);

  // Scope reset: switching portfolios invalidates the previous grant for this
  // UI. Clear local verification, drop the current conversation, and reset
  // the widget so a fresh challenge arms for the new scope.
  useEffect(() => {
    setIsVerifiedForCurrentChat(initialTurnstileVerified);
    setMessages([]);
    setDraft("");
    setError(null);
    setErrorCode(null);
    turnstile.reset();
    // `turnstile.reset` is stable (useCallback); only the portfolioId and the
    // hydrated initial value should trigger a scope reset.
  }, [portfolioId, initialTurnstileVerified, turnstile.reset]);

  const canSendForCurrentChat = isVerifiedForCurrentChat || turnstile.canSubmit;

  const sendMessage = useCallback(
    async (message: string) => {
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
      setErrorCode(null);

      try {
        const body: {
          portfolioId: string;
          message: string;
          modelTier: ArticleChatModelTier;
          watchlistSymbols?: string[];
          turnstileToken?: string;
          history: Array<{ role: "user" | "assistant"; content: string }>;
        } = {
          portfolioId,
          message: trimmed,
          modelTier: selectedTier,
          watchlistSymbols,
          history: messages
            .concat(nextUserMessage)
            .slice(-10)
            .map((item) => ({ role: item.role, content: item.content })),
        };
        // Only attach a Turnstile token when the server has not yet granted
        // this portfolio chat window. Once granted, the signed cookie bypasses
        // the challenge for 15 minutes.
        if (!isVerifiedForCurrentChat && turnstile.token) {
          body.turnstileToken = turnstile.token;
        }

        const res = await fetch("/api/portfolio-copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = (await res.json().catch(() => ({}))) as {
          answer?: string;
          error?: string;
          code?: string;
        };

        if (!res.ok || !data.answer) {
          setErrorCode(data.code ?? null);
          if (data.code === "turnstile_failed") {
            // Only a real Turnstile failure should re-arm the challenge.
            setIsVerifiedForCurrentChat(false);
            turnstile.reset();
          }
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
        // First successful send minted a server-side grant cookie. Mark the
        // scope verified and leave the widget hidden; do NOT reset it, which
        // would arm a fresh challenge on every send.
        setIsVerifiedForCurrentChat(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to get copilot answer");
        setMessages((current) => current.filter((item) => item.id !== nextUserMessage.id));
        setDraft(trimmed);
      } finally {
        setSending(false);
      }
    },
    [
      isVerifiedForCurrentChat,
      messages,
      portfolioId,
      selectedTier,
      sending,
      turnstile,
      watchlistSymbols,
    ],
  );

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

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Model
          </p>
          <p className="text-xs text-slate-500">{planAccessCopy}</p>
        </div>
        <div
          role="group"
          aria-label="Model tier"
          className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1"
        >
          {(["free", "premium", "ultimate"] as const).map((tier) => {
            const locked = !allowedTiers.includes(tier);
            const selected = selectedTier === tier;

            return (
              <button
                key={tier}
                type="button"
                aria-pressed={selected}
                disabled={sending || locked}
                onClick={() => setSelectedTier(tier)}
                className={[
                  "rounded-full px-3 py-1.5 text-sm font-medium transition",
                  selected ? "bg-brand text-white shadow-sm" : "text-slate-400 hover:text-slate-200",
                  sending || locked ? "cursor-not-allowed opacity-60" : "",
                ].join(" ")}
              >
                {tier[0].toUpperCase() + tier.slice(1)}
                {locked ? " Locked" : ""}
              </button>
            );
          })}
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
                  disabled={sending || !canSendForCurrentChat}
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
        {/* Hide the challenge once the portfolio copilot scope is granted;
            it re-appears only if the scope changes or a turnstile_failed
            response forces a fresh challenge. */}
        {!isVerifiedForCurrentChat && (
          <TurnstileBlock turnstile={turnstile} action="portfolio-copilot" />
        )}
        <div className="flex items-center justify-between gap-3">
          {error ? (
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm text-red-400">{error}</p>
              {errorCode === "turnstile_failed" && (
                <p className="text-xs text-slate-500">Your verification expired. Wait for it to refresh, then re-send.</p>
              )}
              {errorCode === "rate_limited" && (
                <p className="text-xs text-slate-500">You hit the minute-level safety limit. Wait a moment, then try again.</p>
              )}
              {errorCode === "quota_exceeded" && (
                <p className="text-xs text-slate-500">You have used this plan&apos;s AI allowance for the current reset window.</p>
              )}
              {errorCode === "plan_upgrade_required" && (
                <p className="text-xs text-slate-500">Upgrade your plan in Billing to unlock that model tier.</p>
              )}
            </div>
          ) : <span />}
          <Button
            type="button"
            onClick={() => void sendMessage(draft)}
            disabled={sending || !draft.trim() || !canSendForCurrentChat}
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
