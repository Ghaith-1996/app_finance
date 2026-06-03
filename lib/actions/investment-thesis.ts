"use server";

import { revalidatePath } from "next/cache";

import type {
  InvestmentThesis,
  InvestmentThesisConviction,
  InvestmentThesisHistoryItem,
  InvestmentThesisHistoryRow,
  InvestmentThesisHorizon,
  InvestmentThesisRow,
  InvestmentThesisScope,
} from "@/lib/investment-theses/types";
import {
  mapInvestmentThesisHistoryRow,
  mapInvestmentThesisRow,
  normalizeRiskList,
  normalizeThesisConviction,
  normalizeThesisHorizon,
  normalizeThesisScope,
  normalizeThesisSymbol,
  normalizeThesisText,
} from "@/lib/investment-theses/utils";
import { THESIS_COLUMNS } from "@/lib/server/investment-theses";
import { createClient } from "@/lib/supabase/server";

type ThesisActionResult =
  | { ok: true; thesis: InvestmentThesis | null; history?: InvestmentThesisHistoryItem[] }
  | { ok: false; error: string };

type ThesisInput = {
  symbol: string;
  portfolioId?: string | null;
  scope?: InvestmentThesisScope;
};

type SaveThesisInput = ThesisInput & {
  thesis: string;
  risks: string[] | string;
  invalidationNotes: string;
  horizon: InvestmentThesisHorizon | string;
  conviction: InvestmentThesisConviction | string;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

async function canUsePortfolio(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  portfolioId: string,
) {
  const { data } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data?.id);
}

function resolveScope(input: ThesisInput): InvestmentThesisScope {
  return input.portfolioId ? "holding" : normalizeThesisScope(input.scope);
}

async function findExistingThesis(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: Required<Pick<ThesisInput, "symbol">> & {
    portfolioId: string | null;
    scope: InvestmentThesisScope;
  },
) {
  let query = supabase
    .from("user_investment_theses")
    .select(THESIS_COLUMNS)
    .eq("user_id", userId)
    .eq("symbol", input.symbol)
    .eq("scope", input.scope);

  query = input.portfolioId
    ? query.eq("portfolio_id", input.portfolioId)
    : query.is("portfolio_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data as InvestmentThesisRow | null, error: null };
}

async function loadThesisHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  thesisId: string | null,
  symbol: string,
): Promise<InvestmentThesisHistoryItem[]> {
  let query = supabase
    .from("user_investment_thesis_history")
    .select(
      "id, thesis_id, symbol, portfolio_id, scope, thesis, risks, invalidation_notes, horizon, conviction, change_type, captured_at",
    )
    .eq("user_id", userId);

  query = thesisId ? query.eq("thesis_id", thesisId) : query.eq("symbol", symbol);

  const { data } = await query.order("captured_at", { ascending: false }).limit(5);
  return ((data ?? []) as InvestmentThesisHistoryRow[]).map(mapInvestmentThesisHistoryRow);
}

async function insertThesisHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: InvestmentThesisRow,
  changeType: "created" | "updated" | "deleted",
  userId: string,
) {
  await supabase.from("user_investment_thesis_history").insert({
    thesis_id: row.id,
    user_id: userId,
    portfolio_id: row.portfolio_id,
    scope: row.scope,
    symbol: row.symbol,
    thesis: row.thesis ?? "",
    risks: row.risks ?? [],
    invalidation_notes: row.invalidation_notes ?? "",
    horizon: row.horizon ?? "medium",
    conviction: row.conviction ?? "medium",
    change_type: changeType,
  });
}

export async function getInvestmentThesisState(input: ThesisInput): Promise<ThesisActionResult> {
  const symbol = normalizeThesisSymbol(input.symbol);
  if (!symbol) return { ok: false, error: "Invalid symbol." };

  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const portfolioId = input.portfolioId?.trim() || null;
  const scope = resolveScope({ ...input, portfolioId });
  if (scope === "holding" && !portfolioId) {
    return { ok: false, error: "Portfolio is required." };
  }

  if (portfolioId && !(await canUsePortfolio(supabase, user.id, portfolioId))) {
    return { ok: false, error: "Portfolio not found." };
  }

  const existing = await findExistingThesis(supabase, user.id, {
    symbol,
    portfolioId,
    scope,
  });
  if (existing.error) return { ok: false, error: existing.error };

  return {
    ok: true,
    thesis: existing.data ? mapInvestmentThesisRow(existing.data) : null,
    history: await loadThesisHistory(
      supabase,
      user.id,
      existing.data?.id ?? null,
      symbol,
    ),
  };
}

export async function saveInvestmentThesis(input: SaveThesisInput): Promise<ThesisActionResult> {
  const symbol = normalizeThesisSymbol(input.symbol);
  if (!symbol) return { ok: false, error: "Invalid symbol." };

  const thesis = normalizeThesisText(input.thesis);
  const risks = normalizeRiskList(input.risks);
  const invalidationNotes = normalizeThesisText(input.invalidationNotes);
  const horizon = normalizeThesisHorizon(input.horizon);
  const conviction = normalizeThesisConviction(input.conviction);

  if (!thesis && risks.length === 0 && !invalidationNotes) {
    return { ok: false, error: "Add a thesis, a risk, or a review trigger." };
  }

  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const portfolioId = input.portfolioId?.trim() || null;
  const scope = resolveScope({ ...input, portfolioId });
  if (scope === "holding" && !portfolioId) {
    return { ok: false, error: "Portfolio is required." };
  }

  if (portfolioId && !(await canUsePortfolio(supabase, user.id, portfolioId))) {
    return { ok: false, error: "Portfolio not found." };
  }

  const existing = await findExistingThesis(supabase, user.id, {
    symbol,
    portfolioId,
    scope,
  });
  if (existing.error) return { ok: false, error: existing.error };

  const payload = {
    user_id: user.id,
    portfolio_id: portfolioId,
    scope,
    symbol,
    thesis,
    risks,
    invalidation_notes: invalidationNotes,
    horizon,
    conviction,
  };

  const query = existing.data
    ? supabase
        .from("user_investment_theses")
        .update(payload)
        .eq("id", existing.data.id)
        .eq("user_id", user.id)
        .select(THESIS_COLUMNS)
        .single()
    : supabase
        .from("user_investment_theses")
        .insert(payload)
        .select(THESIS_COLUMNS)
        .single();

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  if (existing.data) {
    await insertThesisHistory(supabase, existing.data, "updated", user.id);
  } else if (data) {
    await insertThesisHistory(supabase, data as InvestmentThesisRow, "created", user.id);
  }

  revalidatePath("/portfolio/full");
  revalidatePath("/watchlist");
  revalidatePath("/feed");
  revalidatePath("/home");

  return {
    ok: true,
    thesis: data ? mapInvestmentThesisRow(data as InvestmentThesisRow) : null,
    history: data
      ? await loadThesisHistory(supabase, user.id, (data as InvestmentThesisRow).id, symbol)
      : [],
  };
}

export async function deleteInvestmentThesis(input: ThesisInput): Promise<ThesisActionResult> {
  const symbol = normalizeThesisSymbol(input.symbol);
  if (!symbol) return { ok: false, error: "Invalid symbol." };

  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const portfolioId = input.portfolioId?.trim() || null;
  const scope = resolveScope({ ...input, portfolioId });
  if (scope === "holding" && !portfolioId) {
    return { ok: false, error: "Portfolio is required." };
  }

  const existing = await findExistingThesis(supabase, user.id, {
    symbol,
    portfolioId,
    scope,
  });
  if (existing.error) return { ok: false, error: existing.error };
  if (!existing.data) return { ok: true, thesis: null };

  const { error } = await supabase
    .from("user_investment_theses")
    .delete()
    .eq("id", existing.data.id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  await insertThesisHistory(supabase, existing.data, "deleted", user.id);

  revalidatePath("/portfolio/full");
  revalidatePath("/watchlist");
  revalidatePath("/feed");
  revalidatePath("/home");

  return {
    ok: true,
    thesis: null,
    history: await loadThesisHistory(supabase, user.id, existing.data.id, symbol),
  };
}
