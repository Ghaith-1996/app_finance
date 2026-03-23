import { createClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/services/ai";
import type { ArticleChatMessage, NewsCategory, TickerImpact } from "@/lib/types";

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
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  supabase: Awaited<ReturnType<typeof createClient>>,
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

async function loadPromptContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  portfolioId: string,
  newsItemId: string,
) {
  const [{ data: article, error: articleError }, { data: holdings, error: holdingsError }] =
    await Promise.all([
      supabase
        .from("news_items")
        .select(
          "headline, source, published_at, category, global_summary, raw_content, stock_tags, ticker_impacts, source_type",
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

  return {
    article: {
      headline: article.headline as string,
      source: article.source as string,
      publishedAt: article.published_at as string,
      category: (article.category ?? "other") as NewsCategory,
      globalSummary: (article.global_summary as string | null) ?? undefined,
      rawContent: (article.raw_content as string | null) ?? undefined,
      stockTags: ((article.stock_tags as string[] | null) ?? []).map((tag) => tag.toUpperCase()),
      tickerImpacts: (article.ticker_impacts as TickerImpact[] | null) ?? [],
      sourceType: (article.source_type as string | null) ?? undefined,
      whyItMatters: latestFeedItem?.why_it_matters ?? undefined,
      matchedHoldings: latestFeedItem?.holdings ?? undefined,
      relevanceScore: latestFeedItem?.relevance_score ?? null,
    },
    holdings: (holdings ?? []).map((row) => ({
      symbol: row.symbol as string,
      company: row.company as string,
      sector: row.sector as string,
    })),
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

  let body: { portfolioId?: string; newsItemId?: string; message?: string } = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const portfolioId = body.portfolioId?.trim();
  const newsItemId = body.newsItemId?.trim();
  const message = body.message?.trim();

  if (!portfolioId || !newsItemId || !message) {
    return json({ error: "portfolioId, newsItemId, and message are required" }, 400);
  }

  const ownsPortfolio = await verifyPortfolioOwnership(supabase, portfolioId, user.id);
  if (!ownsPortfolio) {
    return json({ error: "Portfolio not found" }, 404);
  }

  try {
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
    const history = recentMessages.slice(-12).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
    const promptContext = await loadPromptContext(supabase, portfolioId, newsItemId);

    const ai = getAIProvider();
    const answer = await ai.answerArticleQuestion({
      ...promptContext,
      history,
      question: message,
    });

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
