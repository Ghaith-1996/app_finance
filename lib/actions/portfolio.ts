"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computePortfolioOverview } from "@/lib/services/portfolio";
import { getQuotes } from "@/lib/services/yahoo-finance";

const sourceTypeMap = {
  manual: "manual" as const,
  wealthsimple: "wealthsimple" as const,
  "interactive-brokers": "interactive_brokers" as const,
  demo: "demo" as const,
};

export type CreatePortfolioInput = {
  name?: string;
  sourceType: keyof typeof sourceTypeMap;
  holdings: Array<{
    symbol: string;
    company: string;
    sector: string;
    market: string;
    source: string;
    price: number;
    dailyChange: number;
    allocation: number;
    thesis: string;
  }>;
};

export type HoldingInput = {
  symbol?: string;
  company?: string;
  sector?: string;
  market?: string;
  source?: string;
  price?: number;
  dailyChange?: number;
  allocation?: number;
  thesis?: string;
};

function mapHoldingFromDb(row: {
  id: string;
  symbol: string;
  company: string;
  sector: string;
  market: string;
  source: string;
  price: number;
  daily_change: number;
  allocation: number;
  thesis: string | null;
}) {
  return {
    id: row.id,
    symbol: row.symbol,
    company: row.company,
    sector: row.sector,
    market: row.market,
    source: row.source,
    price: Number(row.price),
    dailyChange: Number(row.daily_change),
    allocation: Number(row.allocation),
    thesis: row.thesis ?? "",
  };
}

export async function createPortfolio(data: CreatePortfolioInput) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Unauthorized", portfolioId: null as string | null };
  }

  const sourceType = sourceTypeMap[data.sourceType] ?? "manual";
  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .insert({
      user_id: user.id,
      name: data.name ?? "My Portfolio",
      source_type: sourceType,
      sync_status: "active",
    })
    .select("id")
    .single();

  if (portfolioError || !portfolio) {
    return { error: portfolioError?.message ?? "Failed to create portfolio", portfolioId: null };
  }

  if (data.holdings.length > 0) {
    const holdingsRows = data.holdings.map((h) => ({
      portfolio_id: portfolio.id,
      symbol: h.symbol,
      company: h.company,
      sector: h.sector,
      market: h.market,
      source: h.source,
      price: h.price,
      daily_change: h.dailyChange,
      allocation: h.allocation,
      thesis: h.thesis || null,
    }));
    const { error: holdingsError } = await supabase.from("holdings").insert(holdingsRows);
    if (holdingsError) {
      return { error: holdingsError.message, portfolioId: null };
    }
  }

  revalidatePath("/portfolio");
  revalidatePath("/onboarding");
  revalidatePath("/feed");
  revalidatePath("/analysis");
  return { error: null, portfolioId: portfolio.id };
}

export async function getPortfolio(portfolioId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { data: null, error: "Unauthorized" };

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("*")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (portfolioError || !portfolio) {
    return { data: null, error: portfolioError?.message ?? "Not found" };
  }

  const { data: holdingsRows, error: holdingsError } = await supabase
    .from("holdings")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: true });

  if (holdingsError) {
    return { data: null, error: holdingsError.message };
  }

  const holdings = (holdingsRows ?? []).map(mapHoldingFromDb);
  return {
    data: {
      id: portfolio.id,
      name: portfolio.name,
      sourceType: portfolio.source_type,
      syncStatus: portfolio.sync_status,
      lastSyncedAt: portfolio.last_synced_at,
      createdAt: portfolio.created_at,
      updatedAt: portfolio.updated_at,
      holdings,
    },
    error: null,
  };
}

export async function getUserPortfolios() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { data: [], error: "Unauthorized" };

  const { data: rows, error } = await supabase
    .from("portfolios")
    .select("id, name, source_type, sync_status, last_synced_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return {
    data: (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      sourceType: r.source_type,
      syncStatus: r.sync_status,
      lastSyncedAt: r.last_synced_at,
      createdAt: r.created_at,
    })),
    error: null,
  };
}

export async function updateHolding(holdingId: string, data: HoldingInput) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Unauthorized" };

  const update: Record<string, unknown> = {};
  if (data.symbol != null) update.symbol = data.symbol;
  if (data.company != null) update.company = data.company;
  if (data.sector != null) update.sector = data.sector;
  if (data.market != null) update.market = data.market;
  if (data.source != null) update.source = data.source;
  if (data.price != null) update.price = data.price;
  if (data.dailyChange != null) update.daily_change = data.dailyChange;
  if (data.allocation != null) update.allocation = data.allocation;
  if (data.thesis != null) update.thesis = data.thesis;

  if (Object.keys(update).length === 0) {
    return { error: null };
  }

  const { error } = await supabase.from("holdings").update(update).eq("id", holdingId);
  if (error) return { error: error.message };
  revalidatePath("/portfolio");
  revalidatePath("/onboarding");
  return { error: null };
}

export async function deleteHolding(holdingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Unauthorized" };

  const { error } = await supabase.from("holdings").delete().eq("id", holdingId);
  if (error) return { error: error.message };
  revalidatePath("/portfolio");
  revalidatePath("/onboarding");
  return { error: null };
}

export async function getPortfolioOverview(portfolioId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { data: null, error: "Unauthorized" };

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();
  if (!portfolio) return { data: null, error: "Portfolio not found" };

  const overview = await computePortfolioOverview(supabase, portfolioId);
  return { data: overview, error: null };
}

export async function getPortfolioInsights(portfolioId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { data: [], error: "Unauthorized" };

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();
  if (!portfolio) return { data: [], error: "Portfolio not found" };

  const { data: run } = await supabase
    .from("analysis_runs")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .eq("status", "complete")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) return { data: [], error: null };

  const { data: rows } = await supabase
    .from("portfolio_insights")
    .select("title, value, detail")
    .eq("analysis_run_id", run.id)
    .order("created_at", { ascending: true });

  const insights = (rows ?? []).map((r) => ({
    title: r.title,
    value: r.value,
    detail: r.detail,
  }));
  return { data: insights, error: null };
}

export async function refreshHoldingPrices(portfolioId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { updated: 0, error: "Unauthorized" };

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();
  if (!portfolio) return { updated: 0, error: "Portfolio not found" };

  const { data: holdings } = await supabase
    .from("holdings")
    .select("id, symbol")
    .eq("portfolio_id", portfolioId);

  if (!holdings || holdings.length === 0) {
    return { updated: 0, error: null };
  }

  const symbols = holdings.map((h) => h.symbol);
  const quotes = await getQuotes(symbols);
  let updated = 0;

  for (const holding of holdings) {
    const quote = quotes.get(holding.symbol.toUpperCase());
    if (!quote) continue;

    const { error } = await supabase
      .from("holdings")
      .update({
        price: quote.price,
        daily_change: quote.dailyChange,
      })
      .eq("id", holding.id);

    if (!error) updated++;
  }

  await supabase
    .from("portfolios")
    .update({
      last_synced_at: new Date().toISOString(),
      sync_status: "active",
    })
    .eq("id", portfolioId);

  revalidatePath("/portfolio");
  revalidatePath("/feed");
  revalidatePath("/analysis");
  return { updated, error: null };
}
