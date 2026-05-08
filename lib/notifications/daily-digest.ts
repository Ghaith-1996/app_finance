import "server-only";

import { getAppBaseUrl } from "@/lib/billing/stripe";
import { createLogger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";
import { sanitizeExternalUrl } from "@/lib/security/external-url";
import { resolveDirectStockMatch } from "@/lib/services/news/direct-match";
import type { MatchSource, NewsCategory, StockEffect, TickerImpact } from "@/lib/types";
import { sendDigestEmail, sendDigestSms } from "@/lib/notifications/delivery";
import {
  DAILY_DIGEST_TIME_ZONE,
  type DailyDigestBuildResult,
  type DailyDigestCronRunResult,
  type DailyDigestDeliveryResult,
  type DailyDigestSnapshot,
  type DeliveryChannel,
  type DeliveryStatus,
  type DigestSnapshotStory,
  type DigestSourceMode,
} from "@/lib/notifications/types";
import {
  getDailyDigestWindow,
  isDigestHour,
} from "@/lib/notifications/timezone";

const log = createLogger("daily-digest");
const MAX_DIGEST_STORIES = 10;
const STALE_PENDING_DELIVERY_MS = 10 * 60 * 1000;

type ServiceClient = ReturnType<typeof createServiceClient>;

type PreferenceRow = {
  user_id: string;
  email_digest_enabled: boolean | null;
  sms_digest_enabled: boolean | null;
  phone_number: string | null;
};

type PortfolioRow = {
  id: string;
  name: string;
};

type AnalysisRunRow = {
  id: string;
  portfolio_id: string;
  completed_at: string | null;
};

type FeedDigestRow = {
  relevance_score: number | null;
  ai_summary: string | null;
  why_it_matters: string | null;
  matched_stock_tags: string[] | null;
  holdings: string[] | null;
  match_sources: MatchSource[] | null;
  display_effect: string | null;
  news_items:
    | {
        id: string;
        headline: string;
        source: string;
        url: string | null;
        published_at: string;
        category: string | null;
        ticker_impacts: TickerImpact[] | null;
      }
    | Array<{
        id: string;
        headline: string;
        source: string;
        url: string | null;
        published_at: string;
        category: string | null;
        ticker_impacts: TickerImpact[] | null;
      }>
    | null;
};

type WatchlistNewsRow = {
  id: string;
  headline: string;
  source: string;
  url: string | null;
  published_at: string;
  category: string | null;
  stock_tags: string[] | null;
  ticker_impacts: TickerImpact[] | null;
  overall_effect: string | null;
  global_summary: string | null;
};

type DigestRow = {
  id: string;
  user_id: string;
  digest_date: string;
  time_zone: string;
  window_start: string;
  window_end: string;
  source_mode: DigestSourceMode;
  portfolio_id: string | null;
  portfolio_name: string | null;
  summary_line: string;
  bullish_symbols: string[] | null;
  bearish_symbols: string[] | null;
  top_stories: unknown;
  created_at: string;
};

type DeliveryRow = {
  id: string;
  digest_id: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  provider_message_id: string | null;
  error_text: string | null;
  updated_at: string;
};

type DigestRecipient = {
  userId: string;
  emailDigestEnabled: boolean;
  smsDigestEnabled: boolean;
  phoneNumber: string;
};

type DeliveryAttemptDecision =
  | { action: "send" }
  | { action: "skip"; resultStatus: "skipped" | "uncertain" };

export function shouldRunDailyDigestCronAt(now: Date): boolean {
  return isDigestHour(now, DAILY_DIGEST_TIME_ZONE);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))];
}

function sortStories<T extends { publishedAt: string; relevanceScore: number | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((left, right) => {
    const relevanceCompare = (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0);
    if (relevanceCompare !== 0) return relevanceCompare;
    return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
  });
}

function sortRecentStories<T extends { publishedAt: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
  );
}

function summarizeSymbols(
  counts: Map<string, number>,
): string[] {
  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .slice(0, 3)
    .map(([symbol]) => symbol);
}

function buildSummary(stories: DigestSnapshotStory[]): {
  summaryLine: string;
  bullishSymbols: string[];
  bearishSymbols: string[];
} {
  const bullishCounts = new Map<string, number>();
  const bearishCounts = new Map<string, number>();

  for (const story of stories) {
    for (const symbol of story.matchedSymbols) {
      const effect = story.symbolEffects[symbol] ?? story.displayEffect;
      if (effect === "bullish") {
        bullishCounts.set(symbol, (bullishCounts.get(symbol) ?? 0) + 1);
      } else if (effect === "bearish") {
        bearishCounts.set(symbol, (bearishCounts.get(symbol) ?? 0) + 1);
      }
    }
  }

  const bullishSymbols = summarizeSymbols(bullishCounts);
  const bearishSymbols = summarizeSymbols(bearishCounts);

  return {
    summaryLine:
      `Bullish leaders: ${bullishSymbols.join(", ") || "none"}. ` +
      `Bearish leaders: ${bearishSymbols.join(", ") || "none"}.`,
    bullishSymbols,
    bearishSymbols,
  };
}

function buildSymbolEffects(
  impacts: TickerImpact[] | null | undefined,
  matchedSymbols: string[],
  fallbackEffect: StockEffect,
): Record<string, StockEffect> {
  const impactMap = new Map<string, StockEffect>();
  for (const impact of impacts ?? []) {
    const symbol = String(impact.symbol ?? "").toUpperCase();
    if (symbol && impact.effect) {
      impactMap.set(symbol, impact.effect);
    }
  }

  return Object.fromEntries(
    matchedSymbols.map((symbol) => [symbol, impactMap.get(symbol) ?? fallbackEffect]),
  );
}

function castCategory(value: string | null | undefined): NewsCategory {
  return (value ?? "other") as NewsCategory;
}

function normalizeMatchSources(value: MatchSource[] | null | undefined): MatchSource[] {
  return Array.isArray(value) && value.length > 0 ? value : ["portfolio"];
}

function mapPortfolioStory(row: FeedDigestRow): DigestSnapshotStory | null {
  const news = Array.isArray(row.news_items) ? row.news_items[0] ?? null : row.news_items;
  if (!news) return null;

  const matchedSymbols = uniqueSorted([
    ...(row.matched_stock_tags ?? []),
    ...(row.holdings ?? []),
  ]);
  if (matchedSymbols.length === 0) return null;

  const fallbackEffect = (row.display_effect ?? "neutral") as StockEffect;
  const symbolEffects = buildSymbolEffects(
    news.ticker_impacts ?? [],
    matchedSymbols,
    fallbackEffect,
  );

  return {
    newsItemId: news.id,
    headline: news.headline,
    source: news.source,
    url: sanitizeExternalUrl(news.url),
    publishedAt: news.published_at,
    category: castCategory(news.category),
    relevanceScore: row.relevance_score ?? 0,
    aiSummary: row.ai_summary ?? "",
    whyItMatters: row.why_it_matters ?? "",
    matchedSymbols,
    symbolEffects,
    matchSources: normalizeMatchSources(row.match_sources),
    displayEffect: fallbackEffect,
  };
}

function mapWatchlistStory(
  row: WatchlistNewsRow,
  watchlistSymbols: string[],
): DigestSnapshotStory | null {
  const directMatch = resolveDirectStockMatch(
    row.stock_tags ?? [],
    row.ticker_impacts ?? [],
    watchlistSymbols,
  );
  if (directMatch.matchedSymbols.length === 0) return null;

  const matchedSymbols = uniqueSorted(directMatch.matchedSymbols);
  const fallbackEffect = (row.overall_effect ?? "neutral") as StockEffect;
  const symbolEffects = buildSymbolEffects(
    row.ticker_impacts ?? [],
    matchedSymbols,
    fallbackEffect,
  );

  return {
    newsItemId: row.id,
    headline: row.headline,
    source: row.source,
    url: sanitizeExternalUrl(row.url),
    publishedAt: row.published_at,
    category: castCategory(row.category),
    relevanceScore: null,
    aiSummary: row.global_summary ?? "",
    whyItMatters:
      matchedSymbols.length > 0
        ? `Matches watchlist symbol${matchedSymbols.length > 1 ? "s" : ""} ${matchedSymbols.join(", ")}.`
        : "",
    matchedSymbols,
    symbolEffects,
    matchSources: ["watchlist"],
    displayEffect: fallbackEffect,
  };
}

function mapDigestRow(row: DigestRow): DailyDigestSnapshot {
  return {
    id: row.id,
    userId: row.user_id,
    digestDate: row.digest_date,
    timeZone: row.time_zone,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    sourceMode: row.source_mode,
    portfolioId: row.portfolio_id,
    portfolioName: row.portfolio_name,
    summaryLine: row.summary_line,
    bullishSymbols: row.bullish_symbols ?? [],
    bearishSymbols: row.bearish_symbols ?? [],
    topStories: Array.isArray(row.top_stories)
      ? (row.top_stories as DigestSnapshotStory[])
      : [],
    createdAt: row.created_at,
  };
}

async function loadDigestRecipients(supabase: ServiceClient): Promise<DigestRecipient[]> {
  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select("user_id, email_digest_enabled, sms_digest_enabled, phone_number");

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as PreferenceRow[])
    .map((row) => ({
      userId: row.user_id,
      emailDigestEnabled: Boolean(row.email_digest_enabled),
      smsDigestEnabled: Boolean(row.sms_digest_enabled),
      phoneNumber: row.phone_number?.trim() ?? "",
    }))
    .filter((row) => row.emailDigestEnabled || row.smsDigestEnabled);
}

async function loadExistingDigest(
  supabase: ServiceClient,
  userId: string,
  digestDate: string,
): Promise<DailyDigestSnapshot | null> {
  const { data, error } = await supabase
    .from("notification_digests")
    .select("*")
    .eq("user_id", userId)
    .eq("digest_date", digestDate)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapDigestRow(data as DigestRow) : null;
}

async function loadUserPortfolios(
  supabase: ServiceClient,
  userId: string,
): Promise<PortfolioRow[]> {
  const { data, error } = await supabase
    .from("portfolios")
    .select("id, name")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as PortfolioRow[];
}

async function loadLatestAnalysisRun(
  supabase: ServiceClient,
  portfolioIds: string[],
): Promise<AnalysisRunRow | null> {
  const { data, error } = await supabase
    .from("analysis_runs")
    .select("id, portfolio_id, completed_at")
    .in("portfolio_id", portfolioIds)
    .in("status", ["complete", "degraded"])
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as AnalysisRunRow | null) ?? null;
}

async function loadPortfolioStories(
  supabase: ServiceClient,
  run: AnalysisRunRow,
  windowStartIso: string,
  windowEndIso: string,
): Promise<DigestSnapshotStory[]> {
  const { data, error } = await supabase
    .from("feed_items")
    .select(`
      relevance_score,
      ai_summary,
      why_it_matters,
      matched_stock_tags,
      holdings,
      match_sources,
      display_effect,
      news_items!inner (
        id,
        headline,
        source,
        url,
        published_at,
        category,
        ticker_impacts
      )
    `)
    .eq("analysis_run_id", run.id)
    .eq("portfolio_id", run.portfolio_id)
    .gte("news_items.published_at", windowStartIso)
    .lte("news_items.published_at", windowEndIso);

  if (error) {
    throw new Error(error.message);
  }

  return sortStories(
    ((data ?? []) as unknown as FeedDigestRow[])
      .map(mapPortfolioStory)
      .filter((row): row is DigestSnapshotStory => row !== null),
  ).slice(0, MAX_DIGEST_STORIES);
}

async function loadWatchlistStories(
  supabase: ServiceClient,
  userId: string,
  windowStartIso: string,
  windowEndIso: string,
): Promise<DigestSnapshotStory[]> {
  const { data: watchlistRows, error: watchlistError } = await supabase
    .from("watchlist_items")
    .select("symbol")
    .eq("user_id", userId);

  if (watchlistError) {
    throw new Error(watchlistError.message);
  }

  const watchlistSymbols = uniqueSorted(
    (watchlistRows ?? []).map((row) => String(row.symbol ?? "")),
  );
  if (watchlistSymbols.length === 0) {
    return [];
  }

  const { data: newsRows, error: newsError } = await supabase
    .from("news_items")
    .select(
      "id, headline, source, url, published_at, category, stock_tags, ticker_impacts, overall_effect, global_summary",
    )
    .gte("published_at", windowStartIso)
    .lte("published_at", windowEndIso)
    .order("published_at", { ascending: false });

  if (newsError) {
    throw new Error(newsError.message);
  }

  return sortRecentStories(
    ((newsRows ?? []) as WatchlistNewsRow[])
      .map((row) => mapWatchlistStory(row, watchlistSymbols))
      .filter((row): row is DigestSnapshotStory => row !== null),
  ).slice(0, MAX_DIGEST_STORIES);
}

async function insertDigestSnapshot(
  supabase: ServiceClient,
  input: Omit<DailyDigestSnapshot, "id" | "createdAt">,
): Promise<DailyDigestSnapshot> {
  const payload = {
    user_id: input.userId,
    digest_date: input.digestDate,
    time_zone: input.timeZone,
    window_start: input.windowStart,
    window_end: input.windowEnd,
    source_mode: input.sourceMode,
    portfolio_id: input.portfolioId,
    portfolio_name: input.portfolioName,
    summary_line: input.summaryLine,
    bullish_symbols: input.bullishSymbols,
    bearish_symbols: input.bearishSymbols,
    top_stories: input.topStories,
  };

  const { data, error } = await supabase
    .from("notification_digests")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const existing = await loadExistingDigest(supabase, input.userId, input.digestDate);
      if (existing) return existing;
    }
    throw new Error(error.message);
  }

  return mapDigestRow(data as DigestRow);
}

export async function buildDailyDigestSnapshotForUser(input: {
  supabase?: ServiceClient;
  userId: string;
  now?: Date;
}): Promise<DailyDigestBuildResult> {
  const supabase = input.supabase ?? createServiceClient();
  const now = input.now ?? new Date();
  const { digestDate, windowStart, windowEnd } = getDailyDigestWindow(
    now,
    DAILY_DIGEST_TIME_ZONE,
  );

  const existing = await loadExistingDigest(supabase, input.userId, digestDate);
  if (existing) {
    return { kind: "ready", digest: existing, created: false };
  }

  const portfolios = await loadUserPortfolios(supabase, input.userId);
  let stories: DigestSnapshotStory[] = [];
  let sourceMode: DigestSourceMode = "watchlist";
  let portfolioId: string | null = null;
  let portfolioName: string | null = null;

  if (portfolios.length > 0) {
    const portfolioMap = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.name]));
    const latestRun = await loadLatestAnalysisRun(
      supabase,
      portfolios.map((portfolio) => portfolio.id),
    );
    if (!latestRun) {
      return { kind: "empty", reason: "No complete portfolio analysis is available." };
    }

    stories = await loadPortfolioStories(
      supabase,
      latestRun,
      windowStart.toISOString(),
      windowEnd.toISOString(),
    );
    sourceMode = "portfolio";
    portfolioId = latestRun.portfolio_id;
    portfolioName = portfolioMap.get(latestRun.portfolio_id) ?? null;
  } else {
    stories = await loadWatchlistStories(
      supabase,
      input.userId,
      windowStart.toISOString(),
      windowEnd.toISOString(),
    );
    sourceMode = "watchlist";
  }

  if (stories.length === 0) {
    return { kind: "empty", reason: "No matched stories were found in the overnight window." };
  }

  const summary = buildSummary(stories);
  const digest = await insertDigestSnapshot(supabase, {
    userId: input.userId,
    digestDate,
    timeZone: DAILY_DIGEST_TIME_ZONE,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    sourceMode,
    portfolioId,
    portfolioName,
    summaryLine: summary.summaryLine,
    bullishSymbols: summary.bullishSymbols,
    bearishSymbols: summary.bearishSymbols,
    topStories: stories,
  });

  return { kind: "ready", digest, created: true };
}

async function loadUserEmail(
  supabase: ServiceClient,
  userId: string,
): Promise<string | null> {
  const result = await supabase.auth.admin.getUserById(userId);
  return result.data.user?.email ?? null;
}

async function loadDelivery(
  supabase: ServiceClient,
  digestId: string,
  channel: DeliveryChannel,
): Promise<DeliveryRow | null> {
  const { data, error } = await supabase
    .from("notification_deliveries")
    .select("id, digest_id, channel, status, provider_message_id, error_text, updated_at")
    .eq("digest_id", digestId)
    .eq("channel", channel)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as DeliveryRow | null) ?? null;
}

function isStalePending(row: DeliveryRow): boolean {
  if (row.status !== "pending") return false;
  return Date.now() - new Date(row.updated_at).getTime() > STALE_PENDING_DELIVERY_MS;
}

async function markDeliveryStatus(
  supabase: ServiceClient,
  digestId: string,
  channel: DeliveryChannel,
  status: DeliveryStatus,
  providerMessageId: string | null,
  errorText: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("notification_deliveries")
    .upsert(
      {
        digest_id: digestId,
        channel,
        status,
        provider_message_id: providerMessageId,
        error_text: errorText,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      },
      { onConflict: "digest_id,channel" },
    );

  if (error) {
    throw new Error(error.message);
  }
}

async function beginDeliveryAttempt(
  supabase: ServiceClient,
  digestId: string,
  channel: DeliveryChannel,
): Promise<DeliveryAttemptDecision> {
  const existing = await loadDelivery(supabase, digestId, channel);
  if (!existing) {
    await markDeliveryStatus(supabase, digestId, channel, "pending", null, null);
    return { action: "send" };
  }

  if (channel === "sms") {
    if (existing.status === "pending" && isStalePending(existing)) {
      await markDeliveryStatus(
        supabase,
        digestId,
        channel,
        "uncertain",
        existing.provider_message_id,
        existing.error_text ??
          "SMS delivery state became stale before confirmation; automatic resend was blocked to avoid duplicates.",
      );
      return { action: "skip", resultStatus: "uncertain" };
    }

    return { action: "skip", resultStatus: "skipped" };
  }

  if (
    existing.status === "sent" ||
    existing.status === "skipped" ||
    existing.status === "uncertain"
  ) {
    return { action: "skip", resultStatus: "skipped" };
  }

  if (existing.status === "pending" && !isStalePending(existing)) {
    return { action: "skip", resultStatus: "skipped" };
  }

  await markDeliveryStatus(supabase, digestId, channel, "pending", null, null);
  return { action: "send" };
}

async function deliverChannel(input: {
  supabase: ServiceClient;
  digest: DailyDigestSnapshot;
  channel: DeliveryChannel;
  email?: string | null;
  phoneNumber?: string | null;
  baseUrl: string;
}): Promise<DailyDigestDeliveryResult> {
  const decision = await beginDeliveryAttempt(
    input.supabase,
    input.digest.id,
    input.channel,
  );
  if (decision.action === "skip") {
    const existing = await loadDelivery(input.supabase, input.digest.id, input.channel);
    return {
      channel: input.channel,
      status: decision.resultStatus,
      digestId: input.digest.id,
      providerMessageId: existing?.provider_message_id ?? null,
      errorText: existing?.error_text ?? null,
    };
  }

  try {
    const result =
      input.channel === "email"
        ? await sendDigestEmail({
            digest: input.digest,
            email: input.email,
            baseUrl: input.baseUrl,
          })
        : await sendDigestSms({
            digest: input.digest,
            phoneNumber: input.phoneNumber,
            baseUrl: input.baseUrl,
          });

    await markDeliveryStatus(
      input.supabase,
      input.digest.id,
      input.channel,
      result.status,
      result.providerMessageId,
      result.errorText,
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markDeliveryStatus(
      input.supabase,
      input.digest.id,
      input.channel,
      "failed",
      null,
      message,
    );
    return {
      channel: input.channel,
      status: "failed",
      digestId: input.digest.id,
      providerMessageId: null,
      errorText: message,
    };
  }
}

export async function runDailyDigestCron(input?: {
  now?: Date;
  baseUrl?: string;
  request?: Request;
  supabase?: ServiceClient;
}): Promise<DailyDigestCronRunResult> {
  const supabase = input?.supabase ?? createServiceClient();
  const now = input?.now ?? new Date();
  const baseUrl = input?.baseUrl ?? getAppBaseUrl(input?.request);
  const { digestDate } = getDailyDigestWindow(now, DAILY_DIGEST_TIME_ZONE);

  if (!shouldRunDailyDigestCronAt(now)) {
    return {
      ran: false,
      skipped: true,
      reason: "Current America/New_York hour is not 9 AM.",
      digestDate,
      timeZone: DAILY_DIGEST_TIME_ZONE,
      processedUsers: 0,
      createdDigests: 0,
      sentEmail: 0,
      sentSms: 0,
      skippedDeliveries: 0,
      failedDeliveries: 0,
      uncertainDeliveries: 0,
    };
  }

  const recipients = await loadDigestRecipients(supabase);
  let createdDigests = 0;
  let sentEmail = 0;
  let sentSms = 0;
  let skippedDeliveries = 0;
  let failedDeliveries = 0;
  let uncertainDeliveries = 0;

  for (const recipient of recipients) {
    const digestResult = await buildDailyDigestSnapshotForUser({
      supabase,
      userId: recipient.userId,
      now,
    });

    if (digestResult.kind !== "ready" || !digestResult.digest) {
      log.info("Daily digest skipped for user", {
        userId: recipient.userId,
        reason: digestResult.reason ?? "No digest available.",
      });
      continue;
    }

    const digest = digestResult.digest;
    if (digestResult.created) {
      createdDigests += 1;
    }

    const email = recipient.emailDigestEnabled
      ? await loadUserEmail(supabase, recipient.userId)
      : null;

    const deliveryResults: DailyDigestDeliveryResult[] = [];
    if (recipient.emailDigestEnabled) {
      deliveryResults.push(
        await deliverChannel({
          supabase,
          digest,
          channel: "email",
          email,
          baseUrl,
        }),
      );
    }

    if (recipient.smsDigestEnabled) {
      deliveryResults.push(
        await deliverChannel({
          supabase,
          digest,
          channel: "sms",
          phoneNumber: recipient.phoneNumber,
          baseUrl,
        }),
      );
    }

    for (const result of deliveryResults) {
      if (result.status === "sent") {
        if (result.channel === "email") sentEmail += 1;
        if (result.channel === "sms") sentSms += 1;
      } else if (result.status === "uncertain") {
        uncertainDeliveries += 1;
      } else if (result.status === "failed") {
        failedDeliveries += 1;
      } else {
        skippedDeliveries += 1;
      }
    }
  }

  return {
    ran: true,
    skipped: false,
    reason: null,
    digestDate,
    timeZone: DAILY_DIGEST_TIME_ZONE,
    processedUsers: recipients.length,
    createdDigests,
    sentEmail,
    sentSms,
    skippedDeliveries,
    failedDeliveries,
    uncertainDeliveries,
  };
}
