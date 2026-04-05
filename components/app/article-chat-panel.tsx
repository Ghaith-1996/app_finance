"use client";

import { useEffect, useMemo, useState } from "react";

import { Loader2, SendHorizonal, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TurnstileBlock, useTurnstile } from "@/components/security/turnstile-widget";
import type { ArticleChatMessage, ArticleChatModelTier } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORY_STARTER_QUESTIONS = [
  "What matters most here for my portfolio?",
  "What is the main risk in this story?",
  "What follow-up should I watch next?",
];

const GENERAL_STARTER_QUESTIONS = [
  "How should I think about my portfolio today?",
  "What market risk matters most right now?",
  "Which positions or themes deserve attention next?",
];

const TIER_OPTIONS: Array<{ tier: ArticleChatModelTier; label: string }> = [
  { tier: "free", label: "Free" },
  { tier: "premium", label: "Premium" },
  { tier: "ultimate", label: "Ultimate" },
];

export type ArticleChatActivityState = {
  hasMessages: boolean;
  hasDraft: boolean;
};

export type ArticleChatContextMode = "story" | "general";

export function ArticleChatPanel({
  portfolioId,
  newsItemId,
  headline,
  allowedTiers = ["free", "premium", "ultimate"],
  selectedTier,
  onSelectedTierChange,
  onActivityChange,
  className,
  showHeader = true,
  contextMode = "story",
}: {
  portfolioId?: string | null;
  newsItemId?: string;
  headline?: string;
  allowedTiers?: ArticleChatModelTier[];
  selectedTier: ArticleChatModelTier;
  onSelectedTierChange: (tier: ArticleChatModelTier) => void;
  onActivityChange?: (state: ArticleChatActivityState) => void;
  className?: string;
  showHeader?: boolean;
  contextMode?: ArticleChatContextMode;
}) {
  const [messages, setMessages] = useState<ArticleChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const turnstile = useTurnstile();

  const disabled = !portfolioId;
  const isGeneralContext = contextMode === "general" || !newsItemId;
  const resolvedHeadline = headline?.trim() || (isGeneralContext ? "No active article" : "Selected article");
  const starterQuestions = useMemo(
    () =>
      isGeneralContext
        ? GENERAL_STARTER_QUESTIONS
        : STORY_STARTER_QUESTIONS.map((question) =>
            question.replace("this story", `"${resolvedHeadline}"`),
          ),
    [isGeneralContext, resolvedHeadline],
  );

  useEffect(() => {
    onActivityChange?.({
      hasMessages: messages.length > 0,
      hasDraft: draft.trim().length > 0,
    });
  }, [draft, messages, onActivityChange]);

  useEffect(() => {
    let cancelled = false;

    async function loadThread() {
      setMessages([]);
      setDraft("");
      setSending(false);
      setError(null);
      setErrorCode(null);

      if (!portfolioId || !newsItemId) {
        setLoading(false);
        return;
      }

      setLoading(true);
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

    void loadThread();
    return () => {
      cancelled = true;
    };
  }, [portfolioId, newsItemId]);

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || !portfolioId) return;

    setSending(true);
    setError(null);
    setErrorCode(null);
    try {
      const body: {
        portfolioId: string;
        message: string;
        modelTier: ArticleChatModelTier;
        newsItemId?: string;
        turnstileToken?: string;
        history: Array<Pick<ArticleChatMessage, "role" | "content">>;
      } = {
        portfolioId,
        message: trimmed,
        modelTier: selectedTier,
        turnstileToken: turnstile.token ?? undefined,
        history: messages.map((entry) => ({ role: entry.role, content: entry.content })),
      };
      if (newsItemId) {
        body.newsItemId = newsItemId;
      }

      const res = await fetch("/api/article-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        messages?: ArticleChatMessage[];
      };
      if (!res.ok) {
        setErrorCode(data.code ?? null);
        if (data.code === "turnstile_failed") {
          turnstile.reset();
        }
        throw new Error(data.error ?? "Failed to send message");
      }
      setMessages((data.messages ?? []) as ArticleChatMessage[]);
      setDraft("");
      turnstile.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      turnstile.reset();
    } finally {
      setSending(false);
    }
  }

  const helperCopy = isGeneralContext
    ? "No article selected. Ask about your portfolio, watchlist, or today's market."
    : "Ask follow-up questions about this article in the context of the portfolio.";
  const planAccessCopy = `Current plan access: ${allowedTiers.map((tier) => tier[0].toUpperCase() + tier.slice(1)).join(", ")}.`;
  const emptyStateCopy = isGeneralContext
    ? "No article selected - start with a portfolio or market question."
    : "Start a conversation about this story.";
  const textareaLabel = isGeneralContext ? "Ask about the market or your portfolio" : "Ask a follow-up";
  const textareaPlaceholder = isGeneralContext
    ? "Ask about portfolio positioning, market risks, or what deserves attention next."
    : "Ask how this article affects the portfolio, what to watch next, or where the risk sits.";

  return (
    <div
      className={cn(
        "space-y-4 rounded-3xl border border-white/[0.06] bg-surface-raised p-4",
        className,
      )}
    >
      {showHeader ? (
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">
              Ask AI
            </p>
            <p className="text-sm text-slate-400">{helperCopy}</p>
          </div>
          <Badge tone="brand">
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {isGeneralContext ? "General chat" : "Story chat"}
          </Badge>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Model
          </p>
          <p className="text-xs text-slate-500">
            Choose the response tier for the next answer. {planAccessCopy}
          </p>
        </div>
        <div
          role="group"
          aria-label="Model tier"
          className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1"
        >
          {TIER_OPTIONS.map((option) => {
            const selected = selectedTier === option.tier;
            const locked = !allowedTiers.includes(option.tier);
            return (
              <button
                key={option.tier}
                type="button"
                aria-pressed={selected}
                disabled={sending || locked}
                onClick={() => onSelectedTierChange(option.tier)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition",
                  selected
                    ? "bg-brand text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200",
                  (sending || locked) && "cursor-not-allowed opacity-60",
                )}
              >
                {option.label}
                {locked ? " Locked" : ""}
              </button>
            );
          })}
        </div>
      </div>

      {disabled ? (
        <p className="text-sm text-slate-500">
          Connect a portfolio to use article chat.
        </p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading conversation...
        </div>
      ) : (
        <>
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
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
                <p className="text-sm text-slate-400">{emptyStateCopy}</p>
                <div className="flex flex-wrap gap-2">
                  {starterQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => void sendMessage(question)}
                      disabled={sending || !turnstile.canSubmit}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-400 transition hover:border-brand/30 hover:text-slate-200"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-400" htmlFor={`article-chat-${newsItemId ?? "general"}`}>
              {textareaLabel}
            </label>
            <div className="flex items-end gap-3">
              <textarea
                id={`article-chat-${newsItemId ?? "general"}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                placeholder={textareaPlaceholder}
                className="min-h-[104px] flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-brand/40"
              />
              <Button
                type="button"
                onClick={() => void sendMessage(draft)}
                disabled={sending || !draft.trim() || disabled || !turnstile.canSubmit}
                className="shrink-0 self-end px-4"
              >
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SendHorizonal className="mr-2 h-4 w-4" />}
                Send
              </Button>
            </div>
            <TurnstileBlock turnstile={turnstile} action="article-chat" />
            {error ? (
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm text-red-400">{error}</p>
                {errorCode === "turnstile_failed" && (
                  <p className="text-xs text-slate-500">Your verification expired. Wait for it to refresh, then re-send.</p>
                )}
                {errorCode === "provider_auth" && (
                  <p className="text-xs text-slate-500">Check that the selected AI tier is configured correctly in the server environment.</p>
                )}
                {errorCode === "provider_timeout" && (
                  <p className="text-xs text-slate-500">The AI service may be overloaded. Wait a moment and try again.</p>
                )}
                {errorCode === "provider_bad_response" && (
                  <p className="text-xs text-slate-500">Try rephrasing your question or try again shortly.</p>
                )}
                {errorCode === "rate_limited" && (
                  <p className="text-xs text-slate-500">You hit the minute-level safety limit. Wait a moment, then try again.</p>
                )}
                {errorCode === "quota_exceeded" && (
                  <p className="text-xs text-slate-500">You have used this plan's AI allowance for the current reset window.</p>
                )}
                {errorCode === "plan_upgrade_required" && (
                  <p className="text-xs text-slate-500">Upgrade your plan in Billing to unlock that model tier.</p>
                )}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
