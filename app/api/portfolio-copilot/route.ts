import { NextResponse } from "next/server";

import {
  PLAN_LABELS,
  parseModelTier,
  providerIdForTier,
} from "@/lib/billing/plans";
import {
  BillingAccessError,
} from "@/lib/billing/subscriptions";
import {
  AIChatError,
  getAIProviderById,
  toArticleChatError,
} from "@/lib/services/ai";
import type { AIChatErrorCode } from "@/lib/services/ai";
import { computePortfolioOverview } from "@/lib/services/portfolio";
import { loadInvestmentThesesForSymbols } from "@/lib/server/investment-theses";
import { createClient } from "@/lib/supabase/server";
import {
  AIUsageAccessError,
  assertUserCanUseAI,
} from "@/lib/security/ai-access";
import {
  buildChatGrantSetCookieHeader,
  chatGrantRequired,
  type ChatGrantScope,
} from "@/lib/security/chat-turnstile-grant";
import { verifyTurnstileToken, getClientIp } from "@/lib/security/turnstile";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonWithCookie(body: unknown, status: number, setCookie: string) {
  const res = NextResponse.json(body, { status });
  res.headers.append("Set-Cookie", setCookie);
  return res;
}

function respondWithGrant(body: unknown, status: number, scope: ChatGrantScope) {
  try {
    return jsonWithCookie(body, status, buildChatGrantSetCookieHeader(scope));
  } catch {
    // Missing TURNSTILE_SECRET_KEY or other signing failure — the grant is a
    // best-effort optimization. Fall back to a plain response so the user is
    // asked to complete Turnstile again on the next request rather than
    // receiving a 500.
    return json(body, status);
  }
}

type ChatHistoryItem = {
  role?: string;
  content?: string;
};

function userFacingMessage(code: AIChatErrorCode): string {
  switch (code) {
    case "provider_auth":
      return "AI provider credentials are invalid or missing. An admin needs to check the API key and deployment configuration.";
    case "provider_timeout":
      return "The AI provider took too long to respond. Please try again in a moment.";
    case "provider_bad_response":
      return "The AI provider returned an unusable response. Please try again or rephrase your question.";
    case "provider_unavailable":
    default:
      return "Portfolio copilot is temporarily unavailable. Please try again later.";
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: {
    portfolioId?: string;
    message?: string;
    modelTier?: unknown;
    history?: ChatHistoryItem[];
    watchlistSymbols?: string[];
    turnstileToken?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const portfolioId = body.portfolioId?.trim();
  const message = body.message?.trim();
  const modelTier = parseModelTier(body.modelTier);
  const watchlistSymbols = Array.isArray(body.watchlistSymbols)
    ? body.watchlistSymbols
        .map((symbol) => String(symbol).trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 25)
    : [];
  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (item): item is { role: "user" | "assistant"; content: string } =>
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string" &&
            item.content.trim().length > 0,
        )
        .slice(-12)
        .map((item) => ({
          role: item.role,
          content: item.content.trim().slice(0, 4000),
        }))
    : [];

  if (!portfolioId || !message) {
    return json({ error: "portfolioId and message are required" }, 400);
  }
  if (!modelTier) {
    return json({ error: "modelTier must be 'free', 'premium', or 'ultimate'" }, 400);
  }

  const scope: ChatGrantScope = {
    userId: user.id,
    surface: "portfolio-copilot",
    portfolioId,
  };

  // Grant-based Turnstile gating: only require a fresh challenge when the
  // browser does not already hold a valid 15-minute portfolio chat grant.
  let issueGrantCookie = false;
  if (chatGrantRequired(request, scope)) {
    const turnstileResult = await verifyTurnstileToken({
      token: body.turnstileToken,
      remoteIp: getClientIp(request),
      expectedAction: "portfolio-copilot",
    });
    if (!turnstileResult.success) {
      return json({ error: turnstileResult.message, code: "turnstile_failed" }, 403);
    }
    issueGrantCookie = true;
  }
  const respondForChat = (body: unknown, status = 200) =>
    issueGrantCookie ? respondWithGrant(body, status, scope) : json(body, status);

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id, name")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (!portfolio) {
    return respondForChat({ error: "Portfolio not found" }, 404);
  }

  try {
    await assertUserCanUseAI(user, modelTier, "portfolio_copilot");
  } catch (error) {
    if (error instanceof BillingAccessError) {
      return respondForChat(
        {
          error: `The ${modelTier} tier requires the ${PLAN_LABELS[error.requiredPlan]} plan.`,
          code: error.code,
          currentPlan: error.currentPlan,
          requiredPlan: error.requiredPlan,
          requestedTier: error.requestedTier,
        },
        403,
      );
    }
    if (error instanceof AIUsageAccessError) {
      return respondForChat(
        {
          error: error.message,
          code: error.code,
          retryAfterMs: error.retryAfterMs,
          quotaWindow: error.quotaWindow,
          quotaLimit: error.quotaLimit,
          quotaUsed: error.quotaUsed,
          resetsAt: error.resetsAt,
        },
        429,
      );
    }
    throw error;
  }

  try {
    const [overview, holdingsResult, runResult] = await Promise.all([
      computePortfolioOverview(supabase, portfolioId),
      supabase
        .from("holdings")
        .select("symbol, company, sector, quantity, average_cost, allocation, current_price, price, daily_change")
        .eq("portfolio_id", portfolioId)
        .order("allocation", { ascending: false }),
      supabase
        .from("analysis_runs")
        .select("id")
        .eq("portfolio_id", portfolioId)
        .in("status", ["complete", "degraded"])
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (holdingsResult.error) {
      return respondForChat({ error: holdingsResult.error.message }, 500);
    }

    const latestRunId = runResult.data?.id ?? null;
    let insightsRows:
      | Array<{ title: string; value: string; detail: string }>
      | null = null;
    let feedRows:
      | Array<{
          relevance_score: number | null;
          why_it_matters: string | null;
          holdings: string[] | null;
          sectors: string[] | null;
          news_items:
            | {
                headline: string | null;
                source: string | null;
                published_at: string | null;
                category: string | null;
              }
            | Array<{
                headline: string | null;
                source: string | null;
                published_at: string | null;
                category: string | null;
              }>
            | null;
        }>
      | null = null;

    if (latestRunId) {
      const [insightsResult, feedResult] = await Promise.all([
        supabase
          .from("portfolio_insights")
          .select("title, value, detail")
          .eq("analysis_run_id", latestRunId)
          .order("created_at", { ascending: true }),
        supabase
          .from("feed_items")
          .select(`
            relevance_score,
            why_it_matters,
            holdings,
            sectors,
            news_items (
              headline,
              source,
              published_at,
              category
            )
          `)
          .eq("analysis_run_id", latestRunId)
          .eq("portfolio_id", portfolioId)
          .order("relevance_score", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      if (insightsResult.error) {
        return respondForChat({ error: insightsResult.error.message }, 500);
      }
      if (feedResult.error) {
        return respondForChat({ error: feedResult.error.message }, 500);
      }

      insightsRows = insightsResult.data;
      feedRows = feedResult.data;
    }

    const providerId = providerIdForTier(modelTier);
    const ai = getAIProviderById(providerId);
    const mappedHoldings = (holdingsResult.data ?? []).map((holding) => ({
      symbol: (holding.symbol as string) ?? "",
      company: (holding.company as string) ?? "",
      sector: (holding.sector as string) ?? "Other",
      quantity: Number(holding.quantity ?? 0),
      averageCost: Number(holding.average_cost ?? 0),
      allocation: Number(holding.allocation ?? 0),
      price: Number(holding.current_price ?? holding.price ?? 0),
      dayChange: Number(holding.daily_change ?? 0),
    }));
    const investmentTheses = await loadInvestmentThesesForSymbols(
      supabase,
      mappedHoldings.map((holding) => holding.symbol),
      portfolioId,
    );

    let answer: string;
    try {
      answer = await ai.answerPortfolioQuestion({
        portfolio: {
          name: (portfolio.name as string) ?? "My Portfolio",
          totalValue: overview.totalValue,
          dayChange: overview.dayChange,
          lastAnalyzedAt: overview.lastAnalyzedAt,
          coverage: overview.coverage,
          primaryGoal: overview.primaryGoal,
        },
        holdings: mappedHoldings,
        insights: (insightsRows ?? []).map((item) => ({
          title: item.title,
          value: item.value,
          detail: item.detail,
        })),
        feed: (feedRows ?? [])
          .map((item) => {
            const news = Array.isArray(item.news_items) ? item.news_items[0] : item.news_items;
            if (!news) return null;

            return {
              headline: (news.headline as string) ?? "Untitled story",
              source: (news.source as string) ?? "Unknown source",
              publishedAt: (news.published_at as string) ?? new Date().toISOString(),
              category: ((news.category as string) ?? "other") as
                | "technology"
                | "minerals"
                | "energy"
                | "healthcare"
                | "financials"
                | "consumer"
                | "industrials"
                | "macro"
                | "regulation"
                | "earnings"
                | "deals"
                | "geopolitics"
                | "other",
              whyItMatters: item.why_it_matters ?? "",
              relevanceScore: Number(item.relevance_score ?? 0),
              holdings: (item.holdings ?? []).map((value) => value.toUpperCase()),
              sectors: item.sectors ?? [],
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null),
        watchlistSymbols,
        investmentTheses,
        history,
        question: message,
      });
    } catch (error) {
      const aiErr = error instanceof AIChatError ? error : toArticleChatError(error);
      return respondForChat(
        {
          error: userFacingMessage(aiErr.code),
          code: aiErr.code,
        },
        503,
      );
    }

    return respondForChat({ answer });
  } catch (error) {
    return respondForChat(
      { error: error instanceof Error ? error.message : "Failed to answer question" },
      500,
    );
  }
}
