import { computePortfolioOverview } from "@/lib/services/portfolio";
import { createClient } from "@/lib/supabase/server";
import {
  AIChatError,
  getAIProviderById,
  toArticleChatError,
} from "@/lib/services/ai";
import type { AIChatErrorCode } from "@/lib/services/ai";
import { createLogger } from "@/lib/logger";
import type {
  ArticleChatMessage,
  ArticleChatModelTier,
  NewsCategory,
  TickerImpact,
} from "@/lib/types";

const log = createLogger("article-chat");

type ArticleChatProviderId = "azure" | "openrouter";
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ChatHistoryItem = Pick<ArticleChatMessage, "role" | "content">;

function providerIdForTier(tier: ArticleChatModelTier): ArticleChatProviderId {
  return tier === "premium" ? "azure" : "openrouter";
}

function deploymentLabelForLogs(id: ArticleChatProviderId): string {
  if (id === "azure") {
    return (
      process.env.AZURE_OPENAI_MODEL?.trim() ||
      process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
      "azure"
    );
  }
  return process.env.OPENROUTER_MODEL?.trim() || "openrouter-default";
}

function parseModelTier(value: unknown): ArticleChatModelTier | null {
  if (value == null) return "free";
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "free" || normalized === "premium") {
    return normalized;
  }
  return null;
}

function parseHistory(value: unknown): ChatHistoryItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is { role: "user" | "assistant"; content: string } =>
        !!item &&
        typeof item === "object" &&
        (((item as { role?: unknown }).role === "user") ||
          ((item as { role?: unknown }).role === "assistant")) &&
        typeof (item as { content?: unknown }).content === "string" &&
        (item as { content: string }).content.trim().length > 0,
    )
    .slice(-12)
    .map((item) => ({
      role: item.role,
      content: item.content.trim(),
    }));
}

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
      return "Article chat is temporarily unavailable. Please try again later.";
  }
}

function buildEphemeralMessages(
  history: ChatHistoryItem[],
  question: string,
  answer: string,
): ArticleChatMessage[] {
  const createdAt = new Date().toISOString();
  return [
    ...history.map((item, index) => ({
      id: `history-${index}-${item.role}`,
      role: item.role,
      content: item.content,
      createdAt,
    })),
    {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      createdAt,
    },
    {
      id: `assistant-${Date.now() + 1}`,
      role: "assistant",
      content: answer,
      createdAt,
    },
  ];
}

type ThreadRow = {
  id: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireAuthedContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { supabase, user: null as null, response: json({ error: "Unauthorized" }, 401) };
  }

  return { supabase, user, response: undefined as undefined };
}

async function verifyPortfolioOwnership(
  supabase: SupabaseClient,
  portfolioId: string,
  userId: string,
) {
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", userId)
    .single();

  return !!portfolio;
}

async function getOrCreateThread(
  supabase: SupabaseClient,
  userId: string,
  portfolioId: string,
  newsItemId: string,
) {
  const { data: existing, error: existingError } = await supabase
    .from("article_chat_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("portfolio_id", portfolioId)
    .eq("news_item_id", newsItemId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }
  if (existing) return existing.id;

  const { data: inserted, error: insertError } = await supabase
    .from("article_chat_threads")
    .insert({
      user_id: userId,
      portfolio_id: portfolioId,
      news_item_id: newsItemId,
    })
    .select("id")
    .single();

  if (insertError) {
    const { data: retry } = await supabase
      .from("article_chat_threads")
      .select("id")
      .eq("user_id", userId)
      .eq("portfolio_id", portfolioId)
      .eq("news_item_id", newsItemId)
      .maybeSingle();
    if (retry) return retry.id;
    throw new Error(insertError.message);
  }

  return inserted.id;
}

async function loadMessages(
  supabase: SupabaseClient,
  threadId: string,
): Promise<ArticleChatMessage[]> {
  const { data, error } = await supabase
    .from("article_chat_messages")
    .select("id, role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    role: row.role as "user" | "assistant",
    content: row.content as string,
    createdAt: row.created_at as string,
  }));
}

async function loadArticlePromptContext(
  supabase: SupabaseClient,
  portfolioId: string,
  newsItemId: string,
) {
  const [{ data: article, error: articleError }, { data: holdings, error: holdingsError }] =
    await Promise.all([
      supabase
        .from("news_items")
        .select(
          "headline, source, published_at, category, global_summary, raw_content, full_content, extracted_content, extraction_status, stock_tags, ticker_impacts, source_type",
        )
        .eq("id", newsItemId)
        .single(),
      supabase
        .from("holdings")
        .select("symbol, company, sector")
        .eq("portfolio_id", portfolioId),
    ]);

  if (articleError || !article) {
    throw new Error(articleError?.message ?? "Article not found");
  }
  if (holdingsError) {
    throw new Error(holdingsError.message);
  }

  const { data: latestRun } = await supabase
    .from("analysis_runs")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .eq("status", "complete")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let latestFeedItem:
    | {
        why_it_matters: string | null;
        relevance_score: number | null;
        holdings: string[] | null;
      }
    | null = null;

  if (latestRun?.id) {
    const { data: feedItem } = await supabase
      .from("feed_items")
      .select("why_it_matters, relevance_score, holdings")
      .eq("portfolio_id", portfolioId)
      .eq("analysis_run_id", latestRun.id)
      .eq("news_item_id", newsItemId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestFeedItem = feedItem;
  }

  const extracted = (article.extracted_content as string | null)?.trim() || "";
  const fullLegacy = (article.full_content as string | null)?.trim() || "";
  const raw = (article.raw_content as string | null)?.trim() || "";
  const extStatus = (article.extraction_status as string | null) ?? null;
  const primaryBody = extracted || fullLegacy || raw || undefined;
  const extractionPending =
    !extracted &&
    !!raw &&
    (extStatus === "queued" ||
      extStatus === "in_progress" ||
      (extStatus !== "complete" && extStatus !== "failed" && extStatus !== "skipped"));

  return {
    article: {
      headline: article.headline as string,
      source: article.source as string,
      publishedAt: article.published_at as string,
      category: (article.category ?? "other") as NewsCategory,
      globalSummary: (article.global_summary as string | null) ?? undefined,
      rawContent: raw || undefined,
      extractedContent: extracted || undefined,
      fullContent: fullLegacy || undefined,
      extractionPending,
      extractionStatus: extStatus,
      stockTags: ((article.stock_tags as string[] | null) ?? []).map((tag) => tag.toUpperCase()),
      tickerImpacts: (article.ticker_impacts as TickerImpact[] | null) ?? [],
      sourceType: (article.source_type as string | null) ?? undefined,
      whyItMatters: latestFeedItem?.why_it_matters ?? undefined,
      matchedHoldings: latestFeedItem?.holdings ?? undefined,
      relevanceScore: latestFeedItem?.relevance_score ?? null,
      primaryBody,
    },
    holdings: (holdings ?? []).map((row) => ({
      symbol: row.symbol as string,
      company: row.company as string,
      sector: row.sector as string,
    })),
  };
}

async function loadPortfolioQuestionContext(
  supabase: SupabaseClient,
  portfolioId: string,
  userId: string,
) {
  const [{ data: portfolio, error: portfolioError }, overview, holdingsResult, runResult, watchlistResult] =
    await Promise.all([
      supabase
        .from("portfolios")
        .select("id, name")
        .eq("id", portfolioId)
        .eq("user_id", userId)
        .single(),
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
        .eq("status", "complete")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("watchlist_items").select("symbol").eq("user_id", userId),
    ]);

  if (portfolioError || !portfolio) {
    throw new Error(portfolioError?.message ?? "Portfolio not found");
  }
  if (holdingsResult.error) {
    throw new Error(holdingsResult.error.message);
  }
  if (watchlistResult.error) {
    throw new Error(watchlistResult.error.message);
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
      throw new Error(insightsResult.error.message);
    }
    if (feedResult.error) {
      throw new Error(feedResult.error.message);
    }

    insightsRows = insightsResult.data;
    feedRows = feedResult.data;
  }

  return {
    portfolio: {
      name: (portfolio.name as string | null) ?? "My Portfolio",
      totalValue: overview.totalValue,
      dayChange: overview.dayChange,
      lastAnalyzedAt: overview.lastAnalyzedAt,
      coverage: overview.coverage,
      primaryGoal: overview.primaryGoal,
    },
    holdings: (holdingsResult.data ?? []).map((holding) => ({
      symbol: (holding.symbol as string) ?? "",
      company: (holding.company as string) ?? "",
      sector: (holding.sector as string) ?? "Other",
      quantity: Number(holding.quantity ?? 0),
      averageCost: Number(holding.average_cost ?? 0),
      allocation: Number(holding.allocation ?? 0),
      price: Number(holding.current_price ?? holding.price ?? 0),
      dayChange: Number(holding.daily_change ?? 0),
    })),
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
          category: ((news.category as string) ?? "other") as NewsCategory,
          whyItMatters: item.why_it_matters ?? "",
          relevanceScore: Number(item.relevance_score ?? 0),
          holdings: (item.holdings ?? []).map((value) => value.toUpperCase()),
          sectors: item.sectors ?? [],
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
    watchlistSymbols: [...new Set(
      (watchlistResult.data ?? [])
        .map((row) => String(row.symbol ?? "").toUpperCase())
        .filter(Boolean),
    )],
  };
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireAuthedContext();
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get("portfolioId");
  const newsItemId = searchParams.get("newsItemId");

  if (!portfolioId || !newsItemId) {
    return json({ error: "portfolioId and newsItemId are required" }, 400);
  }

  const ownsPortfolio = await verifyPortfolioOwnership(supabase, portfolioId, user.id);
  if (!ownsPortfolio) {
    return json({ error: "Portfolio not found" }, 404);
  }

  try {
    const threadId = await getOrCreateThread(supabase, user.id, portfolioId, newsItemId);
    const messages = await loadMessages(supabase, threadId);
    return json({ threadId, messages });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to load chat" }, 500);
  }
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireAuthedContext();
  if (response) return response;

  let body: {
    portfolioId?: string;
    newsItemId?: string;
    message?: string;
    modelTier?: string;
    history?: unknown;
  } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const portfolioId = body.portfolioId?.trim();
  const newsItemId = body.newsItemId?.trim();
  const message = body.message?.trim();
  const modelTier = parseModelTier(body.modelTier);
  const history = parseHistory(body.history);

  if (!portfolioId || !message) {
    return json({ error: "portfolioId and message are required" }, 400);
  }
  if (!modelTier) {
    return json({ error: "modelTier must be 'free' or 'premium'" }, 400);
  }

  const ownsPortfolio = await verifyPortfolioOwnership(supabase, portfolioId, user.id);
  if (!ownsPortfolio) {
    return json({ error: "Portfolio not found" }, 404);
  }

  const providerId = providerIdForTier(modelTier);
  const ai = getAIProviderById(providerId);

  try {
    if (!newsItemId) {
      const promptContext = await loadPortfolioQuestionContext(supabase, portfolioId, user.id);

      let answer: string;
      try {
        answer = await ai.answerPortfolioQuestion({
          ...promptContext,
          history,
          question: message,
        });
      } catch (err) {
        const aiErr = err instanceof AIChatError ? err : toArticleChatError(err);
        log.error("General article-chat generation failed", {
          code: aiErr.code,
          tier: modelTier,
          provider: providerId,
          deployment: deploymentLabelForLogs(providerId),
          message: aiErr.message,
        });
        return json(
          {
            error: userFacingMessage(aiErr.code),
            code: aiErr.code,
          },
          503,
        );
      }

      return json({
        threadId: null,
        messages: buildEphemeralMessages(history, message, answer),
      });
    }

    const threadId = await getOrCreateThread(supabase, user.id, portfolioId, newsItemId);

    const { error: insertUserError } = await supabase
      .from("article_chat_messages")
      .insert({
        thread_id: threadId,
        role: "user",
        content: message,
      });

    if (insertUserError) {
      return json({ error: insertUserError.message }, 500);
    }

    const recentMessages = await loadMessages(supabase, threadId);
    const promptContext = await loadArticlePromptContext(supabase, portfolioId, newsItemId);

    let answer: string;
    try {
      answer = await ai.answerArticleQuestion({
        ...promptContext,
        history: recentMessages.slice(-12).map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        question: message,
      });
    } catch (err) {
      const aiErr = err instanceof AIChatError ? err : toArticleChatError(err);
      log.error("Article chat generation failed", {
        code: aiErr.code,
        tier: modelTier,
        provider: providerId,
        deployment: deploymentLabelForLogs(providerId),
        message: aiErr.message,
      });
      return json(
        {
          error: userFacingMessage(aiErr.code),
          code: aiErr.code,
        },
        503,
      );
    }

    const { error: insertAssistantError } = await supabase
      .from("article_chat_messages")
      .insert({
        thread_id: threadId,
        role: "assistant",
        content: answer,
      });

    if (insertAssistantError) {
      return json({ error: insertAssistantError.message }, 500);
    }

    const { error: updateThreadError } = await supabase
      .from("article_chat_threads")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId);

    if (updateThreadError) {
      return json({ error: updateThreadError.message }, 500);
    }

    const messages = await loadMessages(supabase, threadId);
    return json({ threadId, messages });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to send chat message" }, 500);
  }
}
