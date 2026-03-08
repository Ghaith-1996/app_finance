import type { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider } from "./ai";

const STAGES = [
  "queued",
  "processing_holdings",
  "mapping_news",
  "generating_insights",
  "complete",
  "failed",
] as const;

type AnalysisStatus = (typeof STAGES)[number];

function toDbSentiment(s: string): "positive" | "watch" | "negative" | "neutral" {
  if (s === "positive" || s === "watch" || s === "negative" || s === "neutral") return s;
  return "neutral";
}

function toDbImpact(s: string): "High" | "Medium" | "Low" {
  if (s === "High" || s === "Medium" || s === "Low") return s;
  return "Low";
}

export async function runAnalysis(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<{ runId: string | null; error: string | null }> {
  const ai = getAIProvider();

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, user_id")
    .eq("id", portfolioId)
    .single();

  if (portfolioError || !portfolio) {
    return { runId: null, error: "Portfolio not found" };
  }

  const { data: run, error: runError } = await supabase
    .from("analysis_runs")
    .insert({
      portfolio_id: portfolioId,
      status: "queued",
      progress: 0,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError || !run) {
    return { runId: null, error: runError?.message ?? "Failed to create run" };
  }

  const runId = run.id;

  const updateRun = async (status: AnalysisStatus, progress: number) => {
    await supabase
      .from("analysis_runs")
      .update({
        status,
        progress,
        ...(status === "complete" || status === "failed"
          ? { completed_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", runId);
  };

  try {
    await updateRun("processing_holdings", 15);

    const { data: holdingsRows, error: holdingsError } = await supabase
      .from("holdings")
      .select("id, symbol, company, sector, market, source, price, daily_change, allocation, thesis")
      .eq("portfolio_id", portfolioId);

    if (holdingsError) {
      await updateRun("failed", 0);
      return { runId, error: holdingsError.message };
    }

    const holdings = (holdingsRows ?? []).map((r) => ({
      id: r.id,
      symbol: r.symbol,
      company: r.company,
      sector: r.sector,
      market: r.market,
      source: r.source,
      price: Number(r.price),
      dailyChange: Number(r.daily_change),
      allocation: Number(r.allocation),
      thesis: r.thesis ?? "",
    }));

    await updateRun("mapping_news", 35);

    const { data: newsRows, error: newsError } = await supabase
      .from("news_items")
      .select("id, headline, source, url, published_at, angle, raw_content")
      .order("published_at", { ascending: false })
      .limit(30);

    if (newsError) {
      await updateRun("failed", 0);
      return { runId, error: newsError.message };
    }

    const newsItems = newsRows ?? [];
    const symbols = new Set(holdings.map((h) => h.symbol.toUpperCase()));
    const sectors = new Set(holdings.map((h) => h.sector));
    const companies = new Set(holdings.map((h) => h.company.toLowerCase()));

    const symbolRegexes = [...symbols].map(
      (s) => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
    );

    const matched = newsItems.filter((n) => {
      const text = `${n.headline} ${n.raw_content ?? ""}`;
      const hasSymbol = symbolRegexes.some((re) => re.test(text));
      const hasCompany = [...companies].some((c) => text.toLowerCase().includes(c));
      const hasSector = [...sectors].some((s) => text.toLowerCase().includes(s.toLowerCase()));
      return hasSymbol || hasCompany || hasSector;
    });

    if (matched.length === 0 && newsItems.length > 0) {
      matched.push(...newsItems.slice(0, 5));
    } else if (matched.length === 0) {
      await updateRun("complete", 100);
      return { runId, error: null };
    }

    await updateRun("generating_insights", 50);

    const newsContexts = matched.map((n) => ({
      headline: n.headline,
      source: n.source,
      rawContent: n.raw_content ?? undefined,
      publishedAt: n.published_at,
      angle: n.angle ?? undefined,
    }));

    const insights = await ai.generateInsights(holdings, newsContexts);

    await supabase.from("portfolio_insights").insert(
      insights.map((i) => ({
        analysis_run_id: runId,
        portfolio_id: portfolioId,
        title: i.title,
        value: i.value,
        detail: i.detail,
      }))
    );

    let step = 0;
    const total = matched.length;
    for (const news of matched) {
      const article = `${news.headline}. ${news.raw_content ?? ""}`;
      const [summary, sentiment, relevance, whyItMatters] = await Promise.all([
        ai.generateSummary(article, holdings),
        ai.scoreSentiment(article),
        ai.scoreRelevance(article, holdings),
        ai.explainWhyItMatters(article, holdings),
      ]);

      const matchedHoldings = holdings
        .filter(
          (h) =>
            article.toLowerCase().includes(h.symbol.toLowerCase()) ||
            article.toLowerCase().includes(h.sector.toLowerCase())
        )
        .map((h) => h.symbol);
      const matchedSectors = [...new Set(holdings.filter((h) => matchedHoldings.includes(h.symbol)).map((h) => h.sector))];
      if (matchedHoldings.length === 0) {
        matchedHoldings.push(holdings[0]?.symbol ?? "—");
        matchedSectors.push(holdings[0]?.sector ?? "—");
      }

      await supabase.from("feed_items").insert({
        analysis_run_id: runId,
        news_item_id: news.id,
        portfolio_id: portfolioId,
        relevance_score: relevance,
        sentiment: toDbSentiment(sentiment),
        impact: toDbImpact(relevance >= 80 ? "High" : relevance >= 60 ? "Medium" : "Low"),
        holdings: matchedHoldings,
        sectors: matchedSectors,
        ai_summary: summary,
        why_it_matters: whyItMatters,
      });

      step++;
      await updateRun(
        "generating_insights",
        50 + Math.floor((step / total) * 45)
      );
    }

    await updateRun("complete", 100);
    return { runId, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    await updateRun("failed", 0);
    return { runId, error: message };
  }
}
