import type { SupabaseClient } from "@supabase/supabase-js";

export interface RefreshSourceRow {
  fetched: number;
  inserted: number;
  skipped: number;
  failed: number;
  inserted_ids: string[];
  fetch_outcome?: string;
  fetch_error?: string | null;
  fetch_warnings?: string[];
}

type HoldingLike = {
  symbol?: string | null;
  company?: string | null;
};

type FinnhubArticle = {
  category?: string;
  datetime?: number;
  headline?: string;
  id?: number;
  image?: string;
  related?: string;
  source?: string;
  summary?: string;
  url?: string;
};

type PreparedArticle = {
  externalId: string;
  headline: string;
  source: string;
  url: string | null;
  publishedAt: string;
  rawContent: string | null;
  stockTags: string[];
  categoryHint: string;
  metadata: Record<string, unknown>;
  dedupeKey: string;
};

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1/company-news";
const MAX_TARGET_HOLDINGS = 25;

function emptyRow(): RefreshSourceRow {
  return {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
    inserted_ids: [],
  };
}

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(value: string | null | undefined): string {
  const raw = normalizeWhitespace(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    return `${url.origin}${url.pathname}${url.search}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function normalizeHeadline(value: string | null | undefined): string {
  return normalizeWhitespace(value).toLowerCase();
}

function dedupeKeyFrom(headline: string, url: string | null): string {
  const normalizedUrl = normalizeUrl(url);
  if (normalizedUrl) return `url:${normalizedUrl}`;
  return `headline:${normalizeHeadline(headline)}`;
}

function uniqueUpper(values: Iterable<string>): string[] {
  return [...new Set(
    [...values]
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  )];
}

function relatedTickers(related: string | undefined, fallbackSymbol: string): string[] {
  const parsed = (related ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z.\-]{1,10}$/.test(value));
  return uniqueUpper([fallbackSymbol, ...parsed]);
}

function toCategoryHint(category: string | undefined): string {
  const normalized = normalizeHeadline(category);
  if (!normalized) return "other";
  if (normalized.includes("merger") || normalized.includes("acquisition")) return "deals";
  if (normalized.includes("earnings")) return "earnings";
  if (normalized.includes("regulation")) return "regulation";
  if (normalized.includes("forex") || normalized.includes("macro")) return "macro";
  return "other";
}

function mergeMetadata(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  const existingFinnhub = base.finnhub && typeof base.finnhub === "object"
    ? (base.finnhub as Record<string, unknown>)
    : {};
  const incomingFinnhub = incoming.finnhub && typeof incoming.finnhub === "object"
    ? (incoming.finnhub as Record<string, unknown>)
    : {};

  const targetSymbols = uniqueUpper([
    ...((existingFinnhub.targetSymbols as string[] | undefined) ?? []),
    ...((incomingFinnhub.targetSymbols as string[] | undefined) ?? []),
  ]);
  const relatedSymbols = uniqueUpper([
    ...((existingFinnhub.relatedSymbols as string[] | undefined) ?? []),
    ...((incomingFinnhub.relatedSymbols as string[] | undefined) ?? []),
  ]);
  const articleIds = uniqueUpper([
    ...((existingFinnhub.articleIds as string[] | undefined) ?? []),
    ...((incomingFinnhub.articleIds as string[] | undefined) ?? []),
  ]);

  return {
    ...base,
    ...incoming,
    finnhub: {
      ...existingFinnhub,
      ...incomingFinnhub,
      ...(targetSymbols.length > 0 ? { targetSymbols } : {}),
      ...(relatedSymbols.length > 0 ? { relatedSymbols } : {}),
      ...(articleIds.length > 0 ? { articleIds } : {}),
    },
  };
}

async function fetchCompanyNews(
  symbol: string,
  fromDate: string,
  toDate: string,
  apiKey: string,
): Promise<FinnhubArticle[]> {
  const params = new URLSearchParams({
    symbol,
    from: fromDate,
    to: toDate,
    token: apiKey,
  });
  const response = await fetch(`${FINNHUB_BASE_URL}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? (data as FinnhubArticle[]) : [];
}

function prepareArticles(
  holdings: HoldingLike[],
  fetchedBySymbol: Map<string, FinnhubArticle[]>,
): PreparedArticle[] {
  const merged = new Map<string, PreparedArticle>();

  for (const holding of holdings) {
    const symbol = normalizeWhitespace(holding.symbol).toUpperCase();
    if (!symbol) continue;

    for (const article of fetchedBySymbol.get(symbol) ?? []) {
      const headline = normalizeWhitespace(article.headline);
      const publishedAt = typeof article.datetime === "number"
        ? new Date(article.datetime * 1000).toISOString()
        : null;
      if (!headline || !publishedAt) continue;

      const url = normalizeWhitespace(article.url) || null;
      const key = dedupeKeyFrom(headline, url);
      const stockTags = relatedTickers(article.related, symbol);
      const externalId = article.id != null
        ? `finnhub_${article.id}`
        : `finnhub_${symbol}_${Buffer.from(key).toString("base64url").slice(0, 32)}`;

      const metadata = {
        finnhub: {
          category: normalizeWhitespace(article.category) || undefined,
          image: normalizeWhitespace(article.image) || undefined,
          targetSymbols: [symbol],
          relatedSymbols: stockTags,
          articleIds: [String(article.id ?? externalId)],
        },
      };

      const existing = merged.get(key);
      if (existing) {
        existing.stockTags = uniqueUpper([...existing.stockTags, ...stockTags]);
        existing.metadata = mergeMetadata(existing.metadata, metadata);
        if (!existing.rawContent && article.summary) {
          existing.rawContent = normalizeWhitespace(article.summary) || null;
        }
        continue;
      }

      merged.set(key, {
        externalId,
        headline,
        source: normalizeWhitespace(article.source) || "Finnhub",
        url,
        publishedAt,
        rawContent: normalizeWhitespace(article.summary) || null,
        stockTags,
        categoryHint: toCategoryHint(article.category),
        metadata,
        dedupeKey: key,
      });
    }
  }

  return [...merged.values()].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt),
  );
}

export async function ingestFinnhubPortfolioNews(
  supabase: SupabaseClient,
  holdings: HoldingLike[],
  lookbackHours: number,
  maxArticles: number,
): Promise<RefreshSourceRow> {
  const row = emptyRow();
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return {
      ...row,
      fetch_outcome: "skipped",
      fetch_warnings: ["FINNHUB_API_KEY not configured"],
    };
  }

  const targetHoldings = holdings
    .map((holding) => ({
      symbol: normalizeWhitespace(holding.symbol).toUpperCase(),
      company: normalizeWhitespace(holding.company),
    }))
    .filter((holding) => holding.symbol)
    .slice(0, MAX_TARGET_HOLDINGS);

  if (targetHoldings.length === 0) {
    return { ...row, fetch_outcome: "skipped" };
  }

  const now = new Date();
  const from = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  const toDate = now.toISOString().slice(0, 10);
  const fromDate = from.toISOString().slice(0, 10);

  const fetchedBySymbol = new Map<string, FinnhubArticle[]>();

  for (const holding of targetHoldings) {
    try {
      const articles = await fetchCompanyNews(holding.symbol, fromDate, toDate, apiKey);
      fetchedBySymbol.set(holding.symbol, articles);
      row.fetched += articles.length;
    } catch (error) {
      row.failed += 1;
      row.fetch_error = row.fetch_error ?? (error instanceof Error ? error.message : "Finnhub fetch failed");
    }
  }

  if (row.fetched === 0 && row.failed === 0) {
    return { ...row, fetch_outcome: "empty_window" };
  }

  const prepared = prepareArticles(targetHoldings, fetchedBySymbol).slice(0, maxArticles);
  const sinceIso = from.toISOString();
  const { data: existingRows, error: existingError } = await supabase
    .from("news_items")
    .select("id, url, headline, stock_tags, raw_content, category_hint, metadata")
    .gte("published_at", sinceIso)
    .limit(Math.max(200, prepared.length * 4));

  if (existingError) {
    return {
      ...row,
      failed: row.failed + prepared.length,
      fetch_outcome: "failed",
      fetch_error: existingError.message,
    };
  }

  const existingByKey = new Map<string, {
    id: string;
    url: string | null;
    headline: string;
    stock_tags: string[] | null;
    raw_content: string | null;
    category_hint: string | null;
    metadata: Record<string, unknown> | null;
  }>();

  for (const existing of (existingRows ?? []) as Array<{
    id: string;
    url: string | null;
    headline: string;
    stock_tags: string[] | null;
    raw_content: string | null;
    category_hint: string | null;
    metadata: Record<string, unknown> | null;
  }>) {
    existingByKey.set(dedupeKeyFrom(existing.headline, existing.url), existing);
  }

  for (const article of prepared) {
    const existing = existingByKey.get(article.dedupeKey);
    if (existing) {
      const nextStockTags = uniqueUpper([
        ...((existing.stock_tags as string[] | null) ?? []),
        ...article.stockTags,
      ]);
      const nextMetadata = mergeMetadata(existing.metadata, article.metadata);
      const updatePayload: Record<string, unknown> = {};

      if (JSON.stringify(nextStockTags) !== JSON.stringify(existing.stock_tags ?? [])) {
        updatePayload.stock_tags = nextStockTags;
      }
      if (!existing.raw_content && article.rawContent) {
        updatePayload.raw_content = article.rawContent;
      }
      if ((!existing.category_hint || existing.category_hint === "other") && article.categoryHint !== "other") {
        updatePayload.category_hint = article.categoryHint;
      }
      if (JSON.stringify(nextMetadata) !== JSON.stringify(existing.metadata ?? {})) {
        updatePayload.metadata = nextMetadata;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await supabase
          .from("news_items")
          .update(updatePayload)
          .eq("id", existing.id);
        if (updateError) {
          row.failed += 1;
          row.fetch_error = row.fetch_error ?? updateError.message;
          continue;
        }
      }

      row.skipped += 1;
      continue;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("news_items")
      .insert({
        source_type: "finnhub",
        external_id: article.externalId,
        headline: article.headline,
        source: article.source,
        url: article.url,
        published_at: article.publishedAt,
        raw_content: article.rawContent,
        stock_tags: article.stockTags,
        category_hint: article.categoryHint,
        metadata: article.metadata,
        category: "other",
        overall_effect: "neutral",
        ticker_impacts: [],
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      row.failed += 1;
      row.fetch_error = row.fetch_error ?? insertError?.message ?? "Finnhub insert failed";
      continue;
    }

    row.inserted += 1;
    row.inserted_ids.push(inserted.id as string);
  }

  return {
    ...row,
    fetch_outcome:
      row.fetched === 0
        ? "empty_window"
        : row.failed > 0 && row.inserted === 0
          ? "failed"
          : "ok",
  };
}
