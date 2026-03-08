import { createClient } from "@/lib/supabase/server";

function minutesAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

function formatPublishedAt(iso: string): string {
  const min = minutesAgo(iso);
  if (min < 60) return `${min} minutes ago`;
  if (min < 120) return "1 hour ago";
  if (min < 180) return "2 hours ago";
  if (min < 1440) return `${Math.floor(min / 60)} hours ago`;
  return `${Math.floor(min / 1440)} days ago`;
}

/**
 * GET /api/feed?portfolioId=...&holding=...&sector=...&maxMinutes=...
 * Returns feed items for the given portfolio (or user's latest portfolio).
 * holding: filter by ticker (e.g. NVDA)
 * sector: filter by sector name
 * maxMinutes: only items published within the last N minutes (e.g. 60, 120)
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(request.url);
  let portfolioId = searchParams.get("portfolioId");
  const holding = searchParams.get("holding");
  const sector = searchParams.get("sector");
  const maxMinutes = searchParams.get("maxMinutes");

  if (!portfolioId) {
    const { data: portfolios } = await supabase
      .from("portfolios")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    portfolioId = portfolios?.[0]?.id ?? null;
  }

  if (!portfolioId) {
    return new Response(
      JSON.stringify({ feed: [], portfolioId: null }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (!portfolio) {
    return new Response(JSON.stringify({ error: "Portfolio not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let query = supabase
    .from("feed_items")
    .select(
      `
      id,
      relevance_score,
      sentiment,
      impact,
      holdings,
      sectors,
      ai_summary,
      why_it_matters,
      news_items!inner (
        id,
        headline,
        source,
        url,
        published_at,
        angle
      )
    `
    )
    .eq("portfolio_id", portfolioId)
    .order("relevance_score", { ascending: false });

  if (holding) {
    query = query.contains("holdings", [holding]);
  }
  if (sector) {
    query = query.contains("sectors", [sector]);
  }

  const { data: rows, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  type Row = {
    id: string;
    relevance_score: number;
    sentiment: string;
    impact: string;
    holdings: string[];
    sectors: string[];
    ai_summary: string | null;
    why_it_matters: string | null;
    news_items: {
      id: string;
      headline: string;
      source: string;
      url: string | null;
      published_at: string;
      angle: string | null;
    } | null;
  };

  const rawRows = (rows ?? []) as unknown as Row[];
  let feed = rawRows.map((row) => {
    const news = row.news_items ?? null;
    const publishedAt = news?.published_at ?? new Date().toISOString();
    const minutesAgoVal = minutesAgo(publishedAt);
    return {
      id: row.id,
      headline: news?.headline ?? "",
      source: news?.source ?? "",
      publishedAt: formatPublishedAt(publishedAt),
      publishedMinutesAgo: minutesAgoVal,
      relevanceScore: row.relevance_score,
      sentiment: row.sentiment,
      impact: row.impact,
      holdings: row.holdings ?? [],
      sectors: row.sectors ?? [],
      aiSummary: row.ai_summary ?? "",
      whyItMatters: row.why_it_matters ?? "",
      angle: news?.angle ?? "",
    };
  });

  if (maxMinutes) {
    const max = parseInt(maxMinutes, 10);
    if (!Number.isNaN(max)) {
      feed = feed.filter((item) => item.publishedMinutesAgo <= max);
    }
  }

  return new Response(
    JSON.stringify({ feed, portfolioId }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
