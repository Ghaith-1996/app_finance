import { getAIProvider } from "@/lib/services/ai";
import { computePortfolioOverview } from "@/lib/services/portfolio";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstileToken, getClientIp } from "@/lib/security/turnstile";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type ChatHistoryItem = {
  role?: string;
  content?: string;
};

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
    history?: ChatHistoryItem[];
    watchlistSymbols?: string[];
    turnstileToken?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const turnstileResult = await verifyTurnstileToken({
    token: body.turnstileToken,
    remoteIp: getClientIp(request),
  });
  if (!turnstileResult.success) {
    return json({ error: turnstileResult.message, code: "turnstile_failed" }, 403);
  }

  const portfolioId = body.portfolioId?.trim();
  const message = body.message?.trim();
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
          content: item.content.trim(),
        }))
    : [];

  if (!portfolioId || !message) {
    return json({ error: "portfolioId and message are required" }, 400);
  }

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id, name")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (!portfolio) {
    return json({ error: "Portfolio not found" }, 404);
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
        .eq("status", "complete")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (holdingsResult.error) {
      return json({ error: holdingsResult.error.message }, 500);
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
        return json({ error: insightsResult.error.message }, 500);
      }
      if (feedResult.error) {
        return json({ error: feedResult.error.message }, 500);
      }

      insightsRows = insightsResult.data;
      feedRows = feedResult.data;
    }

    const ai = getAIProvider();
    const answer = await ai.answerPortfolioQuestion({
      portfolio: {
        name: (portfolio.name as string) ?? "My Portfolio",
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
      history,
      question: message,
    });

    return json({ answer });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Failed to answer question" },
      500,
    );
  }
}
