"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { computePortfolioOverview } from "@/lib/services/portfolio";
import {
  parseCSV,
  detectColumnMapping,
  normalizeRows,
} from "@/lib/services/csv-parser";
import { getQuote, getQuotes, searchSymbol } from "@/lib/services/yahoo-finance";
import type {
  Holding,
  HoldingDraft,
  PortfolioFeedHighlight,
  PortfolioPricingRefreshResult,
  SaveMode,
} from "@/lib/types";

const sourceTypeMap = {
  manual: "manual" as const,
  csv: "csv" as const,
  wealthsimple: "wealthsimple" as const,
  "interactive-brokers": "interactive_brokers" as const,
  demo: "demo" as const,
};

function normalizeSaveSourceType(
  raw: string | undefined,
): "manual" | "wealthsimple" | "interactive_brokers" | "demo" | "csv" | null {
  if (!raw) return null;
  const map: Record<string, "manual" | "wealthsimple" | "interactive_brokers" | "demo" | "csv"> = {
    manual: "manual",
    csv: "csv",
    wealthsimple: "wealthsimple",
    interactive_brokers: "interactive_brokers",
    "interactive-brokers": "interactive_brokers",
    demo: "demo",
  };
  return map[raw] ?? null;
}

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
    quantity?: number;
    averageCost?: number;
    importSource?: string;
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
  quantity?: number;
  averageCost?: number;
};

export type SaveHoldingsInput = {
  portfolioId: string | null;
  portfolioName?: string;
  sourceType?: string;
  mode: SaveMode;
  holdings: Array<{
    symbol: string;
    company: string;
    quantity: number;
    averageCost: number;
    sector: string;
    market: string;
    thesis?: string;
    importSource: string;
  }>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapHoldingFromDb(row: any) {
  return {
    id: row.id as string,
    symbol: row.symbol as string,
    company: row.company as string,
    sector: row.sector as string,
    market: row.market as string,
    source: row.source as string,
    price: Number(row.price ?? 0),
    dailyChange: Number(row.daily_change ?? 0),
    allocation: Number(row.allocation ?? 0),
    thesis: (row.thesis as string) ?? "",
    quantity: Number(row.quantity ?? 0),
    averageCost: Number(row.average_cost ?? 0),
    costBasis: Number(row.cost_basis ?? 0),
    currentPrice: Number(row.current_price ?? 0),
    currentValue: Number(row.current_value ?? 0),
    unrealizedGainAmount: Number(row.unrealized_gain_amount ?? 0),
    unrealizedGainPercent: Number(row.unrealized_gain_percent ?? 0),
    quoteCurrency: (row.quote_currency as string) ?? "USD",
    quoteAsOf: (row.quote_as_of as string) ?? null,
    importSource: (row.import_source as string) ?? "manual",
  };
}

async function getOwnedPortfolioContext<T extends string>(
  portfolioId: string,
  select: T,
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { supabase, userId: null, portfolio: null, error: "Unauthorized" as const };
  }

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select(select)
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (!portfolio) {
    return { supabase, userId: user.id, portfolio: null, error: "Portfolio not found" as const };
  }

  return {
    supabase,
    userId: user.id,
    portfolio,
    error: null,
  };
}

async function loadMappedPortfolioHoldings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  portfolioId: string,
): Promise<Holding[]> {
  const { data: holdingsRows } = await supabase
    .from("holdings")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: true });

  return (holdingsRows ?? []).map(mapHoldingFromDb);
}

function revalidateAll() {
  revalidatePath("/portfolio");
  revalidatePath("/portfolio/full");
  revalidatePath("/onboarding");
  revalidatePath("/feed");
  revalidatePath("/analysis");
}

// ─── CSV preview ────────────────────────────────────────────────────────────

export async function previewCSVImport(csvText: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { drafts: [] as HoldingDraft[], needsMapping: false, headers: [] as string[], suggestedMapping: {} as Record<string, number>, error: "Unauthorized" };
  }

  const { headers, rows } = parseCSV(csvText);
  if (headers.length === 0) {
    return { drafts: [], needsMapping: false, headers, suggestedMapping: {}, error: "CSV is empty or invalid" };
  }

  const colResult = detectColumnMapping(headers);

  if (colResult.needsManualMapping) {
    return {
      drafts: [] as HoldingDraft[],
      needsMapping: true,
      headers,
      suggestedMapping: colResult.mapping as Record<string, number>,
      error: null,
    };
  }

  const drafts = normalizeRows(rows, colResult.mapping, colResult.isTransactionFile);

  for (const draft of drafts) {
    if (!draft.symbol) continue;
    try {
      const candidates = await searchSymbol(draft.symbol);
      if (candidates.length > 0) {
        const exact = candidates.find(
          (c) => c.symbol.toUpperCase() === draft.symbol.toUpperCase(),
        );
        if (exact) {
          draft.company = draft.company || exact.name;
          draft.exchange = exact.exchange;
          draft.market = draft.market || exact.exchange;
          if (draft.issues.length === 0) draft.status = "confirmed";
        } else {
          draft.candidates = candidates;
          draft.status = "unresolved";
          draft.issues.push({
            field: "symbol",
            message: `"${draft.symbol}" not found exactly. Choose from candidates.`,
          });
        }
      }
    } catch {
      // Yahoo unavailable; leave as-is
    }
  }

  return { drafts, needsMapping: false, headers, suggestedMapping: colResult.mapping as Record<string, number>, error: null };
}

export async function previewCSVWithMapping(
  csvText: string,
  mapping: Record<string, number>,
  isTransactionFile: boolean,
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { drafts: [] as HoldingDraft[], error: "Unauthorized" };
  }

  const { rows } = parseCSV(csvText);
  const drafts = normalizeRows(rows, mapping, isTransactionFile);

  for (const draft of drafts) {
    if (!draft.symbol) continue;
    try {
      const candidates = await searchSymbol(draft.symbol);
      if (candidates.length > 0) {
        const exact = candidates.find(
          (c) => c.symbol.toUpperCase() === draft.symbol.toUpperCase(),
        );
        if (exact) {
          draft.company = draft.company || exact.name;
          draft.exchange = exact.exchange;
          draft.market = draft.market || exact.exchange;
          if (draft.issues.length === 0) draft.status = "confirmed";
        } else {
          draft.candidates = candidates;
          draft.status = "unresolved";
          draft.issues.push({
            field: "symbol",
            message: `"${draft.symbol}" not found exactly. Choose from candidates.`,
          });
        }
      }
    } catch {
      // Yahoo unavailable
    }
  }

  return { drafts, error: null };
}

// ─── Symbol resolution ──────────────────────────────────────────────────────

export async function resolveSymbol(query: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { candidates: [] as Array<{ symbol: string; name: string; exchange: string; type: string }>, error: "Unauthorized" };

  const candidates = await searchSymbol(query);
  return { candidates, error: null };
}

// ─── Save holdings ──────────────────────────────────────────────────────────

export async function saveHoldings(input: SaveHoldingsInput) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Unauthorized", portfolioId: null as string | null };
  }

  let portfolioId = input.portfolioId;

  if (!portfolioId) {
    const { data: portfolio, error: portfolioError } = await supabase
      .from("portfolios")
      .insert({
        user_id: user.id,
        name: input.portfolioName ?? "My Portfolio",
        source_type: input.sourceType ?? "manual",
        sync_status: "active",
      })
      .select("id")
      .single();

    if (portfolioError || !portfolio) {
      return { error: portfolioError?.message ?? "Failed to create portfolio", portfolioId: null };
    }
    portfolioId = portfolio.id;
  } else {
    const { data: existing } = await supabase
      .from("portfolios")
      .select("id")
      .eq("id", portfolioId)
      .eq("user_id", user.id)
      .single();
    if (!existing) {
      return { error: "Portfolio not found or unauthorized", portfolioId: null };
    }
  }

  if (input.mode === "replace") {
    await supabase.from("holdings").delete().eq("portfolio_id", portfolioId);
  }

  if (input.mode === "merge") {
    const { data: existingHoldings } = await supabase
      .from("holdings")
      .select("id, symbol")
      .eq("portfolio_id", portfolioId);

    const existingMap = new Map(
      (existingHoldings ?? []).map((h) => [h.symbol.toUpperCase(), h.id]),
    );

    for (const h of input.holdings) {
      const existingId = existingMap.get(h.symbol.toUpperCase());
      if (existingId) {
        await supabase
          .from("holdings")
          .update({
            company: h.company,
            quantity: h.quantity,
            average_cost: h.averageCost,
            sector: h.sector,
            market: h.market,
            source: h.importSource === "csv" ? "CSV Import" : "Manual",
            thesis: h.thesis || null,
            import_source: h.importSource,
          })
          .eq("id", existingId);
      } else {
        await supabase.from("holdings").insert({
          portfolio_id: portfolioId,
          symbol: h.symbol.toUpperCase(),
          company: h.company,
          sector: h.sector,
          market: h.market,
          source: h.importSource === "csv" ? "CSV Import" : "Manual",
          quantity: h.quantity,
          average_cost: h.averageCost,
          thesis: h.thesis || null,
          import_source: h.importSource,
        });
      }
    }
  } else {
    const holdingsRows = input.holdings.map((h) => ({
      portfolio_id: portfolioId!,
      symbol: h.symbol.toUpperCase(),
      company: h.company,
      sector: h.sector,
      market: h.market,
      source: h.importSource === "csv" ? "CSV Import" : "Manual",
      quantity: h.quantity,
      average_cost: h.averageCost,
      thesis: h.thesis || null,
      import_source: h.importSource,
    }));

    if (holdingsRows.length > 0) {
      const { error: insertErr } = await supabase.from("holdings").insert(holdingsRows);
      if (insertErr) {
        return { error: insertErr.message, portfolioId: null };
      }
    }
  }

  const nextSourceType = normalizeSaveSourceType(input.sourceType);
  if (nextSourceType) {
    await supabase
      .from("portfolios")
      .update({
        source_type: nextSourceType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", portfolioId)
      .eq("user_id", user.id);
  }

  // Enrich with live quotes
  const { data: allHoldings } = await supabase
    .from("holdings")
    .select("id, symbol, quantity")
    .eq("portfolio_id", portfolioId);

  if (allHoldings && allHoldings.length > 0) {
    const symbols = allHoldings.map((h) => h.symbol as string);
    try {
      const quotes = await getQuotes(symbols);
      let totalValue = 0;

      for (const h of allHoldings) {
        const q = quotes.get((h.symbol as string).toUpperCase());
        if (q) {
          await supabase
            .from("holdings")
            .update({
              price: q.price,
              current_price: q.price,
              daily_change: q.dailyChange,
              quote_currency: q.currency,
              quote_as_of: new Date().toISOString(),
            })
            .eq("id", h.id);
          totalValue += Number(h.quantity) * q.price;
        }
      }

      // Recompute allocation based on value weight
      if (totalValue > 0) {
        for (const h of allHoldings) {
          const q = quotes.get((h.symbol as string).toUpperCase());
          const posValue = Number(h.quantity) * (q?.price ?? 0);
          const allocation = (posValue / totalValue) * 100;
          await supabase
            .from("holdings")
            .update({ allocation: Math.round(allocation * 100) / 100 })
            .eq("id", h.id);
        }
      }
    } catch {
      // Yahoo unavailable; holdings saved without live prices
    }
  }

  await supabase
    .from("portfolios")
    .update({
      last_synced_at: new Date().toISOString(),
      sync_status: "active",
    })
    .eq("id", portfolioId);

  revalidateAll();
  return { error: null, portfolioId };
}

// ─── Legacy create (kept for backward compat) ───────────────────────────────

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
      quantity: h.quantity ?? 0,
      average_cost: h.averageCost ?? 0,
      import_source: h.importSource ?? "manual",
    }));
    const { error: holdingsError } = await supabase.from("holdings").insert(holdingsRows);
    if (holdingsError) {
      return { error: holdingsError.message, portfolioId: null };
    }
  }

  revalidateAll();
  return { error: null, portfolioId: portfolio.id };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

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

// ─── Mutations ──────────────────────────────────────────────────────────────

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
  if (data.quantity != null) update.quantity = data.quantity;
  if (data.averageCost != null) update.average_cost = data.averageCost;

  if (Object.keys(update).length === 0) {
    return { error: null };
  }

  const { error } = await supabase.from("holdings").update(update).eq("id", holdingId);
  if (error) return { error: error.message };
  revalidatePath("/portfolio");
  revalidatePath("/portfolio/full");
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
  revalidatePath("/portfolio/full");
  revalidatePath("/onboarding");
  return { error: null };
}

/**
 * Add a single new position to an existing portfolio (full portfolio & similar flows).
 * Resolves the ticker via Yahoo search/quote, then refreshes live prices.
 */
export async function addPortfolioPosition(
  portfolioId: string,
  input: {
    symbol: string;
    quantity: number;
    averageCost: number;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Unauthorized" as string };
  }

  const rawSymbol = input.symbol.trim();
  if (!rawSymbol) {
    return { error: "Enter a ticker symbol." };
  }

  const quantity = Number(input.quantity);
  const averageCost = Number(input.averageCost);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: "Quantity must be greater than zero." };
  }
  if (!Number.isFinite(averageCost) || averageCost < 0) {
    return { error: "Average cost must be zero or positive." };
  }

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();
  if (!portfolio) {
    return { error: "Portfolio not found or unauthorized." };
  }

  const upper = rawSymbol.toUpperCase();
  const candidates = await searchSymbol(rawSymbol);
  const resolved =
    candidates.find((c) => c.symbol.toUpperCase() === upper) ?? candidates[0];

  let symbol = upper;
  let company = upper;
  let market = "US";

  if (resolved) {
    symbol = resolved.symbol.toUpperCase();
    company = resolved.name?.trim() || symbol;
    market = resolved.exchange?.trim() || "US";
  } else {
    const quote = await getQuote(upper);
    if (!quote) {
      return {
        error:
          "Could not resolve that symbol. Try a valid ticker (e.g. AAPL, MSFT).",
      };
    }
    symbol = quote.symbol.toUpperCase();
    company = quote.name;
    market = quote.exchange || "US";
  }

  const { data: existing } = await supabase
    .from("holdings")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .eq("symbol", symbol)
    .maybeSingle();

  if (existing) {
    return {
      error: `You already hold ${symbol}. Edit that row or remove it before adding again.`,
    };
  }

  const { error: insertError } = await supabase.from("holdings").insert({
    portfolio_id: portfolioId,
    symbol,
    company,
    sector: "Other",
    market,
    source: "Manual",
    quantity,
    average_cost: averageCost,
    thesis: null,
    import_source: "manual",
  });

  if (insertError) {
    return { error: insertError.message };
  }

  await refreshHoldingPrices(portfolioId);
  return { error: null };
}

/**
 * Record a sale: reduce share count. If all shares are sold, the holding is removed.
 */
export async function recordHoldingSale(
  portfolioId: string,
  holdingId: string,
  sharesSold: number,
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Unauthorized" };

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();
  if (!portfolio) return { error: "Portfolio not found or unauthorized." };

  const { data: row, error: rowError } = await supabase
    .from("holdings")
    .select("id, quantity, average_cost")
    .eq("id", holdingId)
    .eq("portfolio_id", portfolioId)
    .single();

  if (rowError || !row) return { error: "Holding not found." };

  const qty = Number(row.quantity);
  const sold = Number(sharesSold);
  if (!Number.isFinite(sold) || sold <= 0) {
    return { error: "Enter a positive number of shares sold." };
  }
  if (sold > qty + 1e-9) {
    return { error: "You can't sell more shares than you currently hold." };
  }

  const newQty = qty - sold;
  const EPS = 1e-8;

  if (newQty <= EPS) {
    const { error: delErr } = await supabase
      .from("holdings")
      .delete()
      .eq("id", holdingId);
    if (delErr) return { error: delErr.message };
  } else {
    const { error: upErr } = await supabase
      .from("holdings")
      .update({ quantity: newQty })
      .eq("id", holdingId);
    if (upErr) return { error: upErr.message };
  }

  await refreshHoldingPrices(portfolioId);
  return { error: null };
}

/**
 * Record additional shares: weighted average cost for the position.
 */
export async function recordHoldingAdd(
  portfolioId: string,
  holdingId: string,
  sharesAdded: number,
  pricePerShare: number,
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { error: "Unauthorized" };

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();
  if (!portfolio) return { error: "Portfolio not found or unauthorized." };

  const { data: row, error: rowError } = await supabase
    .from("holdings")
    .select("id, quantity, average_cost")
    .eq("id", holdingId)
    .eq("portfolio_id", portfolioId)
    .single();

  if (rowError || !row) return { error: "Holding not found." };

  const qty = Number(row.quantity);
  const avg = Number(row.average_cost);
  const addQty = Number(sharesAdded);
  const price = Number(pricePerShare);

  if (!Number.isFinite(addQty) || addQty <= 0) {
    return { error: "Added shares must be greater than zero." };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { error: "Price per share must be zero or positive." };
  }

  const newQty = qty + addQty;
  const newAvg = (qty * avg + addQty * price) / newQty;
  const roundedAvg = Math.round(newAvg * 10000) / 10000;

  const { error: upErr } = await supabase
    .from("holdings")
    .update({
      quantity: newQty,
      average_cost: roundedAvg,
    })
    .eq("id", holdingId);

  if (upErr) return { error: upErr.message };

  await refreshHoldingPrices(portfolioId);
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
    .in("status", ["complete", "degraded"])
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

export async function getPortfolioFeedHighlights(portfolioId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { data: [] as PortfolioFeedHighlight[], error: "Unauthorized" };

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();
  if (!portfolio) return { data: [] as PortfolioFeedHighlight[], error: "Portfolio not found" };

  const { data: run } = await supabase
    .from("analysis_runs")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .in("status", ["complete", "degraded"])
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) return { data: [] as PortfolioFeedHighlight[], error: null };

  const { data: rows, error } = await supabase
    .from("feed_items")
    .select(`
      relevance_score,
      why_it_matters,
      holdings,
      sectors,
      ai_summary,
      match_reason_codes,
      news_items (
        headline,
        source,
        published_at,
        category
      )
    `)
    .eq("analysis_run_id", run.id)
    .eq("portfolio_id", portfolioId)
    .order("relevance_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    return { data: [] as PortfolioFeedHighlight[], error: error.message };
  }

  const highlights = (rows ?? [])
    .map<PortfolioFeedHighlight | null>((row) => {
      const news = Array.isArray(row.news_items) ? row.news_items[0] : row.news_items;
      if (!news) return null;

      return {
        headline: (news.headline as string) ?? "Untitled story",
        source: (news.source as string) ?? "Unknown source",
        publishedAt: (news.published_at as string) ?? new Date().toISOString(),
        category: ((news.category as string) ?? "other") as PortfolioFeedHighlight["category"],
        relevanceScore: Number(row.relevance_score ?? 0),
        whyItMatters: (row.why_it_matters as string | null) ?? "",
        holdings: ((row.holdings as string[] | null) ?? []).map((item) => item.toUpperCase()),
        sectors: (row.sectors as string[] | null) ?? [],
        aiSummary: (row.ai_summary as string | null) ?? "",
        matchReasonCodes: (row.match_reason_codes as PortfolioFeedHighlight["matchReasonCodes"]) ?? [],
      };
    })
    .filter((item): item is PortfolioFeedHighlight => item !== null);

  return { data: highlights, error: null };
}

type SyncHoldingPricesResult = {
  status: "updated" | "no_quotes" | "error";
  updated: number;
  error: string | null;
  message: string | null;
  /** When true, safe to call revalidatePath (not during RSC render). */
  shouldRevalidate: boolean;
};

const DEFAULT_PRICE_SYNC_MIN_AGE_MS = 5 * 60_000;

/**
 * Update holding prices in the database from live quotes. Does not call revalidatePath —
 * safe to await from Server Components (e.g. /portfolio/full on each visit).
 */
export async function syncHoldingPrices(portfolioId: string): Promise<{
  updated: number;
  error: string | null;
}> {
  const r = await syncHoldingPricesInternal(portfolioId);
  return { updated: r.updated, error: r.error };
}

export async function syncHoldingPricesIfStale(
  portfolioId: string,
  config?: { minAgeMs?: number },
): Promise<{ updated: number; skipped: boolean; error: string | null }> {
  const minAgeMs = Math.max(0, config?.minAgeMs ?? DEFAULT_PRICE_SYNC_MIN_AGE_MS);

  const context = await getOwnedPortfolioContext(portfolioId, "id, last_synced_at");
  if (context.error === "Unauthorized" || !context.userId) {
    return { updated: 0, skipped: false, error: "Unauthorized" };
  }
  if (context.error === "Portfolio not found" || !context.portfolio) {
    return { updated: 0, skipped: false, error: "Portfolio not found" };
  }

  const { data: holdings } = await context.supabase
    .from("holdings")
    .select("id, quote_as_of")
    .eq("portfolio_id", portfolioId);

  if (!holdings || holdings.length === 0) {
    return { updated: 0, skipped: true, error: null };
  }

  const lastSyncedMs = context.portfolio.last_synced_at
    ? Date.parse(String(context.portfolio.last_synced_at))
    : Number.NaN;

  let latestQuoteAsOfMs = Number.NaN;
  for (const holding of holdings) {
    const quoteAsOfMs = holding.quote_as_of
      ? Date.parse(String(holding.quote_as_of))
      : Number.NaN;
    if (
      Number.isFinite(quoteAsOfMs) &&
      (!Number.isFinite(latestQuoteAsOfMs) || quoteAsOfMs > latestQuoteAsOfMs)
    ) {
      latestQuoteAsOfMs = quoteAsOfMs;
    }
  }

  const freshestKnownMs = Math.max(
    Number.isFinite(lastSyncedMs) ? lastSyncedMs : -1,
    Number.isFinite(latestQuoteAsOfMs) ? latestQuoteAsOfMs : -1,
  );

  if (freshestKnownMs > 0 && Date.now() - freshestKnownMs < minAgeMs) {
    return { updated: 0, skipped: true, error: null };
  }

  const r = await syncHoldingPricesInternal(portfolioId);
  return { updated: r.updated, skipped: false, error: r.error };
}

export async function refreshPortfolioPricingSnapshot(
  portfolioId: string,
  options?: { includeHoldings?: boolean },
): Promise<PortfolioPricingRefreshResult> {
  const r = await syncHoldingPricesInternal(portfolioId);

  if (r.status === "error") {
    return {
      status: "error",
      updated: r.updated,
      message: r.message ?? r.error ?? "Refresh failed.",
      overview: null,
      holdings: options?.includeHoldings ? null : undefined,
    };
  }

  if (r.status === "no_quotes") {
    return {
      status: "no_quotes",
      updated: 0,
      message: r.message ?? "Live quotes are unavailable right now. Try again shortly.",
      overview: null,
      holdings: options?.includeHoldings ? null : undefined,
    };
  }

  const context = await getOwnedPortfolioContext(portfolioId, "id");
  if (context.error === "Unauthorized") {
    return {
      status: "error",
      updated: 0,
      message: "Unauthorized",
      overview: null,
      holdings: options?.includeHoldings ? null : undefined,
    };
  }
  if (context.error === "Portfolio not found" || !context.portfolio) {
    return {
      status: "error",
      updated: 0,
      message: "Portfolio not found",
      overview: null,
      holdings: options?.includeHoldings ? null : undefined,
    };
  }

  if (r.shouldRevalidate) {
    revalidateAll();
  }

  const overview = await computePortfolioOverview(context.supabase, portfolioId);
  const holdings = options?.includeHoldings
    ? await loadMappedPortfolioHoldings(context.supabase, portfolioId)
    : undefined;

  return {
    status: "updated",
    updated: r.updated,
    message:
      r.message ??
      (r.updated === 1 ? "Updated 1 holding." : `Updated ${r.updated} holdings.`),
    overview,
    holdings,
  };
}

/**
 * Same DB work as syncHoldingPrices, then invalidates cached routes. Only call from
 * Server Actions, route handlers, or client-triggered flows — not during RSC render.
 */
export async function refreshHoldingPrices(portfolioId: string) {
  const r = await syncHoldingPricesInternal(portfolioId);
  if (r.shouldRevalidate) {
    revalidateAll();
  }
  return { updated: r.updated, error: r.error };
}

async function syncHoldingPricesInternal(
  portfolioId: string,
): Promise<SyncHoldingPricesResult> {
  const context = await getOwnedPortfolioContext(portfolioId, "id");
  if (context.error === "Unauthorized" || !context.userId) {
    return {
      status: "error",
      updated: 0,
      error: "Unauthorized",
      message: "Unauthorized",
      shouldRevalidate: false,
    };
  }
  if (context.error === "Portfolio not found" || !context.portfolio) {
    return {
      status: "error",
      updated: 0,
      error: "Portfolio not found",
      message: "Portfolio not found",
      shouldRevalidate: false,
    };
  }

  const { data: holdings } = await context.supabase
    .from("holdings")
    .select("id, symbol, quantity")
    .eq("portfolio_id", portfolioId);

  if (!holdings || holdings.length === 0) {
    return {
      status: "error",
      updated: 0,
      error: "No holdings to refresh",
      message: "No holdings to refresh.",
      shouldRevalidate: false,
    };
  }

  const symbols = holdings.map((h) => h.symbol as string);
  let quotes: Map<string, { price: number; dailyChange: number; currency?: string }>;
  try {
    quotes = await getQuotes(symbols);
  } catch {
    return {
      status: "no_quotes",
      updated: 0,
      error: null,
      message: "Live quotes are unavailable right now. Try again shortly.",
      shouldRevalidate: false,
    };
  }

  if (quotes.size === 0) {
    return {
      status: "no_quotes",
      updated: 0,
      error: null,
      message: "No live quotes were returned. Try again shortly.",
      shouldRevalidate: false,
    };
  }

  const now = new Date().toISOString();
  let totalValue = 0;

  const matched = holdings
    .map((h) => {
      const quote = quotes.get((h.symbol as string).toUpperCase());
      if (!quote) return null;
      const posValue = Number(h.quantity) * quote.price;
      totalValue += posValue;
      return { id: h.id as string, quote, posValue };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  if (matched.length === 0) {
    return {
      status: "no_quotes",
      updated: 0,
      error: null,
      message: "No live quotes matched your holdings. Try again shortly.",
      shouldRevalidate: false,
    };
  }

  let updated = 0;

  for (const matchedHolding of matched) {
    const holdingUpdate = {
      price: matchedHolding.quote.price,
      current_price: matchedHolding.quote.price,
      daily_change: matchedHolding.quote.dailyChange,
      quote_currency: matchedHolding.quote.currency,
      quote_as_of: now,
      ...(totalValue > 0
        ? {
            allocation:
              Math.round((matchedHolding.posValue / totalValue) * 10000) / 100,
          }
        : {}),
    };

    const { error: holdingUpdateError } = await context.supabase
      .from("holdings")
      .update(holdingUpdate)
      .eq("id", matchedHolding.id)
      .eq("portfolio_id", portfolioId);

    if (holdingUpdateError) {
      return {
        status: "error",
        updated,
        error: holdingUpdateError.message,
        message:
          updated > 0
            ? "Some refreshed holding prices could not be saved."
            : "Failed to save refreshed holding prices.",
        shouldRevalidate: false,
      };
    }

    updated += 1;
  }

  if (updated === 0) {
    return {
      status: "error",
      updated: 0,
      error: "No holding rows were updated",
      message: "Failed to save refreshed holding prices.",
      shouldRevalidate: false,
    };
  }

  const { error: portfolioUpdateError } = await context.supabase
    .from("portfolios")
    .update({ last_synced_at: now, sync_status: "active" })
    .eq("id", portfolioId);

  if (portfolioUpdateError) {
    return {
      status: "error",
      updated,
      error: portfolioUpdateError.message,
      message: "Refreshed prices saved, but the portfolio sync timestamp could not be updated.",
      shouldRevalidate: false,
    };
  }

  return {
    status: "updated",
    updated,
    error: null,
    message:
      updated === 1 ? "Updated 1 holding." : `Updated ${updated} holdings.`,
    shouldRevalidate: true,
  };
}
